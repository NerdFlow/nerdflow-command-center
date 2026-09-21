"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { computeHealth, computeFlags, STAGE_ORDER } from "@/server/deals";
import type { DealStage, LostReason } from "@prisma/client";

const BOOKING_CRITERION_BY_STAGE: Partial<Record<DealStage, string>> = {
  interested: "meeting_booked",
  discovery: "next_meeting_booked",
  demo: "next_step_booked",
};

async function assertCanEditDeal(dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findFirst({ where: { id: dealId, organizationId: user.organizationId }, include: { people: true } });
  if (!deal) throw new Error("Deal not found");
  if (user.role === "rep" && deal.ownerId !== user.id) throw new Error("Not your deal");
  return { user, deal };
}

async function recomputeHealth(dealId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { people: true } });
  const flags = computeFlags({
    stage: deal.stage,
    lastActivityAt: deal.updatedAt,
    nextStepAt: deal.nextStepAt,
    people: deal.people,
  });
  const health = computeHealth(deal.stage, (deal.checklist as Record<string, boolean>) ?? {}, flags.length);
  await prisma.deal.update({ where: { id: dealId }, data: { health } });
  return { flags, health };
}

export async function setChecklistItem(dealId: string, key: string, value: boolean) {
  const { deal } = await assertCanEditDeal(dealId);
  const checklist = { ...((deal.checklist as Record<string, boolean>) ?? {}), [key]: value };
  await prisma.deal.update({ where: { id: dealId }, data: { checklist } });
  await recomputeHealth(dealId);
  revalidatePath(`/deals/${dealId}`);
}

export async function setNextStep(dealId: string, text: string, at: string) {
  const { deal } = await assertCanEditDeal(dealId);
  const nextStepAt = new Date(at);
  const bookingKey = BOOKING_CRITERION_BY_STAGE[deal.stage];
  const checklist = { ...((deal.checklist as Record<string, boolean>) ?? {}) };
  if (bookingKey) checklist[bookingKey] = true;

  await prisma.deal.update({ where: { id: dealId }, data: { nextStepText: text, nextStepAt, checklist } });
  await recomputeHealth(dealId);
  revalidatePath(`/deals/${dealId}`);
}

export async function setStage(dealId: string, stage: DealStage, lostReason?: LostReason) {
  const { user, deal } = await assertCanEditDeal(dealId);
  if (stage === "lost" && !lostReason) throw new Error("Lost reason is required");

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage,
      stageChangedAt: new Date(),
      lostReason: stage === "lost" ? lostReason : null,
      wonAt: stage === "won" ? new Date() : null,
      lostAt: stage === "lost" ? new Date() : null,
    },
  });
  await recomputeHealth(dealId);
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "deal_stage_changed",
    entityType: "deal",
    entityId: dealId,
    before: { stage: deal.stage },
    after: { stage },
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
}

export async function setDealValue(dealId: string, valueMonthlyUsd: number | null) {
  await assertCanEditDeal(dealId);
  await prisma.deal.update({ where: { id: dealId }, data: { valueMonthlyUsd } });
  revalidatePath(`/deals/${dealId}`);
}

export async function addDealPerson(dealId: string, input: { name: string; role?: string; email?: string; phone?: string }) {
  await assertCanEditDeal(dealId);
  await prisma.dealPerson.create({ data: { dealId, ...input } });
  await recomputeHealth(dealId);
  revalidatePath(`/deals/${dealId}`);
}

export async function togglePersonFlag(dealId: string, personId: string, field: "isDecisionMaker" | "met", value: boolean) {
  await assertCanEditDeal(dealId);
  await prisma.dealPerson.update({ where: { id: personId }, data: { [field]: value } });
  await recomputeHealth(dealId);
  revalidatePath(`/deals/${dealId}`);
}

export const STAGE_LIST = STAGE_ORDER;
