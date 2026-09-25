import { requireRole } from "@/server/auth";
import { getOrgSettings } from "@/server/settings";
import { SettingsClient } from "@/components/SettingsClient";

export default async function SettingsPage() {
  await requireRole(["lead"]);
  const settings = await getOrgSettings();

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Settings</h1>
      <p className="text-muted mb-6">Domain, assistant name, AI budget, and default working hours.</p>
      <SettingsClient
        settings={{
          allowedEmailDomain: settings.allowedEmailDomain,
          assistantName: settings.assistantName,
          leadDailyCapDefault: settings.leadDailyCapDefault,
          aiMonthlyBudgetUsd: settings.aiMonthlyBudgetUsd,
          workingHoursDefault: settings.workingHoursDefault as { start: string; end: string },
        }}
      />
    </div>
  );
}
