import Link from "next/link";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { buildBrief } from "@/server/brief";
import { getQueueForUser } from "@/server/queue";
import { computeFlags, STAGE_LABEL } from "@/server/deals";
import { getOrgSettings } from "@/server/settings";
import { zonedParts } from "@/server/cadence";
import { Panel, Chip, Ring } from "@/components/ui";
import { BriefVoiceLine } from "@/components/BriefVoiceLine";
import { EndOfDayCard } from "@/components/EndOfDayCard";
import type { Channel } from "@prisma/client";

const CHANNEL_LABEL: Record<Channel, string> = { call: "Call", email: "Email", instagram: "Instagram", linkedin: "LinkedIn" };

export default async function TodayPage() {
  const user = await requireUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [settings, { lines, pacing }, queue, deals, todayStat, yesterdayTouches] = await Promise.all([
    getOrgSettings(),
    buildBrief(user),
    getQueueForUser(user.id, 50),
    prisma.deal.findMany({
      where: { ownerId: user.id, stage: { notIn: ["won", "lost"] } },
      include: { people: true, lead: true },
      orderBy: { updatedAt: "asc" },
      take: 10,
    }),
    prisma.dailyStat.findUnique({ where: { userId_date: { userId: user.id, date: today } } }),
    prisma.touch.findMany({
      where: { userId: user.id, occurredAt: { gte: yesterday, lt: today }, outcome: { in: ["interested", "replied"] } },
      include: { lead: true },
      take: 5,
    }),
  ]);

  const dealsNeedingAttention = deals
    .map((deal) => ({
      deal,
      flags: computeFlags({ stage: deal.stage, lastActivityAt: deal.updatedAt, nextStepAt: deal.nextStepAt, people: deal.people }),
    }))
    .filter((d) => d.flags.length > 0)
    .slice(0, 3);

  const openReplyCount = await prisma.reply.count({ where: { status: "open", lead: { ownerId: user.id, organizationId: user.organizationId } } });

  const countByChannel: Partial<Record<Channel, number>> = {};
  for (const { lead, campaign } of queue) {
    const step = (campaign.strategy as { cadence?: { channel: Channel }[] })?.cadence?.[lead.cadenceStep];
    const ch: Channel = step?.channel ?? "email";
    countByChannel[ch] = (countByChannel[ch] ?? 0) + 1;
  }

  const nowLocal = zonedParts(new Date(), user.timezone);
  const workingHours = user.workingHours as { start: string; end: string };
  const endHour = Number(workingHours?.end?.split(":")[0] ?? 17);
  const isEndOfDay = nowLocal.hour >= endHour;

  return (
    <div>
      <BriefVoiceLine assistantName={settings.assistantName} initialLines={lines} />

      <div className="flex flex-wrap gap-2 mb-6">
        <Link href="/focus">
          <span className="inline-block bg-accent text-on-accent font-semibold px-4 py-2.5 rounded-lg">Start a Focus session</span>
        </Link>
        {openReplyCount > 0 && (
          <Link href="/replies">
            <span className="inline-block bg-stop-soft text-stop font-semibold px-4 py-2.5 rounded-lg">
              Handle {openReplyCount} {openReplyCount === 1 ? "reply" : "replies"}
            </span>
          </Link>
        )}
      </div>

      <Panel className="mb-6">
        <h2 className="text-[17px] font-medium mb-4">Today&apos;s targets</h2>
        {pacing.perMetric.length === 0 ? (
          <p className="text-sm text-muted">No targets set yet.</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            {pacing.perMetric.map((m, i) => (
              <Ring key={m.metric} value={m.count} target={m.target} label={m.label} colorIndex={i} />
            ))}
          </div>
        )}
      </Panel>

      <Panel className="mb-6">
        <h2 className="text-[17px] font-medium mb-3">Ready now</h2>
        <div className="flex flex-wrap gap-2">
          {(["call", "email", "instagram", "linkedin"] as Channel[]).map((ch) => (
            <Link key={ch} href="/focus">
              <span className="inline-flex items-center gap-1.5 text-sm border border-rule rounded-full px-3 py-1.5 hover:border-accent">
                {CHANNEL_LABEL[ch]} <Chip tone="acc">{countByChannel[ch] ?? 0}</Chip>
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      {yesterdayTouches.length > 0 && (
        <Panel className="mb-6">
          <h2 className="text-[17px] font-medium mb-3">Yesterday&apos;s wins</h2>
          <ul className="list-none m-0 p-0 space-y-1.5">
            {yesterdayTouches.map((t) => (
              <li key={t.id} className="text-sm">
                <span className="font-medium">{t.lead.businessName}</span> — {t.outcome === "interested" ? "went interested" : "replied"}
              </li>
            ))}
          </ul>
        </Panel>
      )}

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

      {isEndOfDay && <EndOfDayCard alreadyClosedOut={Boolean(todayStat?.closedOutAt)} existingSummary={todayStat?.aiSummary ?? null} />}
    </div>
  );
}
