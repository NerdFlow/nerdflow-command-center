"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { incrementMetricCount } from "@/server/targets";
import { ruleScore, type LeadRowInput } from "@/server/leads";
import { usablePhone } from "@/lib/importMap";
import { planImportMerge } from "@/lib/phoneBackfill";
import { extractSiteContact } from "@/server/leadgen/extract";
import { scoreLead } from "@/server/leadgen/score";
import { pktDateStamp, queueDateAsUtc } from "@/lib/pipelineToday";
import { campaignStrategySchema } from "@/server/strategy";

export async function approveLead(leadId: string) {
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: user.organizationId } });
  if (!lead) throw new Error("Lead not found");
  if (user.role === "rep" && lead.ownerId !== user.id) throw new Error("Not your lead");

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: { status: "queued", nextTouchAt: new Date(), cadenceStartedOn: queueDateAsUtc(pktDateStamp()), approvedById: user.id },
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
    data: { status: "queued", nextTouchAt: new Date(), cadenceStartedOn: queueDateAsUtc(pktDateStamp()), approvedById: user.id },
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

function normalizeImportRow(row: LeadRowInput): LeadRowInput {
  const phone = usablePhone(row.phone);
  if (!phone) {
    const { phone: _drop, ...rest } = row;
    return rest;
  }
  return { ...row, phone };
}

async function classifyImport(organizationId: string, campaignId: string, rawRows: LeadRowInput[]) {
  const rows = rawRows.map((r) => normalizeImportRow(rowSchema.parse(r)));
  const campaignLeads = await prisma.lead.findMany({
    where: { organizationId, campaignId },
    select: { id: true, businessName: true, city: true, website: true, phone: true, dedupeKey: true },
  });
  const plan = planImportMerge(campaignLeads, rows);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);

  const results = [];
  for (const item of plan) {
    let isDuplicate = item.action !== "insert";
    if (item.action === "insert") {
      const existing = await prisma.lead.findFirst({
        where: {
          organizationId,
          dedupeKey: item.dedupeKey,
          OR: [
            { createdAt: { gte: cutoff } },
            { status: "do_not_contact" },
            { deals: { some: { stage: { notIn: ["won", "lost"] } } } },
          ],
        },
      });
      isDuplicate = Boolean(existing);
    }
    results.push({
      row: item.row,
      dedupeKey: item.dedupeKey,
      isDuplicate,
      willBackfillPhone: item.action === "backfill_phone",
      backfillLeadId: item.action === "backfill_phone" ? item.leadId : null,
      backfillPhone: item.action === "backfill_phone" ? item.phone : null,
      score: ruleScore(item.row),
    });
  }

  return {
    total: results.length,
    duplicates: results.filter((r) => r.isDuplicate).length,
    phonesBackfilled: results.filter((r) => r.willBackfillPhone).length,
    rows: results,
  };
}

export async function previewLeadImport(campaignId: string, rawRows: LeadRowInput[]) {
  const user = await requireUser();
  return classifyImport(user.organizationId, campaignId, rawRows);
}

async function writePhoneBackfill(
  rows: { willBackfillPhone: boolean; backfillLeadId: string | null; backfillPhone: string | null }[],
) {
  const updates = rows.filter((r) => r.willBackfillPhone && r.backfillLeadId && r.backfillPhone);
  await Promise.all(
    updates.map((r) =>
      prisma.lead.update({
        where: { id: r.backfillLeadId! },
        data: { phone: r.backfillPhone! },
      }),
    ),
  );
  return updates.length;
}

export async function commitLeadImport(campaignId: string, rawRows: LeadRowInput[]) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: user.organizationId },
  });
  if (!campaign) throw new Error("Campaign not found");

  const preview = await previewLeadImport(campaignId, rawRows);
  const toInsert = preview.rows.filter((r) => !r.isDuplicate);
  const phonesBackfilled = await writePhoneBackfill(preview.rows);

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
    after: { imported: toInsert.length, duplicates: preview.duplicates, phonesBackfilled, total: rawRows.length },
  });

  revalidatePath("/leads");
  revalidatePath("/focus");
  return { imported: toInsert.length, duplicates: preview.duplicates, phonesBackfilled, total: rawRows.length };
}

/**
 * Bulk import for the Lead Generation page's "Import list" flow — reps need
 * to start working a list today, so this never blocks on AI. Every lead
 * gets a real rule-based score immediately; Gemini Flash-Lite enrichment
 * (fill missing contacts from the site, real fit score vs the ICP) runs
 * afterward as a detached background pass and simply doesn't happen if AI
 * is unavailable or the budget is hit — the rule score already made the
 * lead usable.
 */
