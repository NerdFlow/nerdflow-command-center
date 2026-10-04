"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SKIP_REASONS } from "@/lib/skipReason";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { applyFocusCardSkip } from "@/server/skipFocus";
import { FocusIngestError } from "@/server/pipelineTodayOutcome";

const skipSchema = z.object({
  leadId: z.string().min(1),
  pipelineRowId: z.string().min(1).nullable().optional(),
  actionKey: z.string().min(1).max(200),
  reason: z.enum(SKIP_REASONS),
  note: z.string().max(500).optional(),
  returnsOn: z.string().max(40).optional(),
});

function revalidateWork() {
  revalidatePath("/focus");
  revalidatePath("/today");
}

export async function skipFocusCard(raw: z.input<typeof skipSchema>) {
  const params = skipSchema.parse(raw);
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({
    where: { id: params.leadId, organizationId: user.organizationId },
  });
  if (!lead) throw new Error("Lead not found");

  const row = params.pipelineRowId
    ? await prisma.pipelineTodayRow.findFirst({
        where: { id: params.pipelineRowId, organizationId: user.organizationId, leadId: lead.id },
        include: { lead: true },
      })
    : null;
  if (params.pipelineRowId && !row) throw new Error("That card is gone.");
  if (row && row.ownerId !== user.id) throw new Error("That card is on someone else's queue.");
  if (!row && user.role === "rep" && lead.ownerId !== user.id) {
    const assigned = await prisma.pipelineTodayRow.findFirst({
      where: { leadId: lead.id, ownerId: user.id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!assigned) throw new Error("Not your lead");
  }

  try {
    const saved = await applyFocusCardSkip({
      organizationId: user.organizationId,
      actorId: user.id,
      reason: params.reason,
      note: params.note?.trim() || null,
      returnsOn: params.returnsOn?.trim() || null,
      row,
      lead: row?.lead ?? lead,
      actionKey: params.actionKey,
    });
    revalidateWork();
    return saved;
  } catch (err) {
    if (err instanceof FocusIngestError) throw new Error(err.message);
    throw err;
  }
}
