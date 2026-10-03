import type { LeadStatus, Prisma, PrismaClient } from "@prisma/client";
import { selectRoutedCards } from "@/lib/focusRouting";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { loadRouteReps } from "@/server/focusRouting";

export type PipelineWriter = PrismaClient | Prisma.TransactionClient;
import type { CampaignStrategy } from "@/server/strategy";
import {
  PIPELINE_SPREADSHEET_ID,
  PIPELINE_TODAY_SHEET_ID,
  mapPipelineGrid,
  pipelineExternalKey,
  pipelinePersonKey,
  pktDateStamp,
  queueDateAsUtc,
  type MappedPipelineRow,
} from "@/lib/pipelineToday";

const PIPELINE_CAMPAIGN_NAME = "Sales Pipeline Today";

const PIPELINE_STRATEGY: CampaignStrategy = {
  summary: "Sales Pipeline Today queue. One card is one sheet row.",
  icp: {
    buyer: "Named on the Today row",
    business: "Named on the Today row",
    location: "",
    size: "",
    triggers: [],
    disqualifiers: [],
  },
  channels: [
    { channel: "email", why: "Open in Titan. You send it." },
    { channel: "linkedin", why: "Connect with no note, or paste the reply." },
  ],
  cadence: [{ day: 0, channel: "email", purpose: "Work the Today row.", tip: "Nothing sends from here." }],
  messages: {
    email: { first: "", follow: "" },
    call: { first: "", follow: "" },
    instagram: { first: "", follow: "" },
    linkedin: { first: "", follow: "" },
  },
  objections: [],
  lead_gen: { sources: [], search_queries: [], must_have: [], score_boost: [] },
  kill_rule: "The Today sheet is the queue.",
  call_scripts: ["", ""],
  email_scripts: ["", ""],
};

const TERMINAL = new Set(["done", "skipped", "follow_up"]);