export async function commitBulkImport(input: {
  campaignId: string;
  rawRows: LeadRowInput[];
  fileName: string;
  assignment: { mode: "single" | "split"; repIds: string[] };
  sendToReviewFirst: boolean;
}) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({ where: { id: input.campaignId, organizationId: user.organizationId } });
  if (!campaign) throw new Error("Campaign not found");
  if (input.assignment.repIds.length === 0) throw new Error("Pick at least one rep to assign these leads to");

  const reps = await prisma.user.findMany({
    where: { id: { in: input.assignment.repIds }, organizationId: user.organizationId, status: { not: "deactivated" } },
    select: { id: true },
  });
  if (reps.length !== input.assignment.repIds.length) throw new Error("One or more selected reps couldn't be found");

  const preview = await previewLeadImport(input.campaignId, input.rawRows);
  const toInsert = preview.rows.filter((r) => !r.isDuplicate);
  const phonesBackfilled = await writePhoneBackfill(preview.rows);
  const missingContact = toInsert.filter((r) => !r.row.email && !r.row.phone).length;

  const runRecord = await prisma.leadSourceRun.create({
    data: {
      organizationId: user.organizationId,
      campaignId: input.campaignId,
      source: "csv",
      status: "completed",
      startedAt: new Date(),
      finishedAt: new Date(),
      found: input.rawRows.length,
      new: toInsert.length,
      duplicates: preview.duplicates,
      rejectedAuto: 0,
      narration: `Import: ${input.fileName}${phonesBackfilled ? ` · ${phonesBackfilled} phones added to existing leads` : ""}`,
    },
  });

  const targetStatus = input.sendToReviewFirst ? "inbox" : "queued";
  const createdLeadIds: string[] = [];
  for (let i = 0; i < toInsert.length; i++) {
    const item = toInsert[i]!;
    const { row, dedupeKey, score } = item;
    const ownerId = input.assignment.mode === "single" ? input.assignment.repIds[0]! : input.assignment.repIds[i % input.assignment.repIds.length]!;
    const lead = await prisma.lead.create({
      data: {
        organizationId: user.organizationId,
        campaignId: input.campaignId,
        ownerId,
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
        status: targetStatus,
        nextTouchAt: targetStatus === "queued" ? new Date() : null,
        cadenceStartedOn: targetStatus === "queued" ? queueDateAsUtc(pktDateStamp()) : null,
      },
    });
    createdLeadIds.push(lead.id);
  }

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "lead_bulk_import",
    entityType: "campaign",
    entityId: input.campaignId,
    after: {
      imported: toInsert.length,
      duplicates: preview.duplicates,
      phonesBackfilled,
      total: input.rawRows.length,
      fileName: input.fileName,
    },
  });

  revalidatePath("/focus");
  revalidatePath("/today");
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${input.campaignId}`);

  // Detached on purpose — never await this. The import is done and usable now.
  void backgroundEnrichImportedLeads(createdLeadIds, input.campaignId, user.organizationId, runRecord.id).catch(() => {});

  return {
    imported: toInsert.length,
    duplicates: preview.duplicates,
    phonesBackfilled,
    total: input.rawRows.length,
    missingContact,
    runId: runRecord.id,
  };
}

async function backgroundEnrichImportedLeads(leadIds: string[], campaignId: string, organizationId: string, runId: string) {
  if (leadIds.length === 0) return;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  const strategy = campaignStrategySchema.safeParse(campaign?.strategy);
  const icp = strategy.success ? strategy.data.icp : null;
  if (!icp) return;

  const startedAt = new Date();
  let enriched = 0;
  for (const leadId of leadIds) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) continue;

    let email = lead.email;
    let phone = lead.phone;
    let instagramUrl = lead.instagramUrl;
    let linkedinUrl = lead.linkedinUrl;
    let textSample = "";
    if (lead.website) {
      const site = await extractSiteContact(lead.website);
      if (site) {
        email = email || site.email;
        phone = phone || site.phone;
        instagramUrl = instagramUrl || site.instagramUrl;
        linkedinUrl = linkedinUrl || site.linkedinUrl;
        textSample = site.textSample;
      }
    }

    const rule = ruleScore({
      business_name: lead.businessName,
      website: lead.website ?? undefined,
      email: email ?? undefined,
      phone: phone ?? undefined,
      instagram_url: instagramUrl ?? undefined,
      linkedin_url: linkedinUrl ?? undefined,
    });

    try {
      const result = await scoreLead({
        organizationId,
        ruleScore: rule,
        icp,
        lead: { name: lead.businessName, website: lead.website ?? "", extractedText: textSample },
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { email, phone, instagramUrl, linkedinUrl, fitScore: result.score, fitReasons: result.reasons, fitFlags: result.flags },
      });
      enriched += 1;
      await prisma.leadSourceRun.update({ where: { id: runId }, data: { enriched } });
    } catch {
      // AI unavailable or budget hit — the lead already has a usable rule-based score. Stop enriching the rest too.
      break;
    }
  }

  const costAgg = await prisma.aiUsage.aggregate({
    where: { organizationId, createdAt: { gte: startedAt }, feature: { in: ["scoring"] } },
    _sum: { costUsd: true },
  });
  await prisma.leadSourceRun.update({ where: { id: runId }, data: { costUsd: costAgg._sum.costUsd ?? 0 } });
}
