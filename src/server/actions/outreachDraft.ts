"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fallbackOutreachDraft } from "@/lib/outreachFallback";
import { checklistApplies, firstHttpUrl } from "@/lib/outreachChecklist";
import { parseMailboxSignatures, signatureForMailbox } from "@/lib/mailboxSignature";
import { outreachBlockReason } from "@/lib/replyLog";
import { AiUnavailableError, callClaudeJSON } from "@/server/ai/client";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildOutreachDraftPrompt } from "@/server/ai/prompts/outreach-draft";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getKbContext, renderWriteOutreachContext } from "@/server/kb/context";
import { countDraftsToday, loadApprovedKbEntries } from "@/server/kb/load";
import { claimOutreachDraftSlot, releaseUnloggedDraftSlot } from "@/server/outreach/reserveDraftSlot";
import { sendingMailbox } from "@/server/outreach/sendGate";
import type { Channel } from "@prisma/client";

const draftSchema = z.object({
  subject: z.string().max(120),
  body: z.string().min(1).max(4000),
});

const cardSchema = z.object({
  actionKey: z.string().min(1).max(200),
  leadId: z.string().min(1),
  pipelineRowId: z.string().min(1).nullable().optional(),
  channel: z.enum(["email", "linkedin"]),
  kind: z.string().min(1).max(40),
  mode: z.enum(["generate", "regenerate"]),
});

const saveSchema = cardSchema.omit({ mode: true }).extend({
  subject: z.string().max(200),
  body: z.string().max(8000),
  openerSourceUrl: z.string().max(2000).nullable().optional(),
});

export type SavedOutreachDraft = {
  subject: string;
  body: string;
  regenerateCount: number;
  openerSourceUrl: string | null;
  source: string;
};

async function loadOwnedLead(organizationId: string, userId: string, leadId: string, pipelineRowId?: string | null) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
    include: { campaign: { include: { product: true } } },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.ownerId === userId) return lead;
  if (pipelineRowId) {
    const row = await prisma.pipelineTodayRow.findFirst({
      where: { id: pipelineRowId, organizationId, ownerId: userId, leadId },
    });
    if (row) return lead;
  }
  throw new Error("That card is on someone else's queue.");
}

function icpName(productName: string, summary: string): string | null {
  const blob = `${productName} ${summary}`.toLowerCase();
  if (/receptai|contractor|hvac|plumb|electric|roof|pest|garage/.test(blob)) return "contractors";
  return null;
}

function firstName(contactName: string | null): string {
  return contactName?.trim().split(/\s+/)[0] || "there";
}

const DRAFT_BATCH_CONCURRENCY = 4;

async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

export async function generateOutreachDraft(raw: z.input<typeof cardSchema>): Promise<{ draft: SavedOutreachDraft; usedToday: number; reused: boolean }> {
  const params = cardSchema.parse(raw);
  const user = await requireUser();
  const lead = await loadOwnedLead(user.organizationId, user.id, params.leadId, params.pipelineRowId);
  const claim = await claimOutreachDraftSlot({
    organizationId: user.organizationId,
    userId: user.id,
    actionKey: params.actionKey,
    mode: params.mode,
    dnc: outreachBlockReason(lead) !== null,
  });
  if (!claim.ok) throw new Error(claim.reason);
  if (claim.reuse) {
    return { reused: true, usedToday: claim.usedToday, draft: claim.draft };
  }

  let subject = "";
  let body = "";
  let source: "generate" | "regenerate" | "fallback" = params.mode === "regenerate" ? "regenerate" : "generate";
  let openerSourceUrl = claim.openerSourceUrl;
  let reservationFinal = false;
  try {
    const settings = await prisma.orgSettings.findUnique({ where: { organizationId: user.organizationId } });
    const pipeline = params.pipelineRowId
      ? await prisma.pipelineTodayRow.findFirst({ where: { id: params.pipelineRowId, organizationId: user.organizationId } })
      : null;
    const mailbox = sendingMailbox({ channel: params.channel, pipeline: Boolean(pipeline), repEmail: user.email });
    const signature = signatureForMailbox(parseMailboxSignatures(settings?.mailboxSignatures), mailbox);
    const fact = [pipeline?.intel, Array.isArray(lead.fitReasons) ? (lead.fitReasons as string[]).join("\n") : ""]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1500);
    openerSourceUrl = firstHttpUrl(claim.openerSourceUrl, lead.sourceUrl, pipeline?.intel, pipeline?.linkUrl);
    const strategy = lead.campaign.strategy && typeof lead.campaign.strategy === "object" ? (lead.campaign.strategy as { summary?: string }) : {};
    const entries = await loadApprovedKbEntries(user.organizationId);
    const kb = renderWriteOutreachContext(
      getKbContext({
        entries,
        task: "write_outreach",
        icp: icpName(lead.campaign.product.name, strategy.summary ?? ""),
        channel: params.channel,
      }),
    );
    const senderName = signature?.name || user.fullName;
    try {
      const drafted = await callClaudeJSON({
        feature: "outreach_draft",
        model: process.env.AI_MODEL_FAST,
        system: `${SYSTEM_PROMPT}\n\nPrompt version: ${PROMPT_VERSION}`,
        prompt: buildOutreachDraftPrompt({
          channel: params.channel,
          kb,
          firstName: firstName(lead.contactName),
          company: lead.businessName,
          city: lead.city ?? "",
          senderName,
          signature: signature?.signature || null,
          openerSourceUrl,
          fact,
          emailStep: params.kind === "reply" ? "reply" : params.kind === "follow_up" || params.kind === "next_action" || lead.cadenceStep > 0 ? "later" : "first",
        }),
        schema: draftSchema,
        organizationId: user.organizationId,
        userId: user.id,
        maxTokens: 800,
        cardId: params.actionKey,
        taskType: params.mode === "regenerate" ? "regenerate" : "generate",
        usageId: claim.usageId,
      });
      subject = drafted.subject.trim();
      body = drafted.body.trim();
      reservationFinal = true;
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      reservationFinal = err.logged;
      if (!err.logged) await releaseUnloggedDraftSlot(claim.usageId);
      const fallback = fallbackOutreachDraft({
        channel: params.channel,
        firstName: firstName(lead.contactName),
        company: lead.businessName,
        senderName,
      });
      subject = fallback.subject;
      body = fallback.body;
      source = "fallback";
      reservationFinal = true;
    }
  } catch (err) {
    if (!reservationFinal) await releaseUnloggedDraftSlot(claim.usageId);
    throw err;
  }

  const saved = await prisma.outreachDraft.upsert({
    where: { organizationId_actionKey: { organizationId: user.organizationId, actionKey: params.actionKey } },
    create: {
      organizationId: user.organizationId,
      userId: user.id,
      leadId: lead.id,
      actionKey: params.actionKey,
      pipelineRowId: params.pipelineRowId ?? null,
      channel: params.channel as Channel,
      subject,
      body,
      openerSourceUrl,
      regenerateCount: claim.regenerateCount,
      source,
    },
    update: {
      subject,
      body,
      openerSourceUrl,
      regenerateCount: claim.regenerateCount,
      source,
      userId: user.id,
      pipelineRowId: params.pipelineRowId ?? null,
    },
  });
  revalidatePath("/focus");
  return {
    reused: false,
    usedToday: await countDraftsToday(user.organizationId),
    draft: {
      subject: saved.subject,
      body: saved.body,
      regenerateCount: saved.regenerateCount,
      openerSourceUrl: saved.openerSourceUrl,
      source: saved.source,
    },
  };
}