export type PipelineSyncSummary = {
  source: "sheets" | "paste";
  queueDate: string;
  stored: number;
  open: number;
  sheetDone: number;
  dropped: number;
  filteredCalls: number;
  blankSkipped: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function keptStatus(current: LeadStatus): LeadStatus {
  if (current === "do_not_contact" || current === "not_fit" || current === "rejected") return current;
  if (current === "deal" || current === "replied" || current === "finished") return current;
  return "in_cadence";
}

export async function ensurePipelineCampaign(db: PipelineWriter, organizationId: string, ownerId: string) {
  const existing = await db.campaign.findFirst({
    where: { organizationId, name: PIPELINE_CAMPAIGN_NAME },
  });
  if (existing) return existing;
  let product = await db.product.findFirst({
    where: { organizationId, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!product) {
    product = await db.product.create({
      data: {
        organizationId,
        name: "NerdFlow",
        type: "service",
        summary: "Holding product for Sales Pipeline Today cards.",
      },
    });
  }
  return db.campaign.create({
    data: {
      organizationId,
      productId: product.id,
      name: PIPELINE_CAMPAIGN_NAME,
      ownerId,
      status: "active",
      goal: "Work the Sales Pipeline Today sheet from Focus.",
      strategy: PIPELINE_STRATEGY as unknown as object,
      approvedById: ownerId,
      approvedAt: new Date(),
    },
  });
}

export async function upsertPipelineLead(
  db: PipelineWriter,
  organizationId: string,
  ownerId: string,
  campaignId: string,
  row: MappedPipelineRow,
  extra?: { dealCode?: string | null; source?: string },
) {
  const dedupeKey = pipelinePersonKey(row.company, row.contactName);
  const existing = await db.lead.findFirst({ where: { organizationId, dedupeKey } });
  const dealCode = extra?.dealCode?.trim() || null;
  const signals = {
    ...asRecord(existing?.signals),
    pipelineToday: true,
    ...(extra?.source ? { pipelineTodaySource: extra.source } : {}),
    ...(dealCode ? { pipelineDealCode: dealCode } : {}),
  };
  const contact = {
    ...(row.contactName ? { contactName: row.contactName } : {}),
    ...(row.mailtoTo ? { email: row.mailtoTo } : {}),
    ...(row.linkKind === "linkedin_profile" && row.linkUrl ? { linkedinUrl: row.linkUrl } : {}),
    ...(row.linkKind === "contact_form" && row.linkUrl ? { website: row.linkUrl, sourceUrl: row.linkUrl } : {}),
  };
  if (!existing) {
    return db.lead.create({
      data: {
        organizationId,
        campaignId,
        ownerId,
        status: "in_cadence",
        businessName: row.company,
        contactName: row.contactName || null,
        email: row.mailtoTo,
        phone: row.phone,
        linkedinUrl: row.linkKind === "linkedin_profile" ? row.linkUrl : null,
        website: row.linkKind === "contact_form" ? row.linkUrl : null,
        sourceUrl: row.linkKind === "contact_form" ? row.linkUrl : null,
        signals,
        source: "manual",
        fitScore: 0,
        fitReasons: [row.intel],
        dedupeKey,
        cadenceStep: 0,
        nextTouchAt: null,
        approvedById: ownerId,
        isDemo: false,
      },
    });
  }
  return db.lead.update({
    where: { id: existing.id },
    data: {
      ...contact,
      ...(row.phone ? { phone: row.phone } : {}),
      signals,
      businessName: row.company || existing.businessName,
      status: keptStatus(existing.status),
      fitScore: existing.fitScore > 0 ? existing.fitScore : 0,
      nextTouchAt: null,
      approvedById: existing.approvedById ?? ownerId,
    },
  });
}

function rowStatus(sheetDone: boolean, previous: string | undefined, blocked: boolean): string {
  if (blocked) return "dropped";
  if (sheetDone) return "done";
  if (previous && TERMINAL.has(previous)) return previous;
  return "open";
}

/**
 * Replace today's sheet-backed Focus cards and route each one by channel.
 * Leads skip the inbox. Routing does not change an existing lead's owner.
 */
export async function applyPipelineTodaySync(input: {
  organizationId: string;
  actorId: string;
  source: "sheets" | "paste";
  grid: string[][];
}): Promise<PipelineSyncSummary> {
  const queueDate = pktDateStamp();
  const queueDay = queueDateAsUtc(queueDate);
  const mapped = mapPipelineGrid(input.grid);
  const cards = mapped.rows.map((row) => ({ cardId: pipelineExternalKey(queueDate, row.sheetRow), row }));
  const personKeys = [...new Set(cards.map((card) => pipelinePersonKey(card.row.company, card.row.contactName)))];
  const [{ reps, defaultCap, fallbackOwnerId }, existingLeads, existingRows] = await Promise.all([
    loadRouteReps(input.organizationId, queueDay),
    personKeys.length === 0
      ? Promise.resolve([])
      : prisma.lead.findMany({
          where: { organizationId: input.organizationId, dedupeKey: { in: personKeys } },
          select: { dedupeKey: true, ownerId: true },
        }),
    cards.length === 0
      ? Promise.resolve([])
      : prisma.pipelineTodayRow.findMany({
          where: { organizationId: input.organizationId, externalKey: { in: cards.map((card) => card.cardId) } },
          select: { externalKey: true, status: true, ownerId: true },
        }),
  ]);
  if (!fallbackOwnerId) throw new Error("No active users to route Today cards");
  const campaign = await ensurePipelineCampaign(prisma, input.organizationId, fallbackOwnerId);
  const locked = new Map<string, string>();
  for (const row of existingRows) {
    if (TERMINAL.has(row.status)) locked.set(row.externalKey, row.ownerId);
  }
  const decision = selectRoutedCards({
    cards,
    leadOwners: new Map(existingLeads.map((lead) => [lead.dedupeKey, lead.ownerId])),
    hintOwnerId: null,
    fallbackOwnerId,
    reps,
    defaultCap,
    locked,
  });
  const seen = new Set<string>();

  for (const card of decision.routed) {
    seen.add(card.cardId);
    const lead = await upsertPipelineLead(prisma, input.organizationId, card.leadOwnerId, campaign.id, card.row, {
      source: input.source,
    });
    const blocked = lead.status === "do_not_contact" || lead.status === "not_fit";
    const previous = existingRows.find((row) => row.externalKey === card.cardId);
    const status = rowStatus(card.row.sheetDone, previous?.status, blocked);
    const assigneeId = previous && TERMINAL.has(previous.status) ? previous.ownerId : card.assigneeId;
    const data = {
      ownerId: assigneeId,
      leadId: lead.id,
      queueDate: queueDay,
      sheetRow: card.row.sheetRow,
      timeLabel: card.row.timeLabel,
      contactName: card.row.contactName || null,
      company: card.row.company,
      actionLabel: card.row.actionLabel,
      kind: card.row.kind,
      channel: card.row.channel,
      linkKind: card.row.linkKind,
      linkUrl: card.row.linkUrl,
      mailtoTo: card.row.mailtoTo,
      mailtoSubject: card.row.mailtoSubject,
      message: card.row.message,
      sheetDone: card.row.sheetDone,
      status,
      outcomeMode: card.row.outcomeMode,
      intel: card.row.intel,
      connectNoNote: card.row.connectNoNote,
    };
    await prisma.pipelineTodayRow.upsert({
      where: { organizationId_externalKey: { organizationId: input.organizationId, externalKey: card.cardId } },
      create: { organizationId: input.organizationId, externalKey: card.cardId, ...data },
      update: data,
    });
  }

  // Only sheet-keyed rows. An API rebuild uses card ids and must survive a later sheet sync.
  const dropped = await prisma.pipelineTodayRow.updateMany({
    where: {
      organizationId: input.organizationId,
      queueDate: queueDay,
      status: "open",
      externalKey: {
        startsWith: `${PIPELINE_SPREADSHEET_ID}:${PIPELINE_TODAY_SHEET_ID}:`,
        ...(seen.size > 0 ? { notIn: [...seen] } : {}),
      },
    },
    data: { status: "dropped" },
  });

  const open = await prisma.pipelineTodayRow.count({
    where: { organizationId: input.organizationId, queueDate: queueDay, status: "open" },
  });

  const summary: PipelineSyncSummary = {
    source: input.source,
    queueDate,
    stored: decision.routed.length,
    open,
    sheetDone: decision.routed.filter((card) => card.row.sheetDone).length,
    dropped: dropped.count,
    filteredCalls: 0,
    blankSkipped: mapped.blankSkipped,
  };

  await writeAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "pipeline_today_synced",
    entityType: "user",
    entityId: input.actorId,
    after: {
      ...summary,
      routes: decision.routed.map((card) => ({
        cardId: card.cardId,
        assigneeId: card.assigneeId,
        leadOwnerId: card.leadOwnerId,
        slot: card.slot,
      })),
      rejected: decision.rejected,
    },
  });

  return summary;
}
