"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { planNextCadenceStep, scheduleNextTouch, type WorkingHours } from "@/server/cadence";
import { incrementDailyCount } from "@/server/targets";
import { writeAuditLog } from "@/server/audit";
import type { CampaignStrategy } from "@/server/strategy";
import { normalizeCallerNote } from "@/lib/focusCallCard";
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
  /** Follow-up channel handoff (Focus mode Step 5) — e.g. call went unanswered, follow up by email instead of waiting for the next cadence call. Only applies to non-terminal outcomes. */
  followUpChannel?: Channel;
  /** Required for outcome "meeting_booked". */
  meetingAt?: string;
  meetingNote?: string;
  /** Variant Focus assigned ("a" | "b"). The rep does not pick. */
  scriptUsed?: "a" | "b";
  /** Channel + variant, e.g. call_a or email_b. */
  scriptId?: string;
  /** Optional rating after the outcome. Skippable. */
  scriptRating?: "up" | "down" | "helpful" | "meh" | "bad";
  /** What the caller said, in the rep's words. */
  callerNote?: string;
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
    if (params.outcome === "interested" || params.outcome === "meeting_booked") {
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

      if (params.outcome === "meeting_booked" && params.meetingAt) {
        await prisma.deal.update({
          where: { id: deal.id },
          data: { nextStepText: params.meetingNote || "Meeting booked", nextStepAt: new Date(params.meetingAt) },
        });
      }
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
    if (params.outcome === "wrong_number") {
      // Product doc v2: "Flags lead; sends back to review" rather than continuing the cadence.
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "inbox" } });
      return null;
    }

    // sent / no_answer / voicemail / talked_not_now — advance the cadence, with an optional channel handoff.
    // Skips cadence steps whose channel is not in the campaign's allowed channels (email-only never gets a call).
    const strategy = lead.campaign.strategy as unknown as CampaignStrategy;
    const planned = planNextCadenceStep({
      strategy,
      currentStep: step,
      followUpChannel: params.followUpChannel,
    });

    if (planned.finished) {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "finished", nextChannelOverride: null } });
    } else {
      const nextTouchAt = scheduleNextTouch({
        occurredAt: now,
        dayDelta: planned.dayDelta,
        timezone: lead.owner.timezone,
        workingHours: lead.owner.workingHours as unknown as WorkingHours,
      });
      // Per-lead only — never mutate the campaign's shared cadence, which every other lead reads too.
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: "in_cadence",
          cadenceStep: planned.cadenceStep,
          nextTouchAt,
          nextChannelOverride: planned.nextChannelOverride,
        },
      });
    }
    return null;
  }

  const scriptUsed = params.scriptUsed ?? null;
  const scriptId = params.scriptId ?? (scriptUsed ? `${params.channel}_${scriptUsed}` : null);
  const [touch, , dealId] = await Promise.all([
    prisma.touch.create({
      data: {
        organizationId: user.organizationId,
        leadId: lead.id,
        userId: user.id,
        channel: params.channel,
        step,
        outcome: params.outcome,
        occurredAt: now,
        scriptUsed,
        scriptId,
        scriptRating: params.scriptRating ?? null,
        callerNote: normalizeCallerNote(params.callerNote),
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
      after: {
        channel: params.channel,
        outcome: params.outcome,
        ...(scriptUsed ? { scriptUsed, scriptId, scriptRating: params.scriptRating ?? null } : {}),
      },
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
  revalidatePath("/whats-working");

  return { dealId, touchId: touch.id };
}

export async function rateTouchScript(touchId: string, rating: "helpful" | "meh" | "bad") {
  const user = await requireUser();
  await prisma.touch.updateMany({
    where: { id: touchId, userId: user.id, organizationId: user.organizationId },
    data: { scriptRating: rating },
  });
  revalidatePath("/whats-working");
}
