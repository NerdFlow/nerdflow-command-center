import { prisma } from "@/server/db";
import type { CampaignStrategy } from "@/server/strategy";

const HOT_THRESHOLD = 70;

/**
 * Focus mode / Today ordering (SPEC 5.4): hot leads first, then due
 * follow-ups by step, then new. Skipped leads get next_touch_at pushed
 * later, so they naturally fall to the back without extra state.
 */
export async function getQueueForUser(ownerId: string, limit = 50) {
  const now = new Date();

  const [hot, dueFollowUps, fresh] = await Promise.all([
    prisma.lead.findMany({
      where: { ownerId, status: { in: ["queued", "in_cadence"] }, fitScore: { gte: HOT_THRESHOLD } },
      orderBy: { fitScore: "desc" },
      include: { campaign: { include: { product: true } } },
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
      include: { campaign: { include: { product: true } } },
      take: limit,
    }),
    prisma.lead.findMany({
      where: { ownerId, status: "queued", fitScore: { lt: HOT_THRESHOLD } },
      orderBy: { createdAt: "asc" },
      include: { campaign: { include: { product: true } } },
      take: limit,
    }),
  ]);

  const seen = new Set<string>();
  const ordered = [...hot, ...dueFollowUps, ...fresh].filter((lead) => {
    if (seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  });

  return ordered.slice(0, limit).map((lead) => {
    const strategy = lead.campaign.strategy as unknown as CampaignStrategy;
    const step = strategy?.cadence?.[lead.cadenceStep] ?? strategy?.cadence?.[0];
    const label = lead.fitScore >= HOT_THRESHOLD ? "Hot" : lead.cadenceStep > 0 ? `Follow-up ${lead.cadenceStep}` : "New";
    return { lead, campaign: lead.campaign, step, label };
  });
}
