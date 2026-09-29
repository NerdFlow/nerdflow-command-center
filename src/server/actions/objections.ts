"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { campaignStrategySchema } from "@/server/strategy";

const PROVEN_MIN_USES = 8;
const PROVEN_MIN_RATE = 0.6;
const RETIRE_MIN_USES = 8;
const RETIRE_MAX_RATE = 0.3;
const TESTING_MIN_USES = 3;

function nextStatus(uses: number, keptTalkingCount: number): "new" | "testing" | "proven" | "retired" {
  if (uses === 0) return "new";
  const rate = keptTalkingCount / uses;
  if (uses >= RETIRE_MIN_USES && rate <= RETIRE_MAX_RATE) return "retired";
  if (uses >= PROVEN_MIN_USES && rate >= PROVEN_MIN_RATE) return "proven";
  if (uses >= TESTING_MIN_USES) return "testing";
  return "new";
}

/** Ensures one ObjectionResponse row exists per objection in the campaign's approved playbook — lazy sync, called whenever Focus needs them. */
export async function getObjectionResponses(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId: user.organizationId } });
  if (!campaign) throw new Error("Campaign not found");

  const strategy = campaignStrategySchema.safeParse(campaign.strategy);
  const objections = strategy.success ? strategy.data.objections : [];
  const existing = await prisma.objectionResponse.findMany({ where: { campaignId } });
  const existingByText = new Map(existing.map((o) => [o.objection, o]));

  const missing = objections.filter((o) => !existingByText.has(o.question));
  if (missing.length > 0) {
    await prisma.objectionResponse.createMany({
      data: missing.map((o) => ({ organizationId: user.organizationId, campaignId, objection: o.question, responseText: o.answer })),
    });
  }

  return prisma.objectionResponse.findMany({ where: { campaignId, status: { not: "retired" } }, orderBy: { createdAt: "asc" } });
}

export async function recordObjectionFeedback(objectionResponseId: string, outcome: "kept_talking" | "lost") {
  const user = await requireUser();
  const current = await prisma.objectionResponse.findFirst({ where: { id: objectionResponseId, organizationId: user.organizationId } });
  if (!current) throw new Error("Objection response not found");

  const uses = current.uses + 1;
  const keptTalkingCount = current.keptTalkingCount + (outcome === "kept_talking" ? 1 : 0);
  const lostCount = current.lostCount + (outcome === "lost" ? 1 : 0);
  const status = nextStatus(uses, keptTalkingCount);

  await prisma.objectionResponse.update({ where: { id: objectionResponseId }, data: { uses, keptTalkingCount, lostCount, status } });
  revalidatePath("/focus");
  revalidatePath("/whats-working");
}
