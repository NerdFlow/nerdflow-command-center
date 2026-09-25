import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel } from "@/components/ui";

export default async function LeadGenerationPage() {
  const user = await requireUser();
  const runs = await prisma.leadSourceRun.findMany({
    where: { organizationId: user.organizationId },
    include: { campaign: true },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Lead Generation</h1>
      <p className="text-muted mb-6">AI scrapes and scores leads from Google in real time.</p>

      <Panel className="mb-6">
        <p className="text-sm text-muted">
          <b className="text-ink">Not built yet.</b> This is Phase 2b work: Google search by city × keyword, visiting
          each business&apos;s website, extracting contacts, scoring against a campaign&apos;s ICP, deduping, and landing
          everything in Lead review — with a live run view and a cost estimate shown before it starts. Import leads
          via CSV on the Lead Inbox page in the meantime.
        </p>
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Run history</h2>
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
