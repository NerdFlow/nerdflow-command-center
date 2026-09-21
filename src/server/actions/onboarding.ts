"use server";

import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";

export async function markOnboardingStep(step: string) {
  const user = await requireUser();
  const progress = { ...((user.onboardingProgress as Record<string, boolean>) ?? {}), [step]: true };
  await prisma.user.update({ where: { id: user.id }, data: { onboardingProgress: progress } });
  return progress;
}

export async function saveProfileStep(input: { fullName: string; timezone: string; start: string; end: string }) {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName: input.fullName,
      timezone: input.timezone,
      workingHours: { start: input.start, end: input.end, days: [1, 2, 3, 4, 5] },
    },
  });
  await markOnboardingStep("profile");
}

export async function saveAssistantName(name: string) {
  const user = await requireUser();
  if (user.role === "rep") return;
  await prisma.orgSettings.update({
    where: { organizationId: user.organizationId },
    data: { assistantName: name.trim() || "Flow" },
  });
}

export async function completeOnboarding() {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { onboardingCompletedAt: new Date() } });
}

export async function getOnboardingData() {
  const user = await requireUser();
  const settings = await getOrgSettings();
  const targets = await prisma.target.findMany({ where: { userId: user.id }, orderBy: { effectiveFrom: "desc" } });
  return { user, settings, targets };
}
