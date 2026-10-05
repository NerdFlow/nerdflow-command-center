import { parseChannelsWorked } from "@/lib/focusRouting";
import { prisma } from "@/server/db";
import { alignQueueCadence } from "@/server/focusCadenceSchedule";
import type { CampaignStrategy } from "@/server/strategy";

const HOT_THRESHOLD = 70;

const queueInclude = {
  campaign: { include: { product: true } },
  touches: {
    orderBy: { occurredAt: "desc" as const },
    take: 1,
    select: { channel: true, outcome: true, occurredAt: true },
  },
};

/**
 * Focus ordering: hot leads first, then due follow-ups, then new.
 * A follow-up stays off the board until its Asia/Karachi day, hot score included.
 */
export async function getQueueForUser(ownerId: string, limit = 50) {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { organizationId: true, channelsWorked: true },
  });
  if (!user) return [];
  const dueNow = [{ nextTouchAt: null }, { nextTouchAt: { lte: now } }];

  const [hot, dueFollowUps, fresh] = await Promise.all([
    prisma.lead.findMany({
      where: {
        ownerId,
        fitScore: { gte: HOT_THRESHOLD },
        OR: [
          { status: "queued", OR: dueNow },
          { status: "in_cadence", nextTouchAt: { lte: now } },
        ],
      },
      orderBy: { fitScore: "desc" },
      include: queueInclude,
      take: limit,
    }),
    prisma.lead.findMany({
      where: {
        ownerId,
        status: "in_cadence",
        fitScore: { lt: HOT_THRESHOLD },
        nextTouchAt: { lte: now },
      },
      orderBy: [{ cadenceStep: "asc" }, { nextTouchAt: "asc" }],
      include: queueInclude,
      take: limit,
    }),
    prisma.lead.findMany({
      where: { ownerId, status: "queued", fitScore: { lt: HOT_THRESHOLD }, OR: dueNow },
      orderBy: { createdAt: "asc" },
      include: queueInclude,
      take: limit,
    }),
  ]);

  const seen = new Set<string>();
  const ordered = [...hot, ...dueFollowUps, ...fresh].filter((lead) => {
    if (seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  });

  const aligned = await alignQueueCadence(user.organizationId, parseChannelsWorked(user.channelsWorked), ordered.slice(0, limit));

  return aligned.map((lead) => {
    const strategy = lead.campaign.strategy as unknown as CampaignStrategy;
    const step = strategy?.cadence?.[lead.cadenceStep] ?? strategy?.cadence?.[0];
    const label = lead.fitScore >= HOT_THRESHOLD ? "Hot" : lead.cadenceStep > 0 ? `Follow-up ${lead.cadenceStep}` : "New";
    return { lead, campaign: lead.campaign, step, label, channel: lead.dueChannel, dueChannel: lead.dueChannel };
  });
}
