import { requireRole } from "@/server/auth";
import { getOrgSettings } from "@/server/settings";
import { AdminSettingsForm } from "@/components/AdminSettingsForm";

export default async function AdminSettingsPage() {
  await requireRole(["admin"]);
  const settings = await getOrgSettings();

  return (
    <AdminSettingsForm
      settings={{
        allowedEmailDomain: settings.allowedEmailDomain,
        welcomeMessage: settings.welcomeMessage,
        assistantName: settings.assistantName,
        campaignLimitPerRep: settings.campaignLimitPerRep,
        leadDailyCapDefault: settings.leadDailyCapDefault,
        autoPauseTouchThreshold: settings.autoPauseTouchThreshold,
        autoPauseReplyFloorPct: settings.autoPauseReplyFloorPct,
        autoPauseBounceCeilPct: settings.autoPauseBounceCeilPct,
        emailDraftSavingEnabled: settings.emailDraftSavingEnabled,
        recordingConsentPolicy: settings.recordingConsentPolicy,
        aiMonthlyBudgetUsd: settings.aiMonthlyBudgetUsd,
      }}
    />
  );
}
