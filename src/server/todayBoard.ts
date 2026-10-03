import { prisma } from "@/server/db";
import { getQueueForUser } from "@/server/queue";
import { resolveLeadChannel } from "@/server/cadence";
import { formatLastTouch } from "@/lib/focusCallCard";
import { resolveFocusTodayOwner } from "@/server/focusTodayOwner";
import { sheetsConfigStatus } from "@/server/googleSheets";
import type { CampaignStrategy } from "@/server/strategy";
import type { CoachDirectoryLead, ShapeCard, ShapeReply } from "@/lib/shapeCard";
import type { PipelineActionKind, PipelineCardView, PipelineLinkKind, PipelineOutcomeMode } from "@/lib/pipelineToday";
import { presentLeadName } from "@/lib/leadNames";
import { pktDateStamp, queueDateAsUtc } from "@/lib/pipelineToday";
import type { LeadSource, Prisma } from "@prisma/client";

export type FocusSyncState = {
  sheetsConfigured: boolean;
  sheetsReason: string | null;
  queueDate: string;
  openCount: number;
  ownerName: string;
  lastSummary: string | null;
  lastSyncAt: string | null;
};

function asStrategy(value: unknown): CampaignStrategy {
  return value as CampaignStrategy;
}

function asSignals(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function shownName(value: string): string {
  return presentLeadName(value) || value;
}

function shownOptionalName(value: string | null): string | null {
  if (!value) return null;
  return presentLeadName(value) || value;
}

/** Open rows on or before this Asia/Karachi day. Done and skipped rows stay excluded. */
function visibleOpenPipelineWhere(organizationId: string, ownerId: string, today: Date) {
  return { organizationId, ownerId, status: "open" as const, queueDate: { lte: today } };
}

type PipelineRowWithLead = Prisma.PipelineTodayRowGetPayload<{
  include: { lead: { include: { campaign: { include: { product: true } } } } };
}>;

function pipelineCard(row: PipelineRowWithLead): ShapeCard {
  const lead = row.lead;
  const channel = row.channel === "linkedin" ? "linkedin" : "email";
  const view: PipelineCardView = {
    rowId: row.id,
    sheetRow: row.sheetRow,
    timeLabel: row.timeLabel,
    actionLabel: row.actionLabel,
    kind: row.kind as PipelineActionKind,
    channel,
    linkKind: row.linkKind as PipelineLinkKind,
    linkUrl: row.linkUrl,
    mailtoTo: row.mailtoTo,
    mailtoSubject: row.mailtoSubject,
    message: row.message,
    blankMessage: row.connectNoNote,
    connectNoNote: row.connectNoNote,
    outcomeMode: (row.outcomeMode as PipelineOutcomeMode) || "done_skip",
    intel: row.intel,
    company: shownName(row.company),
  };
  return {
    lead: {
      id: lead.id,
      businessName: shownName(lead.businessName),
      contactName: shownOptionalName(lead.contactName),
      contactRole: lead.contactRole,
      city: lead.city,
      region: lead.region,
      country: lead.country,
      cadenceStep: lead.cadenceStep,
      nextChannelOverride: lead.nextChannelOverride,
      signals: asSignals(lead.signals),
      phone: lead.phone,
      email: lead.email,
      instagramUrl: lead.instagramUrl,
      linkedinUrl: lead.linkedinUrl,
      website: lead.website,
      sourceUrl: lead.sourceUrl,
      fitScore: lead.fitScore,
      fitReasons: (lead.fitReasons as string[] | null) ?? [row.intel],
      fitFlags: (lead.fitFlags as string[] | null) ?? [],
      source: lead.source,
      lastTouchLabel: null,
    },
    campaign: {
      id: lead.campaign.id,
      name: lead.campaign.name,
      productName: lead.campaign.product.name,
      strategy: asStrategy(lead.campaign.strategy),
    },
    label: row.actionLabel,
    linkedinRequestSent: row.kind !== "linkedin_request",
    replyOnly: true,
    openReplies: [],
    pipeline: view,
  };
}

async function loadSyncState(ownerId: string, organizationId: string, ownerName: string, queueDate: string): Promise<FocusSyncState> {
  const queueDay = queueDateAsUtc(queueDate);
  const [openCount, last] = await Promise.all([
    prisma.pipelineTodayRow.count({ where: visibleOpenPipelineWhere(organizationId, ownerId, queueDay) }),
    prisma.auditLog.findFirst({
      where: { organizationId, action: "pipeline_today_synced", entityId: ownerId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const after = asSignals(last?.after);
  const sheets = sheetsConfigStatus();
  const lastSummary = last ? `${String(after.open ?? openCount)} open · ${String(after.source ?? "sync")}` : null;
  return {
    sheetsConfigured: sheets.configured,
    sheetsReason: sheets.configured ? null : sheets.reason,
    queueDate,
    openCount,
    ownerName,
    lastSummary,
    lastSyncAt: last?.createdAt.toISOString() ?? null,
  };
}

export async function loadFocusBoard(ownerId: string, organizationId: string) {
  const focusOwner = await resolveFocusTodayOwner(organizationId);
  const suppressCall = focusOwner?.id === ownerId;
  const queueDate = pktDateStamp();
  const queueDay = queueDateAsUtc(queueDate);
  const sync = suppressCall && focusOwner ? await loadSyncState(ownerId, organizationId, focusOwner.fullName, queueDate) : null;

  // Open rows only, including ones queued on an earlier Asia/Karachi day.
  // Done, skipped, follow-up, and dropped stay off the board. queueDate is
  // left as stored, so a later sync still only replaces that day's open rows
  // and a finished card is not reopened. See pipelineCardStaysVisible.
  const pipelineRows = suppressCall
    ? await prisma.pipelineTodayRow.findMany({
        where: visibleOpenPipelineWhere(organizationId, ownerId, queueDay),
        orderBy: [{ queueDate: "asc" }, { sheetRow: "asc" }],
        include: { lead: { include: { campaign: { include: { product: true } } } } },
      })
    : [];

  const queue = await getQueueForUser(ownerId, 50);
  const queueIds = queue.map((item) => item.lead.id);

  const [sentRows, replies, directory] = await Promise.all([
    queueIds.length === 0
      ? Promise.resolve([] as { leadId: string }[])
      : prisma.touch.findMany({
          where: { leadId: { in: queueIds }, organizationId, channel: "linkedin", outcome: "sent" },
          select: { leadId: true },
          distinct: ["leadId"],
        }),
    prisma.reply.findMany({
      where: { status: "open", organizationId, lead: { ownerId } },
      include: { lead: { include: { campaign: { include: { product: true } } } } },
      orderBy: { receivedAt: "asc" },
      take: 40,
    }),
    prisma.lead.findMany({
      where: { ownerId, organizationId, status: { in: ["queued", "in_cadence", "replied", "deal"] } },
      select: {
        id: true,
        contactName: true,
        businessName: true,
        cadenceStep: true,
        nextChannelOverride: true,
        campaign: { select: { strategy: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const linkedinSent = new Set(sentRows.map((row) => row.leadId));
  const repliesByLead = new Map<string, ShapeReply[]>();
  for (const reply of replies) {
    const list = repliesByLead.get(reply.leadId) ?? [];
    list.push({
      id: reply.id,
      channel: reply.channel,
      text: reply.text,
      responseDraft: reply.responseDraft,
    });
    repliesByLead.set(reply.leadId, list);
  }

  const cards: ShapeCard[] = [
    ...pipelineRows.map(pipelineCard),
    ...queue.map(({ lead, campaign, label }) => ({
      lead: {
        id: lead.id,
        businessName: shownName(lead.businessName),
        contactName: shownOptionalName(lead.contactName),
        contactRole: lead.contactRole,
        city: lead.city,
        region: lead.region,
        country: lead.country,
        cadenceStep: lead.cadenceStep,
        nextChannelOverride: lead.nextChannelOverride,
        signals: asSignals(lead.signals),
        phone: lead.phone,
        email: lead.email,
        instagramUrl: lead.instagramUrl,
        linkedinUrl: lead.linkedinUrl,
        website: lead.website,
        sourceUrl: lead.sourceUrl,
        fitScore: lead.fitScore,
        fitReasons: (lead.fitReasons as string[] | null) ?? [],
        fitFlags: (lead.fitFlags as string[] | null) ?? [],
        source: lead.source,
        lastTouchLabel: formatLastTouch(lead.touches[0] ?? null),
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
        productName: campaign.product.name,
        strategy: asStrategy(campaign.strategy),
      },
      label,
      linkedinRequestSent: linkedinSent.has(lead.id),
      openReplies: repliesByLead.get(lead.id) ?? [],
    })),
  ];

  const queued = new Set(queueIds);
  for (const reply of replies) {
    if (queued.has(reply.leadId)) continue;
    queued.add(reply.leadId);
    const lead = reply.lead;
    cards.push({
      lead: {
        id: lead.id,
        businessName: shownName(lead.businessName),
        contactName: shownOptionalName(lead.contactName),
        contactRole: lead.contactRole,
        city: lead.city,
        region: lead.region,
        country: lead.country,
        cadenceStep: lead.cadenceStep,
        nextChannelOverride: lead.nextChannelOverride,
        signals: asSignals(lead.signals),
        phone: lead.phone,
        email: lead.email,
        instagramUrl: lead.instagramUrl,
        linkedinUrl: lead.linkedinUrl,
        website: lead.website,
        sourceUrl: lead.sourceUrl,
        fitScore: lead.fitScore,
        fitReasons: (lead.fitReasons as string[] | null) ?? [],
        fitFlags: (lead.fitFlags as string[] | null) ?? [],
        source: lead.source as LeadSource,
        lastTouchLabel: null,
      },
      campaign: {
        id: lead.campaign.id,
        name: lead.campaign.name,
        productName: lead.campaign.product.name,
        strategy: asStrategy(lead.campaign.strategy),
      },
      label: "Reply",
      linkedinRequestSent: true,
      replyOnly: true,
      openReplies: repliesByLead.get(lead.id) ?? [],
    });
  }

  const coachLeads = directory.map(coachLeadFromRow);

  return { cards, coachLeads, suppressCall, sync };
}

function coachLeadFromRow(lead: {
  id: string;
  contactName: string | null;
  businessName: string;
  cadenceStep: number;
  nextChannelOverride: CoachDirectoryLead["channel"] | null;
  campaign: { strategy: unknown };
}): CoachDirectoryLead {
  return {
    id: lead.id,
    contactName: shownOptionalName(lead.contactName),
    businessName: shownName(lead.businessName),
    channel: resolveLeadChannel({
      strategy: asStrategy(lead.campaign.strategy),
      cadenceStep: lead.cadenceStep,
      nextChannelOverride: lead.nextChannelOverride,
    }),
  };
}
