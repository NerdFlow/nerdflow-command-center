"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";

export async function addKnowledgeDocPaste(campaignId: string, title: string, text: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId: user.organizationId } });
  if (!campaign) throw new Error("Campaign not found");

  await prisma.knowledgeDoc.create({
    data: {
      organizationId: user.organizationId,
      campaignId,
      title,
      source: "paste",
      extractedText: text,
      tokenEstimate: Math.round(text.length / 4),
      uploadedById: user.id,
    },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function deleteKnowledgeDoc(id: string, campaignId: string) {
  const user = await requireUser();
  const doc = await prisma.knowledgeDoc.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!doc) throw new Error("Not found");
  await prisma.knowledgeDoc.delete({ where: { id } });
  revalidatePath(`/campaigns/${campaignId}`);
}
