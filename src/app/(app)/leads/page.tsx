import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { stringList } from "@/server/json";
import { LeadInboxTable } from "@/components/LeadInboxTable";
import { LeadImportWizard } from "@/components/LeadImportWizard";
import { EmptyState, Panel } from "@/components/ui";

export default async function LeadInboxPage({ searchParams }: { searchParams: { rep?: string } }) {
  const user = await requireUser();
  const isManager = user.role !== "rep";

  const reps = isManager
    ? await prisma.user.findMany({
        where: { organizationId: user.organizationId, status: { not: "deactivated" } },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      })
    : [];

  const ownerFilter = isManager && searchParams.rep ? searchParams.rep : isManager ? undefined : user.id;

  const leads = await prisma.lead.findMany({
    where: {
      organizationId: user.organizationId,
      status: "inbox",
      ...(ownerFilter ? { ownerId: ownerFilter } : {}),
    },
    include: { campaign: true, sourceRun: true },
    orderBy: { fitScore: "desc" },
  });

  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: user.organizationId, status: { in: ["active", "draft"] } },
    orderBy: { name: "asc" },
  });

  const lastRuns = await prisma.leadSourceRun.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { startedAt: "desc" },
    take: 5,
    include: { campaign: true },
  });

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Lead Inbox</h1>
      <p className="text-muted mb-6">Review new leads before they enter anyone&apos;s queue.</p>

      <div className="mb-6">
        <LeadImportWizard campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      {isManager && reps.length > 0 && (
        <form className="mb-4 flex items-center gap-2 text-sm" method="get">
          <label htmlFor="rep">Filter by rep</label>
          <select id="rep" name="rep" defaultValue={searchParams.rep ?? ""} className="border border-rule rounded-lg px-2 py-1 bg-panel">
            <option value="">All reps</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
          <button className="text-accent font-medium" type="submit">
            Apply
          </button>
        </form>
      )}

      {leads.length === 0 ? (
        <Panel>
          <EmptyState>
            {lastRuns.length === 0 ? (
              <p>No leads yet. Import a CSV above to get started.</p>
            ) : (
              <div className="text-left">
                <p className="mb-2 font-medium text-ink">Nothing waiting in the inbox right now.</p>
                <p className="text-sm mb-3">Last lead source runs:</p>
                <ul className="text-sm space-y-1">
                  {lastRuns.map((r) => (
                    <li key={r.id}>
                      {r.campaign.name} — {r.source} — found {r.found}, new {r.new}, duplicates {r.duplicates} —{" "}
                      {r.startedAt.toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </EmptyState>
        </Panel>
      ) : (
        <LeadInboxTable
          leads={leads.map((l) => ({
            id: l.id,
            businessName: l.businessName,
            contactName: l.contactName,
            city: l.city,
            fitScore: l.fitScore,
            fitReasons: stringList(l.fitReasons),
            fitFlags: stringList(l.fitFlags),
            campaignName: l.campaign.name,
            source: l.source,
            sourceUrl: l.sourceUrl,
            createdAt: l.createdAt.toISOString(),
            signals: l.signals as Record<string, unknown>,
          }))}
        />
      )}
    </div>
  );
}
