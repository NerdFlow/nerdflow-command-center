"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { getDefaultOrgId } from "@/server/org";
import { getOrgSettings } from "@/server/settings";
import { generateTempPassword, hashPassword } from "@/server/password";
import type { Role, TargetMetric } from "@prisma/client";

/** Settings → people: no invite ceremony, just create the account with a temp password shown once. */
export async function addPerson(input: { email: string; fullName: string; role: Role }) {
  const lead = await requireRole(["lead"]);
  const organizationId = await getDefaultOrgId();
  const settings = await getOrgSettings();

  const email = input.email.toLowerCase().trim();
  const domain = email.split("@")[1];
  if (!domain || domain !== settings.allowedEmailDomain.toLowerCase()) {
    throw new Error(`Only @${settings.allowedEmailDomain} email addresses can be added.`);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: { organizationId, email, fullName: input.fullName, role: input.role, status: "active", passwordHash },
  });
  await writeAuditLog({
    organizationId,
    actorId: lead.id,
    action: "user_added",
    entityType: "user",
    entityId: user.id,
    after: { email: user.email, role: user.role },
  });
  revalidatePath("/team");
  return { user, tempPassword };
}

export async function changeUserRole(userId: string, role: Role) {
  const lead = await requireRole(["lead"]);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await writeAuditLog({
    organizationId: lead.organizationId,
    actorId: lead.id,
    action: "user_role_changed",
    entityType: "user",
    entityId: userId,
    before: { role: before.role },
    after: { role },
  });
  revalidatePath("/team");
}

export async function setUserStatus(userId: string, status: "active" | "deactivated") {
  const lead = await requireRole(["lead"]);
  await prisma.user.update({ where: { id: userId }, data: { status, sessionsInvalidatedAt: new Date() } });
  await writeAuditLog({
    organizationId: lead.organizationId,
    actorId: lead.id,
    action: status === "deactivated" ? "user_deactivated" : "user_reactivated",
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/team");
}

export async function setTarget(userId: string, metric: TargetMetric, dailyValue: number) {
  const actor = await requireRole(["lead"]);
  const target = await prisma.target.create({
    data: { organizationId: actor.organizationId, userId, metric, dailyValue, effectiveFrom: new Date(), setById: actor.id },
  });
  await writeAuditLog({
    organizationId: actor.organizationId,
    actorId: actor.id,
    action: "target_set",
    entityType: "target",
    entityId: target.id,
    after: { userId, metric, dailyValue },
  });
  revalidatePath("/team");
  return target;
}

export async function updateOrgSettings(patch: Partial<{
  allowedEmailDomain: string;
  assistantName: string;
  leadDailyCapDefault: number;
  aiMonthlyBudgetUsd: number;
  workingHoursDefault: { start: string; end: string; days: number[] };
}>) {
  const lead = await requireRole(["lead"]);
  await prisma.orgSettings.update({ where: { organizationId: lead.organizationId }, data: patch });
  await writeAuditLog({
    organizationId: lead.organizationId,
    actorId: lead.id,
    action: "org_settings_updated",
    entityType: "org_settings",
    after: patch,
  });
  revalidatePath("/settings");
}
