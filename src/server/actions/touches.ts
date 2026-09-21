"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { scheduleNextTouch, type WorkingHours } from "@/server/cadence";
import { incrementDailyCount } from "@/server/targets";
import { writeAuditLog } from "@/server/audit";
import type { CampaignStrategy } from "@/server/strategy";
import type { Channel, TouchOutcome } from "@prisma/client";

const CONVERSATION_KIND_BY_CHANNEL: Record<Channel, "call" | "email_in" | "dm_in"> = {
  call: "call",
  email: "email_in",
  instagram: "dm_in",
  linkedin: "dm_in",
};

export async function logTouchOutcome(params: {
  leadId: string;
  channel: Channel;
  outcome: TouchOutcome;
  pastedMessage?: string;
}) {
  const user = await requireUser();
  const leadOrNull = await prisma.lead.findFirst({
    where: { id: params.leadId, organizationId: user.organizationId },
    include: { campaign: true, owner: true },
  });
  if (!leadOrNull) throw new Error("Lead not found");
  const lead = leadOrNull;

  const now = new Date();
  const step = lead.cadenceStep;

  // Applies the status/stage change for this outcome. Independent of the
  // touch record and audit log below, so it runs in the same parallel batch
  // instead of after them.
  async function applyOutcomeEffect(): Promise<string | null> {
    if (params.outcome === "interested") {
      const existingOpenDeal = await prisma.deal.findFirst({
        where: { leadId: lead.id, stage: { notIn: ["won", "lost"] } },
      });
      const deal =
        existingOpenDeal ??
        (await prisma.deal.create({
          data: {
            organizationId: user.organizationId,
            leadId: lead.id,
            ownerId: lead.ownerId,
            productId: lead.campaign.productId,
            campaignId: lead.campaignId,
            stage: "interested",
          },
        }));
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "deal" } });
      return deal.id;
    }
    if (params.outcome === "not_fit") {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "not_fit" } });
      return null;
    }
    if (params.outcome === "replied") {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "replied" } });
      return null;
    }

    // sent / no_answer / talked_not_now — advance the cadence
    const strategy = lead.campaign.strategy as unknown as CampaignStrategy;
    const cadence = strategy?.cadence ?? [];
    const currentStepDef = cadence[step];
    const nextStepDef = cadence[step + 1];

    if (!nextStepDef) {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "finished" } });
    } else {
      const dayDelta = nextStepDef.day - (currentStepDef?.day ?? 0);
      const nextTouchAt = scheduleNextTouch({
        occurredAt: now,
        dayDelta,
        timezone: lead.owner.timezone,
        workingHours: lead.owner.workingHours as unknown as WorkingHours,
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "in_cadence", cadenceStep: step + 1, nextTouchAt },
      });
    }
    return null;
  }

  const [, , dealId] = await Promise.all([
    prisma.touch.create({
      data: {
        organizationId: user.organizationId,
        leadId: lead.id,
        userId: user.id,
        channel: params.channel,
        step,
        outcome: params.outcome,
        occurredAt: now,
      },
    }),
    incrementDailyCount(user.id, user.organizationId, params.channel),
    applyOutcomeEffect(),
    writeAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "touch_logged",
      entityType: "lead",
      entityId: lead.id,
      after: { channel: params.channel, outcome: params.outcome },
    }),
  ]);

  if (params.pastedMessage && (params.outcome === "interested" || params.outcome === "replied")) {
    await prisma.conversation.create({
      data: {
        organizationId: user.organizationId,
        leadId: lead.id,
        dealId,
        kind: CONVERSATION_KIND_BY_CHANNEL[params.channel],
        title: `${params.outcome === "interested" ? "Interested" : "Reply"} — ${lead.businessName}`,
        body: params.pastedMessage,
        source: "manual",
        occurredAt: now,
        reviewStatus: "none",
      },
    });
  }

  revalidatePath("/focus");
  revalidatePath("/today");
  revalidatePath("/deals");

  return { dealId };
}
