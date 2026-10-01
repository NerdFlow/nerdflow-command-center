"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { getSessionActor } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import {
  IMPERSONATION_COOKIE,
  clearImpersonationCookie,
  readImpersonationCookie,
  setImpersonationCookie,
} from "@/server/impersonation";

const userIdSchema = z.string().uuid();

/** Open the app as another person on this team. The manager's own session stays signed in. */
export async function startImpersonation(userId: string) {
  const id = userIdSchema.parse(userId);
  const actor = await getSessionActor();
  if (!actor || actor.role !== "lead") {
    throw new Error("Only a manager can open someone else's account.");
  }
  if (id === actor.id) {
    throw new Error("You're already in your own account.");
  }

  const target = await prisma.user.findFirst({
    where: { id, organizationId: actor.organizationId, status: { not: "deactivated" } },
  });
  if (!target) throw new Error("That person isn't on your team.");

  setImpersonationCookie(actor.id, target.id);
  await writeAuditLog({
    organizationId: actor.organizationId,
    actorId: actor.id,
    action: "impersonation_started",
    entityType: "user",
    entityId: target.id,
    after: { email: target.email },
  });
}

export async function stopImpersonation() {
  const actor = await getSessionActor();
  const claim = readImpersonationCookie(cookies().get(IMPERSONATION_COOKIE)?.value);
  clearImpersonationCookie();
  if (!actor) return;
  await writeAuditLog({
    organizationId: actor.organizationId,
    actorId: actor.id,
    action: "impersonation_stopped",
    entityType: "user",
    entityId: claim?.targetId ?? null,
  });
}