export async function generateOutreachDraftsForToday(
  rawCards: z.input<typeof cardSchema>[],
): Promise<{ generated: number; skipped: number; message: string }> {
  const cards = z.array(cardSchema).max(80).parse(rawCards);
  const user = await requireUser();
  await loadApprovedKbEntries(user.organizationId);
  let generated = 0;
  let skipped = 0;
  let message = "";
  let stop = false;
  const waiting = cards.filter((card) => {
    const applies = checklistApplies({
      channel: card.channel,
      kind: card.kind,
      blankMessage: card.kind === "linkedin_request",
    });
    if (!applies) skipped += 1;
    return applies;
  });
  await mapWithConcurrency(waiting, DRAFT_BATCH_CONCURRENCY, async (card) => {
    if (stop) return;
    try {
      const result = await generateOutreachDraft({ ...card, mode: "generate" });
      if (result.reused) skipped += 1;
      else generated += 1;
    } catch (err) {
      if (!message) message = err instanceof Error ? err.message : "Stopped.";
      stop = true;
    }
  });
  if (!message) message = `Generated ${generated} draft${generated === 1 ? "" : "s"}.`;
  else if (generated > 0) message = `Generated ${generated} draft${generated === 1 ? "" : "s"}. ${message}`;
  return { generated, skipped, message };
}

export async function saveOutreachDraft(raw: z.input<typeof saveSchema>): Promise<SavedOutreachDraft> {
  const params = saveSchema.parse(raw);
  const user = await requireUser();
  const lead = await loadOwnedLead(user.organizationId, user.id, params.leadId, params.pipelineRowId);
  if (outreachBlockReason(lead) !== null) throw new Error("Do not contact. Generate is off and send is blocked.");
  const existing = await prisma.outreachDraft.findUnique({
    where: { organizationId_actionKey: { organizationId: user.organizationId, actionKey: params.actionKey } },
  });
  const opener = firstHttpUrl(params.openerSourceUrl, lead.sourceUrl);
  const saved = await prisma.outreachDraft.upsert({
    where: { organizationId_actionKey: { organizationId: user.organizationId, actionKey: params.actionKey } },
    create: {
      organizationId: user.organizationId,
      userId: user.id,
      leadId: lead.id,
      actionKey: params.actionKey,
      pipelineRowId: params.pipelineRowId ?? null,
      channel: params.channel as Channel,
      subject: params.subject.trim(),
      body: params.body.trim(),
      openerSourceUrl: opener,
      regenerateCount: 0,
      source: "manual",
    },
    update: {
      subject: params.subject.trim(),
      body: params.body.trim(),
      openerSourceUrl: opener,
      source: existing?.source === "generate" || existing?.source === "regenerate" ? "manual" : existing?.source ?? "manual",
      userId: user.id,
    },
  });
  return {
    subject: saved.subject,
    body: saved.body,
    regenerateCount: saved.regenerateCount,
    openerSourceUrl: saved.openerSourceUrl,
    source: saved.source,
  };
}
