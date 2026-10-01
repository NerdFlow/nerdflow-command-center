import { prisma } from "@/server/db";
import {
  campaignAllowedChannels,
  leadNeedsChannelRealign,
  resolveLeadChannel,
} from "@/server/cadence";
import type { CampaignStrategy } from "@/server/strategy";
import type { Channel } from "@prisma/client";

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
 * For email-only (or otherwise channel-restricted) campaigns whose cadence
 * still has a disallowed Day-0 call: move the lead to the first allowed
 * cadence step. Mixed-campaign leads already on a call step are left alone.
 */
async function realignDisallowedChannelLeads(
  leads: Array<{
    id: string;
    cadenceStep: number;
    nextChannelOverride: Channel | null;
    campaign: { strategy: unknown };
  }>,
) {
  const updates: Promise<unknown>[] = [];
  for (const lead of leads) {
    const strategy = lead.campaign.strategy as unknown as CampaignStrategy;
    if (!leadNeedsChannelRealign({ strategy, cadenceStep: lead.cadenceStep, nextChannelOverride: lead.nextChannelOverride })) {
      continue;
    }
    const allowed = campaignAllowedChannels(strategy);
    const cadence = strategy?.cadence ?? [];

    // Clear a stale override that points at a disallowed channel.
    if (lead.nextChannelOverride && !allowed.includes(lead.nextChannelOverride)) {
      const channel = resolveLeadChannel({ strategy, cadenceStep: lead.cadenceStep, nextChannelOverride: null });
      const stepIdx = Math.max(
        0,
        cadence.findIndex((s, i) => i >= lead.cadenceStep && s.channel === channel),
      );
      const idx = stepIdx >= 0 ? stepIdx : cadence.findIndex((s) => s.channel === channel);
      updates.push(
        prisma.lead.update({
          where: { id: lead.id },
          data: {
            nextChannelOverride: null,
            cadenceStep: idx >= 0 ? idx : lead.cadenceStep,
          },
        }),
      );
      lead.nextChannelOverride = null;
      if (idx >= 0) lead.cadenceStep = idx;
      continue;
    }

    const stepChannel = cadence[lead.cadenceStep]?.channel;
    if (stepChannel && !allowed.includes(stepChannel)) {
      const idx = cadence.findIndex((s) => allowed.includes(s.channel));
      if (idx >= 0 && idx !== lead.cadenceStep) {
        updates.push(
          prisma.lead.update({
            where: { id: lead.id },
            data: { cadenceStep: idx, nextChannelOverride: null },
          }),
        );
        lead.cadenceStep = idx;
        lead.nextChannelOverride = null;
      } else if (idx < 0) {
        // No allowed step in cadence — override to first allowed channel.
        const channel = allowed[0] ?? "email";
        updates.push(
          prisma.lead.update({
            where: { id: lead.id },
            data: { nextChannelOverride: channel },
          }),
        );
        lead.nextChannelOverride = channel;
      }
    }
  }
  if (updates.length > 0) await Promise.all(updates);
}

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
      where: { ownerId, status: "queued", fitScore: { lt: HOT_THRESHOLD } },
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

  const sliced = ordered.slice(0, limit);
  await realignDisallowedChannelLeads(sliced);

  return sliced.map((lead) => {
    const strategy = lead.campaign.strategy as unknown as CampaignStrategy;
    const channel = resolveLeadChannel({
      strategy,
      cadenceStep: lead.cadenceStep,
      nextChannelOverride: lead.nextChannelOverride,
    });
    const step =
      strategy?.cadence?.find((s, i) => i >= lead.cadenceStep && s.channel === channel) ??
      strategy?.cadence?.find((s) => s.channel === channel) ??
      strategy?.cadence?.[lead.cadenceStep] ??
      strategy?.cadence?.[0];
    const label = lead.fitScore >= HOT_THRESHOLD ? "Hot" : lead.cadenceStep > 0 ? `Follow-up ${lead.cadenceStep}` : "New";
    return { lead, campaign: lead.campaign, step, label, channel };
  });
}
