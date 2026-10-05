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
} from "@/lib/outreachKb";
import { requireUser } from "@/server/auth";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";

const payloadSchema = z.record(z.string(), z.unknown());

const statusSchema = z.enum(KB_STATUSES);
const layerSchema = z.enum(KB_LAYERS);
const scopeSchema = z.enum(KB_SCOPES);

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  payload: payloadSchema,
  status: statusSchema,
  layer: layerSchema,
  kind: z.string().trim().min(1).max(80),
  scope: scopeSchema,
  icp: z.string().trim().max(80).nullable(),
  confirmLocked: z.boolean().optional(),
});

const createSchema = updateSchema.omit({ id: true }).extend({
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

export async function updateOutreachKbEntry(raw: z.input<typeof updateSchema>) {
  const user = await requireUser();
  assertEditor(user.role);
  const input = updateSchema.parse(raw);
  const row = await prisma.outreachKbEntry.findFirst({
    where: { id: input.id, organizationId: user.organizationId },
  });
  if (!row) throw new Error("That row is not in this organization.");
  assertLock(row.payload, input.confirmLocked);
  assertLock(input.payload, input.confirmLocked);
  const icp = normalizeIcp(input.scope, input.icp);
  const saved = await prisma.outreachKbEntry.update({
    where: { id: row.id },
    data: {
      title: input.title,
      body: input.body,
      payload: input.payload as Prisma.InputJsonValue,
      status: input.status,
      layer: input.layer,
      kind: input.kind,
      scope: input.scope,
      icp,
      version: row.version + 1,
      updatedById: user.id,
    },
  });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "kb_updated",
    entityType: "outreach_kb_entry",
    entityId: saved.id,
    before: { title: row.title, status: row.status, kind: row.kind },
    after: { title: saved.title, status: saved.status, kind: saved.kind },
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
  assertLock(input.payload, input.confirmLocked);
  const icp = normalizeIcp(input.scope, input.icp);
  // A new row is always a draft. Status on the request is ignored so a lead cannot approve it in the same step.
  try {
    const saved = await prisma.outreachKbEntry.create({
      data: {
        organizationId: user.organizationId,
        key: input.key,
        title: input.title,
        body: input.body,
        payload: input.payload as Prisma.InputJsonValue,
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
    await writeAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "kb_created",
      entityType: "outreach_kb_entry",
      entityId: saved.id,
      after: { key: saved.key, title: saved.title, status: saved.status, kind: saved.kind },
    });
    revalidatePath("/knowledge");
    return { id: saved.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("A row with that key already exists.");
    }
    throw err;
  }
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
  if (row.status === "retired") return { id: row.id };
  const saved = await prisma.outreachKbEntry.update({
    where: { id: row.id },
    data: { status: "retired", version: row.version + 1, updatedById: user.id },
  });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "kb_archived",
    entityType: "outreach_kb_entry",
    entityId: saved.id,
    before: { status: row.status },
    after: { status: saved.status },
  });
  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${saved.id}`);
  revalidatePath("/focus");
  return { id: saved.id };
}
