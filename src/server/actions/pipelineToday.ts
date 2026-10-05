"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { applyPipelineTodaySync } from "@/server/pipelineTodaySync";
import { readPipelineTodayGrid } from "@/server/googleSheets";
import { commitPipelineTodayOutcome } from "@/server/pipelineTodayOutcome";
import { parseTable } from "@/lib/pipelineToday";
import { firstHttpUrl } from "@/lib/outreachChecklist";
import { assertOutreachSendable, OutreachSendBlocked, sendingMailbox } from "@/server/outreach/sendGate";

const syncSchema = z.object({
  source: z.enum(["sheets", "paste"]),
  text: z.string().max(500_000).optional(),
});

const outcomeSchema = z.object({
  rowId: z.string().min(1),
  outcome: z.enum(["done", "skip", "needs_follow_up"]),
  subject: z.string().max(200).optional(),
  body: z.string().max(8000).optional(),
  openerSourceUrl: z.string().max(2000).nullable().optional(),
});

export type PipelineSyncResult =
  | {
      ok: true;
      message: string;
      open: number;
      stored: number;
      filteredCalls: number;
      sheetDone: number;
      dropped: number;
    }
  | { ok: false; message: string };

function revalidateWork() {
  revalidatePath("/focus");
  revalidatePath("/today");
}

function summaryMessage(input: { open: number; stored: number; sheetDone: number }): string {
  const done = input.sheetDone > 0 ? ` ${input.sheetDone} already marked done on the sheet.` : "";
  return `${input.open} open ${input.open === 1 ? "card" : "cards"} routed across the team (${input.stored} rows stored).${done}`;
}

export async function syncPipelineToday(raw: z.input<typeof syncSchema>): Promise<PipelineSyncResult> {
  const params = syncSchema.parse(raw);
  const user = await requireUser();
  if (user.role !== "lead") {
    return { ok: false, message: "Only a lead can sync Today." };
  }

  let grid: string[][];
  if (params.source === "sheets") {
    const read = await readPipelineTodayGrid();
    if (!read.ok) return { ok: false, message: read.reason };
    grid = read.grid;
  } else {
    const text = params.text?.trim() ?? "";
    if (!text) return { ok: false, message: "Paste the Today tab first. Columns are Time, Name, Company, Action, Link, Message, Done." };
    grid = parseTable(text);
    if (grid.length === 0) return { ok: false, message: "That paste had no rows." };
  }

  const summary = await applyPipelineTodaySync({
    organizationId: user.organizationId,
    actorId: user.id,
    source: params.source,
    grid,
  });
  revalidateWork();
  return {
    ok: true,
    message: summaryMessage(summary),
    open: summary.open,
    stored: summary.stored,
    filteredCalls: summary.filteredCalls,
    sheetDone: summary.sheetDone,
    dropped: summary.dropped,
  };
}

export async function recordPipelineOutcome(raw: z.input<typeof outcomeSchema>) {
  const params = outcomeSchema.parse(raw);
  const user = await requireUser();
  const row = await prisma.pipelineTodayRow.findFirst({
    where: { id: params.rowId, organizationId: user.organizationId },
    include: { lead: true },
  });
  if (!row) throw new Error("That Today card is gone. Sync again.");
  if (row.ownerId !== user.id) throw new Error("That card is on someone else's queue.");
  if (params.outcome === "skip") throw new Error("Skip needs a reason.");

  if (params.outcome === "done") {
    const actionKey = `pipeline:${row.id}`;
    const existing = await prisma.outreachDraft.findUnique({
      where: { organizationId_actionKey: { organizationId: user.organizationId, actionKey } },
    });
    const subject = params.subject ?? existing?.subject ?? row.mailtoSubject ?? "";
    const body = params.body ?? existing?.body ?? row.message;
    const openerSourceUrl = firstHttpUrl(params.openerSourceUrl, existing?.openerSourceUrl, row.lead.sourceUrl, row.intel, row.linkUrl);
    if (params.subject !== undefined || params.body !== undefined) {
      await prisma.outreachDraft.upsert({
        where: { organizationId_actionKey: { organizationId: user.organizationId, actionKey } },
        create: {
          organizationId: user.organizationId,
          userId: user.id,
          leadId: row.leadId,
          actionKey,
          pipelineRowId: row.id,
          channel: row.channel,
          subject,
          body,
          openerSourceUrl,
          regenerateCount: existing?.regenerateCount ?? 0,
          source: "manual",
        },
        update: { subject, body, openerSourceUrl, source: "manual" },
      });
    }
    try {
      await assertOutreachSendable({
        organizationId: user.organizationId,
        mailbox: sendingMailbox({ channel: row.channel, pipeline: true, repEmail: user.email }),
        channel: row.channel,
        kind: row.kind,
        cadenceStep: row.lead.cadenceStep,
        blankMessage: row.connectNoNote || !body.trim(),
        subject,
        body,
        companyName: row.company,
        openerSourceUrl,
        lead: row.lead,
        intel: row.intel,
      });
    } catch (err) {
      if (err instanceof OutreachSendBlocked) throw new Error(err.message);
      throw err;
    }
  }

  const saved = await commitPipelineTodayOutcome({
    organizationId: user.organizationId,
    actorId: user.id,
    row,
    outcome: params.outcome,
  });
  revalidateWork();
  return { ok: true as const, touchId: saved.touchId };
}
