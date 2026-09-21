import Link from "next/link";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { buildBrief } from "@/server/brief";
import { getQueueForUser } from "@/server/queue";
import { computeFlags, STAGE_LABEL } from "@/server/deals";
import { getOrgSettings } from "@/server/settings";
import { Panel, Bar, Chip } from "@/components/ui";
import { BriefVoiceLine } from "@/components/BriefVoiceLine";

export default async function TodayPage() {
  const user = await requireUser();

  // These four don't depend on each other's results — run them in one
  // parallel batch instead of four sequential round trips to the database.
  const [settings, { lines, pacing }, queue, deals, closedOutCount] = await Promise.all([
    getOrgSettings(),
    buildBrief(user),
    getQueueForUser(user.id, 6),
    prisma.deal.findMany({
      where: { ownerId: user.id, stage: { notIn: ["won", "lost"] } },
      include: { people: true, lead: true },
      orderBy: { updatedAt: "asc" },
      take: 10,
    }),
    prisma.dailyStat.count({ where: { userId: user.id, closedOutAt: { not: null } } }),
  ]);

  const dealsNeedingAttention = deals
    .map((deal) => ({
      deal,
      flags: computeFlags({
        stage: deal.stage,
        lastActivityAt: deal.updatedAt,
        nextStepAt: deal.nextStepAt,
        people: deal.people,
      }),
    }))
    .filter((d) => d.flags.length > 0)
    .slice(0, 3);

  const showFirstWeekChecklist = closedOutCount < 5;

  return (
    <div>
      <BriefVoiceLine assistantName={settings.assistantName} initialLines={lines} />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] mb-6">
        <Panel>
          <h2 className="text-[17px] font-medium mb-3">Today&apos;s targets</h2>
          {pacing.perMetric.length === 0 && <p className="text-sm text-muted">No targets set yet.</p>}
          {pacing.perMetric.map((m) => (
            <div key={m.metric} className="mb-2.5">
              <div className="flex justify-between text-sm">
                <span>{m.label}</span>
                <span className="text-muted">
                  {m.count} / {m.target}
                </span>
              </div>
              <Bar pct={m.pct} tone={m.pct >= 100 ? "go" : "accent"} />
            </div>
          ))}
        </Panel>

        <Panel>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[17px] font-medium m-0">Up next</h2>
            <Link href="/focus" className="text-sm text-accent font-medium">
              Open Focus →
            </Link>
          </div>
          <ul className="list-none m-0 p-0">
            {queue.length === 0 && <li className="text-sm text-muted py-2">Nothing queued right now.</li>}
            {queue.map(({ lead, campaign, label }) => (
              <li key={lead.id} className="flex justify-between items-center gap-2.5 py-2.5 border-b border-rule last:border-0">
                <div>
                  <div className="text-sm font-medium">{lead.businessName}</div>
                  <div className="text-xs text-muted">{campaign.name}</div>
                </div>
                <Chip tone={label === "Hot" ? "hot" : "default"}>{label}</Chip>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {dealsNeedingAttention.length > 0 && (
        <Panel className="mb-6">
          <h2 className="text-[17px] font-medium mb-3">Deals needing attention</h2>
          <ul className="list-none m-0 p-0">
            {dealsNeedingAttention.map(({ deal, flags }) => (
              <li key={deal.id} className="flex justify-between items-center gap-2.5 py-2.5 border-b border-rule last:border-0">
                <div>
                  <div className="text-sm font-medium">
                    <Link href={`/deals/${deal.id}`} className="hover:text-accent">
                      {deal.lead.businessName}
                    </Link>
                  </div>
                  <div className="text-xs text-muted">{STAGE_LABEL[deal.stage]}</div>
                </div>
                <div>
                  {flags.map((f) => (
                    <Chip key={f.key} tone="stop">
                      {f.label}
                    </Chip>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {showFirstWeekChecklist && (
        <Panel>
          <h2 className="text-[17px] font-medium mb-2">Your first week</h2>
          <p className="text-sm text-muted mb-3">Build these five habits and the rest gets easier.</p>
          <div className="text-sm space-y-1.5">
            <div>☑ Close out {closedOutCount} / 5 days</div>
            <div className="text-muted">Debrief a conversation — unlocks in Phase 3</div>
            <div className="text-muted">Run a practice session — unlocks in Phase 3</div>
          </div>
          <div className="mt-3">
            <Link href="/onboarding" className="text-sm text-muted hover:text-ink underline">
              Replay onboarding
            </Link>
          </div>
        </Panel>
      )}
    </div>
  );
}
