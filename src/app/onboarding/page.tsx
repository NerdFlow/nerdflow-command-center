import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { getOrgSettings } from "@/server/settings";
import { prisma } from "@/server/db";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const settings = await getOrgSettings();
  // Not gated behind onboardingCompletedAt: "Replay onboarding" (Today's
  // first-week checklist, and the help menu per SPEC 5.2) needs to reopen
  // this even after someone has finished it once.
  const alreadyCompleted = Boolean(user.onboardingCompletedAt);

  const targets = await prisma.target.findMany({ where: { userId: user.id }, orderBy: { effectiveFrom: "desc" } });
  const workingHours = user.workingHours as { start: string; end: string; days: number[] };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <OnboardingWizard
          user={{ fullName: user.fullName, email: user.email, role: user.role, timezone: user.timezone, workingHours }}
          assistantName={settings.assistantName}
          welcomeMessage={settings.welcomeMessage}
          targets={targets.map((t) => ({ metric: t.metric, dailyValue: t.dailyValue }))}
          progress={(user.onboardingProgress as Record<string, boolean>) ?? {}}
          alreadyCompleted={alreadyCompleted}
        />
      </div>
    </div>
  );
}
