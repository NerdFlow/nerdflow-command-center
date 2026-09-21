import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { STAGE_LABEL, STAGE_ORDER } from "@/server/deals";
import { Panel } from "@/components/ui";

export default async function AdminPipelinePage() {
  const user = await requireRole(["admin"]);
  const deals = await prisma.deal.findMany({
    where: { organizationId: user.organizationId },
    include: { product: true, lead: true },
  });

  const byStage = STAGE_ORDER.map((stage) => ({
    stage,
    count: deals.filter((d) => d.stage === stage).length,
    value: deals.filter((d) => d.stage === stage).reduce((s, d) => s + Number(d.valueMonthlyUsd ?? 0), 0),
  }));
  const won = deals.filter((d) => d.stage === "won");
  const lost = deals.filter((d) => d.stage === "lost");
  const stuck = deals.filter((d) => d.stage !== "won" && d.stage !== "lost" && Date.now() - d.updatedAt.getTime() > 7 * 86_400_000);

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="text-[17px] font-medium mb-3">By stage</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted">
              <th className="text-left font-medium py-1">Stage</th>
              <th className="text-left font-medium py-1">Count</th>
              <th className="text-left font-medium py-1">Value (monthly USD)</th>
            </tr>
          </thead>
          <tbody>
            {byStage.map((s) => (
              <tr key={s.stage} className="border-t border-rule">
                <td className="py-1.5">{STAGE_LABEL[s.stage]}</td>
                <td className="py-1.5">{s.count}</td>
                <td className="py-1.5">${s.value.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-medium mb-2">This month</h2>
        <p className="text-sm">
          {won.length} won · {lost.length} lost
        </p>
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-medium mb-2">Stuck deals (7+ days quiet)</h2>
        {stuck.length === 0 ? (
          <p className="text-sm text-muted">Nothing stuck right now.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {stuck.map((d) => (
              <li key={d.id}>{d.lead.businessName} — {STAGE_LABEL[d.stage]}</li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
