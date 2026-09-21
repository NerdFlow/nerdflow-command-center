import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel } from "@/components/ui";

export default async function AdminLeadEnginePage() {
  const user = await requireRole(["admin"]);
  const runs = await prisma.leadSourceRun.findMany({
    where: { organizationId: user.organizationId },
    include: { campaign: true },
    orderBy: { startedAt: "desc" },
    take: 30,
  });

  return (
    <div className="space-y-4">
      <Panel>
        <p className="text-sm text-muted">
          Automatic discovery (Google Places, open data, Apollo enrichment, OpenClaw ingest, nightly scheduling) ships
          in Phase 4. The run log below already fills in from CSV imports.
        </p>
      </Panel>
      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Run log</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium py-1">Campaign</th>
                <th className="text-left font-medium py-1">Source</th>
                <th className="text-left font-medium py-1">Found</th>
                <th className="text-left font-medium py-1">New</th>
                <th className="text-left font-medium py-1">Duplicates</th>
                <th className="text-left font-medium py-1">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-rule">
                  <td className="py-1.5">{r.campaign.name}</td>
                  <td className="py-1.5">{r.source}</td>
                  <td className="py-1.5">{r.found}</td>
                  <td className="py-1.5">{r.new}</td>
                  <td className="py-1.5">{r.duplicates}</td>
                  <td className="py-1.5 text-muted">{r.startedAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
