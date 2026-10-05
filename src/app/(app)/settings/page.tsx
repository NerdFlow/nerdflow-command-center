import { parseFocusCadence } from "@/lib/focusCadence";
import { parseMailboxSignatures } from "@/lib/mailboxSignature";
import { outreachDraftAiConfig } from "@/server/ai/draftModel";
import { requireRole } from "@/server/auth";
import { loadOutreachUsage } from "@/server/kb/load";
import { getOrgSettings } from "@/server/settings";
import { SettingsClient } from "@/components/SettingsClient";
import { ProductsPanel } from "@/components/ProductsPanel";
import { listProducts } from "@/server/actions/products";

export default async function SettingsPage() {
  const user = await requireRole(["lead"]);
  const [settings, products, usage] = await Promise.all([
    getOrgSettings(),
    listProducts(),
    loadOutreachUsage(user.organizationId),
  ]);

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Settings</h1>
      <p className="text-muted mb-6">Domain, assistant name, Focus cadence, AI budget, outreach drafts, and products.</p>
      <div className="space-y-4">
        <SettingsClient
          ai={outreachDraftAiConfig()}
          usage={usage}
          settings={{
            allowedEmailDomain: settings.allowedEmailDomain,
            assistantName: settings.assistantName,
            leadDailyCapDefault: settings.leadDailyCapDefault,
            aiMonthlyBudgetUsd: settings.aiMonthlyBudgetUsd,
            workingHoursDefault: settings.workingHoursDefault as { start: string; end: string },
            focusCadence: parseFocusCadence(settings.focusCadence),
            outreachDraftKillSwitch: settings.outreachDraftKillSwitch,
            outreachDraftDailyCap: settings.outreachDraftDailyCap,
            postalAddress: settings.postalAddress ?? "",
            optOutLine: settings.optOutLine ?? "",
            mailboxSignatures: parseMailboxSignatures(settings.mailboxSignatures),
          }}
        />
        <ProductsPanel products={products} />
      </div>
    </div>
  );
}
