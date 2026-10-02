"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { incrementDailyCount } from "@/server/targets";
import { resolveFocusTodayOwner } from "@/server/focusTodayOwner";
import { applyPipelineTodaySync } from "@/server/pipelineTodaySync";
import { readPipelineTodayGrid } from "@/server/googleSheets";
import { trySheetDualWrite } from "@/server/sheetDualWrite";
import { parseTable } from "@/lib/pipelineToday";

const syncSchema = z.object({
  source: z.enum(["sheets", "paste"]),
  text: z.string().max(500_000).optional(),
});

const outcomeSchema = z.object({
  rowId: z.string().min(1),
  outcome: z.enum(["done", "skip", "needs_follow_up"]),
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

function summaryMessage(input: {
  open: number;
  stored: number;
  filteredCalls: number;
  sheetDone: number;
  ownerName: string;
}): string {
  const calls = input.filteredCalls > 0 ? ` Dropped ${input.filteredCalls} call ${input.filteredCalls === 1 ? "row" : "rows"}.` : "";
  const done = input.sheetDone > 0 ? ` ${input.sheetDone} already marked done on the sheet.` : "";
  return `${input.open} open ${input.open === 1 ? "card" : "cards"} on ${input.ownerName}'s Focus (${input.stored} rows stored).${done}${calls}`;
}

export async function syncPipelineToday(raw: z.input<typeof syncSchema>): Promise<PipelineSyncResult> {
  const params = syncSchema.parse(raw);
  const user = await requireUser();
  const owner = await resolveFocusTodayOwner(user.organizationId);
  if (!owner) {
    return {
      ok: false,
      message: "Couldn't find Muqeet. Set FOCUS_TODAY_OWNER_EMAIL to his login (muqeet@nerdflow.tech).",
    };
  }
  if (user.role !== "lead" && user.id !== owner.id) {
    return { ok: false, message: "Only Muqeet or a lead can sync Today." };
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
    ownerId: owner.id,
    source: params.source,
    grid,
  });
  revalidateWork();
  return {
    ok: true,
    message: summaryMessage({ ...summary, ownerName: owner.fullName.trim().split(/\s+/)[0] || "Muqeet" }),
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
  if (row.ownerId !== user.id) throw new Error("That card is on Muqeet's queue.");

  const status = params.outcome === "done" ? "done" : params.outcome === "skip" ? "skipped" : "follow_up";
  const touchOutcome = params.outcome === "needs_follow_up" ? "talked_not_now" : "sent";
  const reason =
    params.outcome === "needs_follow_up"
      ? "needs_follow_up"
      : row.kind === "linkedin_request"
        ? "connection_request"
        : row.kind === "reply"
          ? "reply_dm"
          : `pipeline_${row.kind}`;

  const touchId = await prisma.$transaction(async (tx) => {
    await tx.pipelineTodayRow.update({ where: { id: row.id }, data: { status } });
    if (params.outcome === "skip") return null;
    const touch = await tx.touch.create({
      data: {
        organizationId: user.organizationId,
        leadId: row.leadId,
        userId: user.id,
        channel: row.channel,
        step: row.lead.cadenceStep,
        outcome: touchOutcome,
        reason,
        occurredAt: new Date(),
      },
    });
    if (params.outcome === "needs_follow_up") {
      const deal = await tx.deal.findFirst({
        where: { leadId: row.leadId, stage: { notIn: ["won", "lost"] } },
      });
      if (deal) {
        await tx.deal.update({
          where: { id: deal.id },
          data: {
            nextStepText: row.actionLabel.slice(0, 280),
            nextStepAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }
    }
    return touch.id;
  });

  if (params.outcome === "done" && row.kind !== "next_action") {
    try {
      await incrementDailyCount(user.id, user.organizationId, row.channel);
    } catch (err) {
      console.error("[pipeline-today] daily count failed", err instanceof Error ? err.message : "error");
    }
  }

  const nextStep =
    params.outcome === "skip"
      ? null
      : params.outcome === "needs_follow_up"
        ? "needs_follow_up"
        : row.kind === "reply"
          ? "awaiting_reply"
          : row.kind === "linkedin_request"
            ? "email_or_wait_accept"
            : row.kind === "next_action"
              ? "done"
              : "next_cadence";

  const sheet = await trySheetDualWrite({
    action: "pipeline_today_outcome",
    leadId: row.leadId,
    channel: row.channel,
    outcome: params.outcome,
    actorId: user.id,
    nextStep,
    contactName: row.contactName,
    businessName: row.company,
    note: row.actionLabel,
    sheetRow: row.sheetRow,
    timePkt: row.timeLabel,
  });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "pipeline_today_outcome",
    entityType: "lead",
    entityId: row.leadId,
    after: {
      rowId: row.id,
      sheetRow: row.sheetRow,
      kind: row.kind,
      outcome: params.outcome,
      touchId,
      sheetDualWrite: sheet.todo,
    },
  });
  revalidateWork();
  return { ok: true as const, touchId };
}
