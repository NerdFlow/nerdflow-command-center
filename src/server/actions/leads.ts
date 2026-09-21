"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { incrementMetricCount } from "@/server/targets";
import { computeDedupeKey, ruleScore, type LeadRowInput } from "@/server/leads";

export async function approveLead(leadId: string) {
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: user.organizationId } });
  if (!lead) throw new Error("Lead not found");
  if (user.role === "rep" && lead.ownerId !== user.id) throw new Error("Not your lead");

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: { status: "queued", nextTouchAt: new Date(), approvedById: user.id },
  });
  await incrementMetricCount(lead.ownerId, user.organizationId, "leads_verified");
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "lead_approved",
    entityType: "lead",
    entityId: leadId,
    before: { status: lead.status },
    after: { status: updated.status },
  });
  revalidatePath("/leads");
  revalidatePath("/today");
}

export async function rejectLead(leadId: string, reason: string, note?: string) {
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: user.organizationId } });
  if (!lead) throw new Error("Lead not found");
  if (user.role === "rep" && lead.ownerId !== user.id) throw new Error("Not your lead");

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "rejected", rejectedReason: note ? `${reason}: ${note}` : reason },
  });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "lead_rejected",
    entityType: "lead",
    entityId: leadId,
    after: { reason },
  });
  revalidatePath("/leads");
}

export async function bulkApproveAboveScore(threshold: number) {
  const user = await requireUser();
  const where = {
    organizationId: user.organizationId,
    status: "inbox" as const,
    fitScore: { gte: threshold },
    ...(user.role === "rep" ? { ownerId: user.id } : {}),
  };
  const leads = await prisma.lead.findMany({ where });
  await prisma.lead.updateMany({
    where: { id: { in: leads.map((l) => l.id) } },
    data: { status: "queued", nextTouchAt: new Date(), approvedById: user.id },
  });
  for (const lead of leads) {
    await incrementMetricCount(lead.ownerId, user.organizationId, "leads_verified");
  }
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "lead_bulk_approved",
    entityType: "lead",
    after: { count: leads.length, threshold },
  });
  revalidatePath("/leads");
  return leads.length;
}

export async function bulkRejectNoChannel() {
  const user = await requireUser();
  const where = {
    organizationId: user.organizationId,
    status: "inbox" as const,
    email: null,
    phone: null,
    instagramUrl: null,
    linkedinUrl: null,
    ...(user.role === "rep" ? { ownerId: user.id } : {}),
  };
  const leads = await prisma.lead.findMany({ where });
  await prisma.lead.updateMany({
    where: { id: { in: leads.map((l) => l.id) } },
    data: { status: "rejected", rejectedReason: "No reachable channel" },
  });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "lead_bulk_rejected",
    entityType: "lead",
    after: { count: leads.length, reason: "No reachable channel" },
  });
  revalidatePath("/leads");
  return leads.length;
}

const rowSchema = z.object({
  business_name: z.string().min(1),
  contact_name: z.string().optional(),
  contact_role: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  instagram_url: z.string().optional(),
  linkedin_url: z.string().optional(),
});

export async function previewLeadImport(campaignId: string, rawRows: LeadRowInput[]) {
  const user = await requireUser();
  const rows = rawRows.map((r) => rowSchema.parse(r));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);

  const results = [];
  for (const row of rows) {
    const dedupeKey = computeDedupeKey(row);
    const existing = await prisma.lead.findFirst({
      where: {
        organizationId: user.organizationId,
        dedupeKey,
        OR: [
          { createdAt: { gte: cutoff } },
          { status: "do_not_contact" },
          { deals: { some: { stage: { notIn: ["won", "lost"] } } } },
        ],
      },
    });
    results.push({ row, dedupeKey, isDuplicate: Boolean(existing), score: ruleScore(row) });
  }

  return {
    total: results.length,
    duplicates: results.filter((r) => r.isDuplicate).length,
    rows: results,
  };
}

export async function commitLeadImport(campaignId: string, rawRows: LeadRowInput[]) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: user.organizationId },
  });
  if (!campaign) throw new Error("Campaign not found");

  const preview = await previewLeadImport(campaignId, rawRows);
  const toInsert = preview.rows.filter((r) => !r.isDuplicate);

  const runRecord = await prisma.leadSourceRun.create({
    data: {
      organizationId: user.organizationId,
      campaignId,
      source: "csv",
      startedAt: new Date(),
      finishedAt: new Date(),
      found: rawRows.length,
      new: toInsert.length,
      duplicates: preview.duplicates,
      rejectedAuto: 0,
    },
  });

  for (const { row, dedupeKey, score } of toInsert) {
    await prisma.lead.create({
      data: {
        organizationId: user.organizationId,
        campaignId,
        ownerId: campaign.ownerId,
        businessName: row.business_name,
        contactName: row.contact_name || null,
        contactRole: row.contact_role || null,
        city: row.city || null,
        region: row.region || null,
        country: row.country || null,
        website: row.website || null,
        phone: row.phone || null,
        email: row.email || null,
        instagramUrl: row.instagram_url || null,
        linkedinUrl: row.linkedin_url || null,
        source: "csv",
        sourceUrl: null,
        sourceRunId: runRecord.id,
        fitScore: score,
        fitReasons: [],
        fitFlags: [],
        dedupeKey,
        status: "inbox",
      },
    });
  }

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "lead_csv_import",
    entityType: "campaign",
    entityId: campaignId,
    after: { imported: toInsert.length, duplicates: preview.duplicates, total: rawRows.length },
  });

  revalidatePath("/leads");
  return { imported: toInsert.length, duplicates: preview.duplicates, total: rawRows.length };
}
