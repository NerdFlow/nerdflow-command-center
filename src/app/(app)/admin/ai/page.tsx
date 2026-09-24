import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";
import { Bar, Panel } from "@/components/ui";
import { isAiEnabled } from "@/server/ai/client";

export default async function AdminAiPage() {
  const user = await requireRole(["admin"]);
  const settings = await getOrgSettings();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usage = await prisma.aiUsage.findMany({
    where: { organizationId: user.organizationId, createdAt: { gte: startOfMonth } },
  });

  const totalCost = usage.reduce((s, u) => s + Number(u.costUsd), 0);
  const byFeature = new Map<string, { cost: number; calls: number; failures: number }>();
  for (const u of usage) {
    const entry = byFeature.get(u.feature) ?? { cost: 0, calls: 0, failures: 0 };
    entry.cost += Number(u.costUsd);
    entry.calls += 1;
    if (!u.success) entry.failures += 1;
    byFeature.set(u.feature, entry);
  }
  const avgLatency = usage.length ? Math.round(usage.reduce((s, u) => s + u.latencyMs, 0) / usage.length) : 0;
  const budgetPct = settings.aiMonthlyBudgetUsd > 0 ? Math.round((totalCost / settings.aiMonthlyBudgetUsd) * 100) : 0;

  const wrongReviews = await prisma.review.findMany({
    where: { repFeedback: "wrong" },
    include: { conversation: true },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      {!isAiEnabled() && (
        <Panel>
          <p className="text-sm text-muted">
            No Gemini or Claude API key is set — every AI feature is running its rule-based fallback right now, so
            there&apos;s no usage to show yet. Set GEMINI_API_KEY and AI_PROVIDER=gemini to turn Gemini on.
          </p>
        </Panel>
      )}

      <Panel>
        <h2 className="text-[17px] font-medium mb-2">Budget</h2>
        <div className="flex justify-between text-sm mb-1">
          <span>
            ${totalCost.toFixed(2)} of ${settings.aiMonthlyBudgetUsd} this month
          </span>
          <span className={budgetPct >= 80 ? "text-stop font-semibold" : "text-muted"}>{budgetPct}%</span>
        </div>
        <Bar pct={budgetPct} tone={budgetPct >= 80 ? "accent" : "go"} />
        <p className="text-xs text-muted mt-2">Average latency: {avgLatency}ms</p>
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Usage by feature</h2>
        {byFeature.size === 0 ? (
          <p className="text-sm text-muted">No AI calls logged this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium py-1">Feature</th>
                <th className="text-left font-medium py-1">Calls</th>
                <th className="text-left font-medium py-1">Failures</th>
                <th className="text-left font-medium py-1">Cost</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byFeature.entries()).map(([feature, stat]) => (
                <tr key={feature} className="border-t border-rule">
                  <td className="py-1.5">{feature}</td>
                  <td className="py-1.5">{stat.calls}</td>
                  <td className="py-1.5">{stat.failures}</td>
                  <td className="py-1.5">${stat.cost.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-medium mb-2">Quality queue — reviews marked &quot;Wrong&quot;</h2>
        {wrongReviews.length === 0 ? (
          <p className="text-sm text-muted">None yet (reviews ship in Phase 3).</p>
        ) : (
          <ul className="text-sm space-y-1">
            {wrongReviews.map((r) => (
              <li key={r.id}>
                {r.conversation.title} — {r.repFeedbackNote || "no note"}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
