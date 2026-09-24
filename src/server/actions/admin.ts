"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { getDefaultOrgId } from "@/server/org";
import { getOrgSettings } from "@/server/settings";
import { generateTempPassword, hashPassword } from "@/server/password";
import type { Role, TargetMetric } from "@prisma/client";

export async function inviteUser(input: { email: string; fullName: string; role: Role }) {
  const admin = await requireRole(["admin"]);
  const organizationId = await getDefaultOrgId();
  const settings = await getOrgSettings();

  const email = input.email.toLowerCase().trim();
  const domain = email.split("@")[1];
  if (!domain || domain !== settings.allowedEmailDomain.toLowerCase()) {
    throw new Error(`Only @${settings.allowedEmailDomain} email addresses can be invited.`);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: {
      organizationId,
      email,
      fullName: input.fullName,
      role: input.role,
      status: "invited",
      passwordHash,
    },
  });
  await writeAuditLog({
    organizationId,
    actorId: admin.id,
    action: "user_invited",
    entityType: "user",
    entityId: user.id,
    after: { email: user.email, role: user.role },
  });
  revalidatePath("/admin/team");
  return { user, tempPassword };
}

export async function changeUserRole(userId: string, role: Role) {
  const admin = await requireRole(["admin"]);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await writeAuditLog({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "user_role_changed",
    entityType: "user",
    entityId: userId,
    before: { role: before.role },
    after: { role },
  });
  revalidatePath("/admin/team");
}

export async function setUserStatus(userId: string, status: "active" | "deactivated") {
  const admin = await requireRole(["admin"]);
  await prisma.user.update({ where: { id: userId }, data: { status, sessionsInvalidatedAt: new Date() } });
  await writeAuditLog({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: status === "deactivated" ? "user_deactivated" : "user_reactivated",
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/admin/team");
}

export async function forceSignOut(userId: string) {
  const admin = await requireRole(["admin"]);
  await prisma.user.update({ where: { id: userId }, data: { sessionsInvalidatedAt: new Date() } });
  await writeAuditLog({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "user_force_signed_out",
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/admin/team");
}

export async function setTarget(userId: string, metric: TargetMetric, dailyValue: number) {
  const actor = await requireRole(["manager", "admin"]);
  const target = await prisma.target.create({
    data: {
      organizationId: actor.organizationId,
      userId,
      metric,
      dailyValue,
      effectiveFrom: new Date(),
      setById: actor.id,
    },
  });
  await writeAuditLog({
    organizationId: actor.organizationId,
    actorId: actor.id,
    action: "target_set",
    entityType: "target",
    entityId: target.id,
    after: { userId, metric, dailyValue },
  });
  revalidatePath("/admin/team");
  revalidatePath("/team");
  return target;
}

export async function updateOrgSettings(patch: Partial<{
  allowedEmailDomain: string;
  welcomeMessage: string;
  assistantName: string;
  campaignLimitPerRep: number;
  leadDailyCapDefault: number;
  autoPauseTouchThreshold: number;
  autoPauseReplyFloorPct: number;
  autoPauseBounceCeilPct: number;
  emailDraftSavingEnabled: boolean;
  recordingConsentPolicy: string;
  aiMonthlyBudgetUsd: number;
}>) {
  const admin = await requireRole(["admin"]);
  await prisma.orgSettings.update({ where: { organizationId: admin.organizationId }, data: patch });
  await writeAuditLog({
    organizationId: admin.organizationId,
    actorId: admin.id,
    action: "org_settings_updated",
    entityType: "org_settings",
    after: patch,
  });
  revalidatePath("/admin/settings");
}
