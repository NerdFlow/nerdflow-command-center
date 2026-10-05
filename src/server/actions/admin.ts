"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { getDefaultOrgId } from "@/server/org";
import { getOrgSettings } from "@/server/settings";
import { generateTempPassword, hashPassword } from "@/server/password";
import { parseChannelCaps, parseChannelsWorked } from "@/lib/focusRouting";
import { rerouteOpenFocusCards } from "@/server/focusRouting";
import type { Channel, Role, TargetMetric } from "@prisma/client";

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

export async function setUserChannels(
  userId: string,
  channelsWorked: Channel[],
  channelDailyCaps: Partial<Record<"email" | "linkedin" | "call", number>>,
) {
  const lead = await requireRole(["lead"]);
  const before = await prisma.user.findFirst({ where: { id: userId, organizationId: lead.organizationId } });
  if (!before) throw new Error("That person is not on this team.");
  const previous = Array.isArray(before.channelsWorked) ? before.channelsWorked : [];
  const channels = [
    ...parseChannelsWorked(channelsWorked),
    ...channelsWorked.filter((channel) => channel === "instagram"),
    ...(previous.includes("instagram") && !channelsWorked.includes("instagram") ? (["instagram"] as Channel[]) : []),
  ];
  const caps = parseChannelCaps(channelDailyCaps);
  await prisma.user.update({
    where: { id: userId },
    data: { channelsWorked: channels, channelDailyCaps: caps },
  });
  await writeAuditLog({
    organizationId: lead.organizationId,
    actorId: lead.id,
    action: "user_channels_updated",
    entityType: "user",
    entityId: userId,
    before: { channelsWorked: before.channelsWorked, channelDailyCaps: before.channelDailyCaps },
    after: { channelsWorked: channels, channelDailyCaps: caps },
  });
  await rerouteOpenFocusCards(lead.organizationId, lead.id);
  revalidatePath("/team");
  revalidatePath("/focus");
  revalidatePath("/today");
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

const focusCadenceSchema = z
  .array(z.object({ day: z.number().int().min(0).max(365), channel: z.enum(["email", "linkedin", "call"]) }))
  .min(1)
  .max(12);

const mailboxSignatureSchema = z.record(
  z.string().trim().email().max(200),
  z.object({
    name: z.string().max(120),
    signature: z.string().max(4000),
  }),
);

const settingsPatchSchema = z.object({
  allowedEmailDomain: z.string().trim().min(1).max(200).optional(),
  assistantName: z.string().trim().min(1).max(80).optional(),
  leadDailyCapDefault: z.number().int().min(1).max(500).optional(),
  aiMonthlyBudgetUsd: z.number().int().min(0).max(100000).optional(),
  workingHoursDefault: z
    .object({
      start: z.string().min(1).max(8),
      end: z.string().min(1).max(8),
      days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    })
    .optional(),
  focusCadence: focusCadenceSchema.optional(),
  outreachDraftKillSwitch: z.boolean().optional(),
  outreachDraftDailyCap: z.number().int().min(1).max(500).optional(),
  postalAddress: z.string().max(800).nullable().optional(),
  optOutLine: z.string().max(500).nullable().optional(),
  mailboxSignatures: mailboxSignatureSchema.optional(),
});

export async function updateOrgSettings(patch: z.input<typeof settingsPatchSchema>) {
  const lead = await requireRole(["lead"]);
  const parsed = settingsPatchSchema.parse(patch);
  const focusCadence = parsed.focusCadence ? [...parsed.focusCadence].sort((a, b) => a.day - b.day) : undefined;
  const postalAddress = parsed.postalAddress === undefined ? undefined : parsed.postalAddress?.trim() || null;
  const optOutLine = parsed.optOutLine === undefined ? undefined : parsed.optOutLine?.trim() || null;
  const mailboxSignatures =
    parsed.mailboxSignatures === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(parsed.mailboxSignatures).map(([email, sig]) => [
            email.toLowerCase(),
            { name: sig.name.trim(), signature: sig.signature.trim() },
          ]),
        );
  const data = {
    ...(parsed.allowedEmailDomain !== undefined ? { allowedEmailDomain: parsed.allowedEmailDomain.toLowerCase() } : {}),
    ...(parsed.assistantName !== undefined ? { assistantName: parsed.assistantName } : {}),
    ...(parsed.leadDailyCapDefault !== undefined ? { leadDailyCapDefault: parsed.leadDailyCapDefault } : {}),
    ...(parsed.aiMonthlyBudgetUsd !== undefined ? { aiMonthlyBudgetUsd: parsed.aiMonthlyBudgetUsd } : {}),
    ...(parsed.workingHoursDefault !== undefined ? { workingHoursDefault: parsed.workingHoursDefault } : {}),
    ...(focusCadence ? { focusCadence } : {}),
    ...(parsed.outreachDraftKillSwitch !== undefined ? { outreachDraftKillSwitch: parsed.outreachDraftKillSwitch } : {}),
    ...(parsed.outreachDraftDailyCap !== undefined ? { outreachDraftDailyCap: parsed.outreachDraftDailyCap } : {}),
    ...(postalAddress !== undefined ? { postalAddress } : {}),
    ...(optOutLine !== undefined ? { optOutLine } : {}),
    ...(mailboxSignatures !== undefined ? { mailboxSignatures } : {}),
  };
  await prisma.orgSettings.update({
    where: { organizationId: lead.organizationId },
    data,
  });
  await writeAuditLog({
    organizationId: lead.organizationId,
    actorId: lead.id,
    action: "org_settings_updated",
    entityType: "org_settings",
    after: {
      ...data,
      mailboxSignatures: mailboxSignatures ? Object.keys(mailboxSignatures) : undefined,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/focus");
}
