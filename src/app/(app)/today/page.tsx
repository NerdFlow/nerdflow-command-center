import Link from "next/link";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { buildBrief } from "@/server/brief";
import { getQueueForUser } from "@/server/queue";
import { computeFlags, STAGE_LABEL } from "@/server/deals";
import { getOrgSettings } from "@/server/settings";
import { zonedParts } from "@/server/cadence";
import { tallyFocusChannels } from "@/lib/focusQueue";
import { Chip, Ring, SectionLabel } from "@/components/ui";
import { BriefVoiceLine } from "@/components/BriefVoiceLine";
import { EndOfDayCard } from "@/components/EndOfDayCard";
import type { Channel } from "@prisma/client";

const CHANNEL_LABEL: Record<Channel, string> = {
  call: "Call",
  email: "Email",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

const METRIC_FRIENDLY: Record<string, { label: string; hint: string }> = {
  leads_verified: { label: "Leads ready", hint: "Moves when new leads land in your queue" },
  emails: { label: "Emails", hint: "Counts each email you log as sent" },
  calls: { label: "Calls", hint: "Counts each call outcome you log" },
  instagram_dms: { label: "Instagram", hint: "Counts each DM you log as sent" },
  linkedin_messages: { label: "LinkedIn", hint: "Counts each message you log as sent" },
};

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function TodayPage() {
  const user = await requireUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [settings, { lines, pacing }, queue, deals, todayStat, yesterdayTouches, openReplies, oldestOpenReply] =
    await Promise.all([
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
      prisma.reply.findMany({
        where: { status: "open", lead: { ownerId: user.id, organizationId: user.organizationId } },
        include: { lead: true },
        orderBy: { receivedAt: "asc" },
        take: 5,
      }),
      prisma.reply.findFirst({
        where: { status: "open", lead: { ownerId: user.id, organizationId: user.organizationId } },
        orderBy: { receivedAt: "asc" },
        select: { receivedAt: true },
      }),
    ]);

  const openReplyCount = openReplies.length;
  const replyAgeHours = oldestOpenReply
    ? (Date.now() - new Date(oldestOpenReply.receivedAt).getTime()) / (1000 * 60 * 60)
    : 0;
  const repliesUrgent = openReplyCount > 0 && replyAgeHours >= 24;

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

  const countByChannel = tallyFocusChannels(
    queue.map((item) => ({ phone: item.lead.phone, cadence: item.channel ?? "email" })),
  );

  const readyChannels = (["call", "email", "instagram", "linkedin"] as Channel[])
    .map((ch) => ({ ch, count: countByChannel[ch] ?? 0 }))
    .filter((c) => c.count > 0);
  const topChannel = readyChannels.sort((a, b) => b.count - a.count)[0];

  const nowLocal = zonedParts(new Date(), user.timezone);
  const workingHours = user.workingHours as { start: string; end: string };
  const endHour = Number(workingHours?.end?.split(":")[0] ?? 17);
  const isEndOfDay = nowLocal.hour >= endHour;
  const firstName = user.fullName.trim().split(/\s+/)[0] ?? user.fullName;
  const greeting = greetingForHour(nowLocal.hour);

  // One primary CTA: late replies beat starting focus.
  const primaryIsReplies = openReplyCount > 0;

  return (
    <div className="animate-fade-up max-w-cockpit">
      <BriefVoiceLine
        assistantName={settings.assistantName}
        greeting={greeting}
        firstName={firstName}
        initialLines={lines}
      />

      <div className="mt-6 mb-10 space-y-3">
        {primaryIsReplies ? (
          <>
            <Link
              href="/replies"
              className={
                "inline-flex items-center justify-center gap-2 font-semibold px-5 py-3.5 rounded-xl text-[15px] transition-colors " +
                (repliesUrgent
                  ? "bg-stop text-on-accent border border-stop hover:brightness-110"
                  : "bg-accent text-on-accent hover:bg-accent-hover")
              }
            >
              {repliesUrgent
                ? `Answer ${openReplyCount === 1 ? "a reply waiting" : `${openReplyCount} replies waiting`} · ${Math.floor(replyAgeHours / 24)}d late`
                : `Handle ${openReplyCount} ${openReplyCount === 1 ? "reply" : "replies"} first`}
            </Link>
            {topChannel && (
              <div>
                <Link
                  href={`/focus?channel=${topChannel.ch}`}
                  className="quiet-link inline-flex items-center gap-1"
                >
                Or start {CHANNEL_LABEL[topChannel.ch] === "Call" ? "calls" : CHANNEL_LABEL[topChannel.ch].toLowerCase()} ({topChannel.count} ready) →
                </Link>
              </div>
            )}
          </>
        ) : (
          <>
            <Link
              href={topChannel ? `/focus?channel=${topChannel.ch}` : "/focus"}
              className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3.5 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
            >
              {topChannel
                ? `Start ${CHANNEL_LABEL[topChannel.ch].toLowerCase()}s · ${topChannel.count} ready`
                : "Start a Focus session"}
            </Link>
            <div>
              <Link href="/campaigns" className="quiet-link">
                Need leads? Open Campaigns →
              </Link>
            </div>
          </>
        )}
      </div>

      {readyChannels.length > 0 && (
        <section className="mb-10">
          <SectionLabel>Ready now</SectionLabel>
          <div className="flex flex-wrap gap-2.5">
            {readyChannels.map(({ ch, count }) => (
              <Link
                key={ch}
                href={`/focus?channel=${ch}`}
                className="inline-flex items-center gap-3 bg-panel border border-rule rounded-xl px-4 py-3 hover:border-accent/40 transition-colors group"
              >
                <span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-hidden />
                <span className="text-sm text-muted group-hover:text-ink transition-colors">{CHANNEL_LABEL[ch]}</span>
                <span className="stat-number !text-xl text-accent">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <SectionLabel>Today&apos;s targets</SectionLabel>
        {pacing.perMetric.length === 0 ? (
          <p className="text-sm text-muted m-0">No daily targets yet — ask your manager to set them.</p>
        ) : (
          <div className="flex flex-wrap gap-8">
            {pacing.perMetric.map((m) => {
              const friendly = METRIC_FRIENDLY[m.metric] ?? { label: m.label, hint: "Updates when you log work in Focus" };
              return (
                <Ring
                  key={m.metric}
                  value={m.count}
                  target={m.target}
                  label={friendly.label}
                  hint={m.count === 0 ? friendly.hint : undefined}
                />
              );
            })}
          </div>
        )}
      </section>

      {yesterdayTouches.length > 0 && (
        <section className="mb-10">
          <SectionLabel>Yesterday&apos;s wins</SectionLabel>
          <ul className="list-none m-0 p-0 space-y-2">
            {yesterdayTouches.map((t) => (
              <li key={t.id} className="text-sm text-muted">
                <span className="text-ink font-medium">{t.lead.businessName}</span>
                {" — "}
                {t.outcome === "interested" ? "interested" : "replied"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {dealsNeedingAttention.length > 0 && (
        <section className="mb-10">
          <SectionLabel>Deals needing a nudge</SectionLabel>
          <ul className="list-none m-0 p-0 divide-y divide-rule border border-rule rounded-card overflow-hidden bg-panel">
            {dealsNeedingAttention.map(({ deal, flags }) => (
              <li key={deal.id} className="flex justify-between items-center gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/deals/${deal.id}`} className="text-sm font-medium hover:text-accent truncate block">
                    {deal.lead.businessName}
                  </Link>
                  <div className="text-xs text-dim">{STAGE_LABEL[deal.stage]}</div>
                </div>
                <div className="shrink-0">
                  {flags.map((f) => (
                    <Chip key={f.key} tone="stop">
                      {f.label}
                    </Chip>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isEndOfDay && <EndOfDayCard alreadyClosedOut={Boolean(todayStat?.closedOutAt)} existingSummary={todayStat?.aiSummary ?? null} />}
    </div>
  );
}
