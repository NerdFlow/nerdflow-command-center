import type { ChecklistCatalog, SafeQuote } from "@/lib/outreachChecklist";
import { parseMailboxSignatures, type MailboxSignatureMap } from "@/lib/mailboxSignature";
import { pktDateStamp } from "@/lib/pipelineToday";
import { prisma } from "@/server/db";
import { PENDING_DRAFT_MODEL } from "@/server/outreach/draftCap";
import type { KbContextRow } from "@/server/kb/types";

export type OutreachDraftView = {
  subject: string;
  body: string;
  regenerateCount: number;
  openerSourceUrl: string | null;
  source: string;
};

export type OutreachUsage = {
  draftsToday: number;
  tokensToday: number;
  tokensMonth: number;
  costMonthUsd: number;
  lastDraftLatencyMs: number | null;
  lastDraftModel: string | null;
};

export type OutreachFocusData = {
  drafts: Record<string, OutreachDraftView>;
  catalog: ChecklistCatalog;
  signatures: MailboxSignatureMap;
  postalAddress: string | null;
  optOutLine: string | null;
  killSwitch: boolean;
  dailyCap: number;
  usage: OutreachUsage;
};

export function pktDayStart(now = new Date()): Date {
  return new Date(`${pktDateStamp(now)}T00:00:00+05:00`);
}

export function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function loadOutreachForFocus(organizationId: string, userId: string): Promise<OutreachFocusData> {
  const [settings, entries, drafts, usage] = await Promise.all([
    prisma.orgSettings.findUnique({ where: { organizationId } }),
    prisma.outreachKbEntry.findMany({
      where: { organizationId, status: "approved", kind: { in: ["banned_phrase", "market_fact"] } },
    }),
    prisma.outreachDraft.findMany({ where: { organizationId, userId } }),
    loadOutreachUsage(organizationId),
  ]);
  const catalog = catalogFromEntries(entries);
  const draftMap: Record<string, OutreachDraftView> = {};
  for (const draft of drafts) {
    draftMap[draft.actionKey] = {
      subject: draft.subject,
      body: draft.body,
      regenerateCount: draft.regenerateCount,
      openerSourceUrl: draft.openerSourceUrl,
      source: draft.source,
    };
  }
  return {
    drafts: draftMap,
    catalog,
    signatures: parseMailboxSignatures(settings?.mailboxSignatures),
    postalAddress: settings?.postalAddress ?? null,
    optOutLine: settings?.optOutLine ?? null,
    killSwitch: settings?.outreachDraftKillSwitch ?? false,
    dailyCap: settings?.outreachDraftDailyCap ?? 60,
    usage,
  };
}

const APPROVED_KB_CACHE_MS = 60_000;

const approvedKbCache = new Map<string, { at: number; entries: KbContextRow[] }>();

export function clearApprovedKbCache(organizationId?: string): void {
  if (organizationId) approvedKbCache.delete(organizationId);
  else approvedKbCache.clear();
}

/** Approved rows for one org. A short cache so a batch does not reload the pack on every card. */
export async function loadApprovedKbEntries(organizationId: string): Promise<KbContextRow[]> {
  const cached = approvedKbCache.get(organizationId);
  if (cached && Date.now() - cached.at < APPROVED_KB_CACHE_MS) return cached.entries;
  const rows = await prisma.outreachKbEntry.findMany({ where: { organizationId, status: "approved" } });
  const entries = rows.map((row) => ({
    key: row.key,
    layer: row.layer,
    kind: row.kind,
    icp: row.icp,
    scope: row.scope,
    status: row.status,
    title: row.title,
    body: row.body,
    payload: (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {}) as Record<string, unknown>,
    sourcePath: row.sourcePath,
    version: row.version,
  }));
  approvedKbCache.set(organizationId, { at: Date.now(), entries });
  return entries;
}

export async function loadOutreachUsage(organizationId: string): Promise<OutreachUsage> {
  const [today, month, last] = await Promise.all([
    prisma.aiUsage.aggregate({
      where: { organizationId, feature: "outreach_draft", createdAt: { gte: pktDayStart() } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.aiUsage.aggregate({
      where: { organizationId, feature: "outreach_draft", createdAt: { gte: monthStartUtc() } },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
    }),
    prisma.aiUsage.findFirst({
      where: { organizationId, feature: "outreach_draft", model: { not: PENDING_DRAFT_MODEL } },
      orderBy: { createdAt: "desc" },
      select: { latencyMs: true, model: true },
    }),
  ]);
  return {
    draftsToday: today._count._all,
    tokensToday: (today._sum.inputTokens ?? 0) + (today._sum.outputTokens ?? 0),
    tokensMonth: (month._sum.inputTokens ?? 0) + (month._sum.outputTokens ?? 0),
    costMonthUsd: Number(month._sum.costUsd ?? 0),
    lastDraftLatencyMs: last?.latencyMs ?? null,
    lastDraftModel: last?.model ?? null,
  };
}

export async function countDraftsToday(organizationId: string): Promise<number> {
  return prisma.aiUsage.count({
    where: { organizationId, feature: "outreach_draft", createdAt: { gte: pktDayStart() } },
  });
}

export function catalogFromEntries(entries: { kind: string; title: string; body: string; payload: unknown }[]): ChecklistCatalog {
  const bannedPhrases = entries.filter((entry) => entry.kind === "banned_phrase").map((entry) => entry.body.trim()).filter(Boolean);
  const safeQuotes: SafeQuote[] = [];
  const doNotQuote: string[] = [];
  for (const entry of entries) {
    if (entry.kind !== "market_fact") continue;
    const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? (entry.payload as Record<string, unknown>) : {};
    if (payload.safeToQuote === true) {
      const sources = Array.isArray(payload.sources) ? payload.sources.filter((item): item is string => typeof item === "string") : [];
      safeQuotes.push({ text: entry.body, sources });
    }
    if (payload.doNotQuote === true) doNotQuote.push(entry.title);
  }
  return { bannedPhrases, safeQuotes, doNotQuote };
}
