"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";
import { getDefaultOrgId } from "@/server/org";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/server/password";
import { requireUser } from "@/server/auth";
import { writeAuditLog } from "@/server/audit";

export async function signUp(input: { fullName: string; email: string; password: string }) {
  const fullName = input.fullName.trim();
  const email = input.email.toLowerCase().trim();
  const password = input.password;

  if (!fullName) return { ok: false as const, error: "Enter your name." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const settings = await getOrgSettings();
  const domain = email.split("@")[1];
  if (!domain || domain !== settings.allowedEmailDomain.toLowerCase()) {
    return { ok: false as const, error: `Only @${settings.allowedEmailDomain} email addresses can sign up.` };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false as const, error: "That email already has an account — sign in instead." };
  }

  const organizationId = await getDefaultOrgId();
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { organizationId, email, fullName, passwordHash, role: "rep", status: "active" },
  });

  await writeAuditLog({
    organizationId,
    actorId: user.id,
    action: "user_signed_up",
    entityType: "user",
    entityId: user.id,
    after: { email: user.email },
  });

  return { ok: true as const };
}

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  const user = await requireUser();
  if (!user.passwordHash) return { ok: false as const, error: "No password set on this account yet." };

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) return { ok: false as const, error: "Current password is wrong." };

  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "password_changed",
    entityType: "user",
    entityId: user.id,
  });

  return { ok: true as const };
}
