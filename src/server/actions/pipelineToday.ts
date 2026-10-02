"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveFocusTodayOwner } from "@/server/focusTodayOwner";
import { applyPipelineTodaySync } from "@/server/pipelineTodaySync";
import { readPipelineTodayGrid } from "@/server/googleSheets";
import { commitPipelineTodayOutcome } from "@/server/pipelineTodayOutcome";
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

  const saved = await commitPipelineTodayOutcome({
    organizationId: user.organizationId,
    actorId: user.id,
    row,
    outcome: params.outcome,
  });
  revalidateWork();
  return { ok: true as const, touchId: saved.touchId };
}
