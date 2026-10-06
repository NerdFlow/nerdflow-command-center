"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  KB_LAYERS,
  KB_SCOPES,
  KB_STATUSES,
  canEditOutreachKb,
  isLockedProductTruth,
  kbEditDeniedMessage,
  lockedEditDeniedMessage,
  mergeKbPayload,
} from "@/lib/outreachKb";
import { requireUser } from "@/server/auth";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { clearApprovedKbCache } from "@/server/kb/load";

const payloadSchema = z.record(z.string(), z.unknown());

const statusSchema = z.enum(KB_STATUSES);
const layerSchema = z.enum(KB_LAYERS);
const scopeSchema = z.enum(KB_SCOPES);

const sharedSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  status: statusSchema,
  layer: layerSchema,
  kind: z.string().trim().min(1).max(80),
  scope: scopeSchema,
  icp: z.string().trim().max(80).nullable(),
  confirmLocked: z.boolean().optional(),
  claim: z.string().trim().min(1).max(120).optional(),
  safeToQuote: z.boolean().optional(),
  doNotQuote: z.boolean().optional(),
  payload: payloadSchema.optional(),
});

const updateSchema = sharedSchema.extend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
});

const createSchema = sharedSchema.extend({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9_.:-]{1,118}$/, "Use a short key like product_truth:price."),
});

const archiveSchema = z.object({
  id: z.string().uuid(),
  confirmLocked: z.boolean().optional(),
});

function assertEditor(role: string) {
  if (!canEditOutreachKb(role)) throw new Error(kbEditDeniedMessage());
}

function assertLock(payload: unknown, confirmLocked: boolean | undefined) {
  if (isLockedProductTruth(payload) && !confirmLocked) throw new Error(lockedEditDeniedMessage());
}

function normalizeIcp(scope: z.infer<typeof scopeSchema>, icp: string | null): string | null {
  if (scope === "universal") return null;
  const value = icp?.trim() ?? "";
  if (!value) throw new Error("An ICP row needs an ICP name.");
  return value;
}

const staleRowMessage = "This row was changed by someone else, reload to see it";

async function auditAfterSave(params: Parameters<typeof writeAuditLog>[0]) {
  try {
    await writeAuditLog(params);
  } catch (err) {
    console.error("[knowledge] audit log failed", err instanceof Error ? err.message : "error");
  }
}

export async function updateOutreachKbEntry(raw: z.input<typeof updateSchema>) {
  const user = await requireUser();
  assertEditor(user.role);
  const input = updateSchema.parse(raw);
  const icp = normalizeIcp(input.scope, input.icp);
  const saved = await prisma.$transaction(async (tx) => {
    const fresh = await tx.outreachKbEntry.findFirst({
      where: { id: input.id, organizationId: user.organizationId },
    });
    if (!fresh) throw new Error("That row is not in this organization.");
    const payload = mergeKbPayload(fresh.payload, input);
    assertLock(fresh.payload, input.confirmLocked);
    assertLock(payload, input.confirmLocked);
    const before = { title: fresh.title, status: fresh.status, kind: fresh.kind };
    const wrote = await tx.outreachKbEntry.updateMany({
      where: { id: fresh.id, organizationId: user.organizationId, version: input.version },
      data: {
        title: input.title,
        body: input.body,
        payload: payload as Prisma.InputJsonValue,
        status: input.status,
        layer: input.layer,
        kind: input.kind,
        scope: input.scope,
        icp,
        version: { increment: 1 },
        updatedById: user.id,
      },
    });
    if (wrote.count === 0) throw new Error(staleRowMessage);
    return { id: fresh.id, before, after: { title: input.title, status: input.status, kind: input.kind } };
  });
  clearApprovedKbCache(user.organizationId);
  await auditAfterSave({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "kb_updated",
    entityType: "outreach_kb_entry",
    entityId: saved.id,
    before: saved.before,
    after: saved.after,
  });
  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${saved.id}`);
  revalidatePath("/focus");
  return { id: saved.id };
}

export async function createOutreachKbEntry(raw: z.input<typeof createSchema>) {
  const user = await requireUser();
  assertEditor(user.role);
  const input = createSchema.parse(raw);
  const icp = normalizeIcp(input.scope, input.icp);
  const payload = mergeKbPayload({}, input);
  assertLock(payload, input.confirmLocked);
  // A new row is always a draft. Status on the request is ignored so a lead cannot approve it in the same step.
  let saved: { id: string; key: string; title: string; status: string; kind: string };
  try {
    saved = await prisma.outreachKbEntry.create({
      data: {
        organizationId: user.organizationId,
        key: input.key,
        title: input.title,
        body: input.body,
        payload: payload as Prisma.InputJsonValue,
        status: "draft",
        layer: input.layer,
        kind: input.kind,
        scope: input.scope,
        icp,
        sourcePath: "app",
        version: 1,
        updatedById: user.id,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("A row with that key already exists.");
    }
    throw err;
  }
  clearApprovedKbCache(user.organizationId);
  await auditAfterSave({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "kb_created",
    entityType: "outreach_kb_entry",
    entityId: saved.id,
    after: { key: saved.key, title: saved.title, status: saved.status, kind: saved.kind },
  });
  revalidatePath("/knowledge");
  return { id: saved.id };
}

export async function archiveOutreachKbEntry(raw: z.input<typeof archiveSchema>) {
  const user = await requireUser();
  assertEditor(user.role);
  const input = archiveSchema.parse(raw);
  const row = await prisma.outreachKbEntry.findFirst({
    where: { id: input.id, organizationId: user.organizationId },
  });
  if (!row) throw new Error("That row is not in this organization.");
  assertLock(row.payload, input.confirmLocked);
  const wrote = await prisma.outreachKbEntry.updateMany({
    where: { id: row.id, organizationId: user.organizationId, status: { not: "retired" } },
    data: { status: "retired", version: { increment: 1 }, updatedById: user.id },
  });
  if (wrote.count === 0) return { id: row.id };
  clearApprovedKbCache(user.organizationId);
  await auditAfterSave({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "kb_archived",
    entityType: "outreach_kb_entry",
    entityId: row.id,
    before: { status: row.status },
    after: { status: "retired" },
  });
  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${row.id}`);
  revalidatePath("/focus");
  return { id: row.id };
}
