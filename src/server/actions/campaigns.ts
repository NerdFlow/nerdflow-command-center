"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { getOrgSettings } from "@/server/settings";
import { fallbackStrategy, campaignStrategySchema, type CampaignStrategy } from "@/server/strategy";

export async function createProduct(input: { name: string; type: "product" | "service"; summary: string }) {
  const user = await requireUser();
  const product = await prisma.product.create({
    data: { organizationId: user.organizationId, name: input.name, type: input.type, summary: input.summary },
  });
  return product;
}

export async function createCampaign(input: {
  productId: string;
  name: string;
  ownerId?: string;
  location?: string;
  goal?: string;
  buyerGuess?: string;
}) {
  const user = await requireUser();
  const settings = await getOrgSettings();
  const ownerId = user.role === "rep" ? user.id : input.ownerId || user.id;

  if (user.role === "rep") {
    const activeCount = await prisma.campaign.count({
      where: { organizationId: user.organizationId, ownerId, status: "active" },
    });
    if (activeCount >= settings.campaignLimitPerRep) {
      throw new Error(
        `You can only run ${settings.campaignLimitPerRep} active campaigns at a time. Pause one before starting another.`,
      );
    }
  }

  const product = await prisma.product.findFirstOrThrow({ where: { id: input.productId, organizationId: user.organizationId } });
  const strategy = fallbackStrategy({
    productName: product.name,
    productType: product.type,
    productSummary: product.summary,
    location: input.location,
    buyerGuess: input.buyerGuess,
    goal: input.goal,
  });

  const campaign = await prisma.campaign.create({
    data: {
      organizationId: user.organizationId,
      productId: product.id,
      name: input.name,
      ownerId,
      status: user.role === "rep" ? "pending_approval" : "active",
      goal: input.goal,
      location: input.location,
      strategy: strategy as unknown as object,
      leadDailyCap: settings.leadDailyCapDefault,
      approvedById: user.role === "rep" ? null : user.id,
      approvedAt: user.role === "rep" ? null : new Date(),
    },
  });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "campaign_created",
    entityType: "campaign",
    entityId: campaign.id,
    after: { name: campaign.name, status: campaign.status },
  });

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign.id}`);
}

async function assertCanEditCampaign(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId: user.organizationId } });
  if (!campaign) throw new Error("Campaign not found");
  if (user.role === "rep" && campaign.ownerId !== user.id) throw new Error("Not your campaign");
  return { user, campaign };
}

export async function updateCampaignStrategy(campaignId: string, strategy: CampaignStrategy) {
  const { user, campaign } = await assertCanEditCampaign(campaignId);
  const parsed = campaignStrategySchema.parse(strategy);

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { strategy: parsed as unknown as object, strategyVersion: { increment: 1 } },
  });
  await prisma.campaignNote.create({
    data: {
      organizationId: user.organizationId,
      campaignId,
      authorId: user.id,
      kind: "system",
      body: `Playbook updated (now version ${campaign.strategyVersion + 1}).`,
    },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function rethinkStrategy(campaignId: string) {
  const { campaign } = await assertCanEditCampaign(campaignId);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: campaign.productId } });
  const strategy = fallbackStrategy({
    productName: product.name,
    productType: product.type,
    productSummary: product.summary,
    location: campaign.location ?? undefined,
    goal: campaign.goal ?? undefined,
  });
  return strategy;
}

export async function addCampaignNote(campaignId: string, body: string) {
  const { user } = await assertCanEditCampaign(campaignId);
  await prisma.campaignNote.create({
    data: { organizationId: user.organizationId, campaignId, authorId: user.id, kind: "note", body },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function submitCampaignForApproval(campaignId: string) {
  const { campaign } = await assertCanEditCampaign(campaignId);
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "pending_approval" } });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

export async function approveCampaign(campaignId: string) {
  const user = await requireUser();
  if (user.role === "rep") throw new Error("Only managers and admins can approve campaigns");
  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "active", approvedById: user.id, approvedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "campaign_approved",
    entityType: "campaign",
    entityId: campaignId,
  });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return campaign;
}

export async function pauseCampaign(campaignId: string, reason: string) {
  const user = await requireUser();
  if (user.role === "rep") throw new Error("Only managers and admins can pause campaigns");
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "paused", pausedReason: reason } });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "campaign_paused",
    entityType: "campaign",
    entityId: campaignId,
    after: { reason },
  });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

export async function resumeCampaign(campaignId: string) {
  const user = await requireUser();
  if (user.role === "rep") throw new Error("Only managers and admins can resume campaigns");
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "active", pausedReason: null } });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

export async function archiveCampaign(campaignId: string) {
  const user = await requireUser();
  if (user.role === "rep") throw new Error("Only managers and admins can archive campaigns");
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "archived" } });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}
