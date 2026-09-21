import Link from "next/link";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { computeHealth, computeFlags, STAGE_ORDER, STAGE_LABEL } from "@/server/deals";
import { Panel, Chip } from "@/components/ui";

export default async function DealsPage({ searchParams }: { searchParams: { rep?: string } }) {
  const user = await requireUser();
  const isManager = user.role !== "rep";
  const ownerFilter = isManager ? searchParams.rep : user.id;

  const deals = await prisma.deal.findMany({
    where: {
      organizationId: user.organizationId,
      ...(ownerFilter ? { ownerId: ownerFilter } : {}),
    },
    include: { lead: true, people: true, owner: true, product: true },
  });

  const reps = isManager
    ? await prisma.user.findMany({
        where: { organizationId: user.organizationId, status: { not: "deactivated" } },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      })
    : [];

  const open = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const wonCount = deals.filter((d) => d.stage === "won").length;
  const lostCount = deals.filter((d) => d.stage === "lost").length;

  const withHealth = open.map((deal) => {
    const flags = computeFlags({
      stage: deal.stage,
      lastActivityAt: deal.updatedAt,
      nextStepAt: deal.nextStepAt,
      people: deal.people,
    });
    const health = computeHealth(deal.stage, (deal.checklist as Record<string, boolean>) ?? {}, flags.length);
    return { deal, flags, health };
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-[28px] tracking-tight mb-1.5">Deals</h1>
          <p className="text-muted m-0">
            {wonCount} won · {lostCount} lost
          </p>
        </div>
        {isManager && reps.length > 0 && (
          <form method="get" className="flex items-center gap-2 text-sm">
            <select name="rep" defaultValue={searchParams.rep ?? ""} className="border border-rule rounded-lg px-2 py-1 bg-panel">
              <option value="">Team</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
            <button type="submit" className="text-accent font-medium">
              Apply
            </button>
          </form>
        )}
      </div>

      <div className="grid [grid-template-columns:repeat(5,minmax(200px,1fr))] gap-3 overflow-x-auto pb-2">
        {STAGE_ORDER.map((stage) => {
          const cards = withHealth.filter((d) => d.deal.stage === stage).sort((a, b) => a.health - b.health);
          return (
            <div key={stage} className="bg-panel2 rounded-card p-2.5 min-h-[160px]">
              <div className="text-xs font-semibold text-muted mb-2 px-1">
                {STAGE_LABEL[stage]} ({cards.length})
              </div>
              {cards.map(({ deal, flags, health }) => (
                <Link key={deal.id} href={`/deals/${deal.id}`}>
                  <div className="bg-panel border border-rule rounded-lg px-3 py-2.5 mb-2 hover:border-accent">
                    <div className="text-sm font-medium">{deal.lead.businessName}</div>
                    <div className="text-xs text-muted mb-1.5">
                      {deal.product.name} {isManager && `· ${deal.owner.fullName}`}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{health}</span>
                      {flags[0] && <Chip tone="stop">{flags[0].label}</Chip>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      {open.length === 0 && (
        <Panel className="mt-4">
          <p className="text-muted">No open deals yet — mark a lead Interested in Focus mode to start one.</p>
        </Panel>
      )}
    </div>
  );
}
