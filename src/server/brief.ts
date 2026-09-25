import { prisma } from "@/server/db";
import type { User } from "@prisma/client";
import { computeFlags } from "@/server/deals";
import { getPacing } from "@/server/targets";

/**
 * Rule-based morning brief (SPEC 5.3). AI's "Get a sharper brief" reuses this
 * same data as the prompt input — it never invents numbers of its own.
 */
export async function buildBrief(user: User) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [queueCount, followUpCount, hotLead, myDeals, pausedCampaigns, openReplies, inboxCount, pacing, rule] =
    await Promise.all([
      prisma.lead.count({
        where: { ownerId: user.id, status: "queued", organizationId: user.organizationId },
      }),
      prisma.lead.count({
        where: {
          ownerId: user.id,
          status: "in_cadence",
          organizationId: user.organizationId,
          nextTouchAt: { lte: today },
        },
      }),
      prisma.lead.findFirst({
        where: {
          ownerId: user.id,
          organizationId: user.organizationId,
          status: { in: ["queued", "in_cadence"] },
        },
        orderBy: { fitScore: "desc" },
      }),
      prisma.deal.findMany({
        where: {
          ownerId: user.id,
          organizationId: user.organizationId,
          stage: { notIn: ["won", "lost"] },
        },
        include: { people: true, lead: true },
      }),
      user.role === "rep"
        ? []
        : prisma.campaign.findMany({
            where: { organizationId: user.organizationId, status: "paused" },
            select: { name: true, pausedReason: true },
          }),
      prisma.reply.count({ where: { status: "open", lead: { ownerId: user.id, organizationId: user.organizationId } } }),
      prisma.lead.count({ where: { ownerId: user.id, organizationId: user.organizationId, status: "inbox" } }),
      getPacing(user),
      prisma.coachingRule.findFirst({
        where: { userId: user.id, status: "active" },
        orderBy: { weekStart: "desc" },
      }),
    ]);

  const dealsNeedingAttention = myDeals
    .map((deal) => ({
      deal,
      flags: computeFlags({
        stage: deal.stage,
        lastActivityAt: deal.updatedAt,
        nextStepAt: deal.nextStepAt,
        people: deal.people,
      }),
    }))
    .filter((d) => d.flags.length > 0)
    .slice(0, 2);

  const lines: string[] = [];

  if (queueCount + followUpCount > 0) {
    lines.push(
      `You have ${queueCount} new lead${queueCount === 1 ? "" : "s"} queued and ${followUpCount} follow-up${
        followUpCount === 1 ? "" : "s"
      } due today.`,
    );
  } else {
    lines.push("Your queue is clear for now — check back after the next lead engine run.");
  }

  if (hotLead) {
    const evidence = Object.entries((hotLead.signals as Record<string, unknown>) ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => k.replace(/_/g, " "))
      .slice(0, 2)
      .join(", ");
    lines.push(
      `Top lead: ${hotLead.businessName}${hotLead.city ? ` in ${hotLead.city}` : ""} — fit score ${hotLead.fitScore}${
        evidence ? `, signals: ${evidence}` : ""
      }.`,
    );
  }

  for (const { deal, flags } of dealsNeedingAttention) {
    lines.push(`Deal needs attention: ${deal.lead.businessName} — ${flags.map((f) => f.label).join(", ")}.`);
  }

  if (pausedCampaigns.length > 0) {
    for (const c of pausedCampaigns) {
      lines.push(`Campaign paused: ${c.name}${c.pausedReason ? ` — ${c.pausedReason}` : ""}.`);
    }
  }

  if (openReplies > 0) {
    lines.push(`${openReplies} ${openReplies === 1 ? "person" : "people"} replied and ${openReplies === 1 ? "is" : "are"} waiting on you.`);
  }

  if (inboxCount > 0) {
    lines.push(`${inboxCount} lead${inboxCount === 1 ? "" : "s"} waiting in your inbox for review.`);
  }

  lines.push(`You're at ${pacing.overallPct}% of today's target${pacing.streak ? `, ${pacing.streak}-day streak` : ""}.`);

  if (rule) {
    lines.push(`This week's rule: ${rule.ruleText}`);
  }

  return { lines, pacing };
}
