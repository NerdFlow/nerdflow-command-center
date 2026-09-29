import { requireRole } from "@/server/auth";
import { getOrgSettings } from "@/server/settings";
import { SettingsClient } from "@/components/SettingsClient";
import { ProductsPanel } from "@/components/ProductsPanel";
import { listProducts } from "@/server/actions/products";

export default async function SettingsPage() {
  await requireRole(["lead"]);
  const [settings, products] = await Promise.all([getOrgSettings(), listProducts()]);

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Settings</h1>
      <p className="text-muted mb-6">Domain, assistant name, AI budget, default working hours, and products.</p>
      <div className="space-y-4">
        <SettingsClient
          settings={{
            allowedEmailDomain: settings.allowedEmailDomain,
            assistantName: settings.assistantName,
            leadDailyCapDefault: settings.leadDailyCapDefault,
            aiMonthlyBudgetUsd: settings.aiMonthlyBudgetUsd,
            workingHoursDefault: settings.workingHoursDefault as { start: string; end: string },
          }}
        />
        <ProductsPanel products={products} />
      </div>
    </div>
  );
}
