import Link from "next/link";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel } from "@/components/ui";
import { TeamPeopleClient } from "@/components/TeamPeopleClient";

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function TeamPage({ searchParams }: { searchParams: { week?: string } }) {
  const user = await requireRole(["lead"]);

  const weekStart = searchParams.week ? new Date(searchParams.week) : startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const prevWeek = new Date(weekStart);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { fullName: "asc" },
    include: { targetsOwned: { orderBy: { effectiveFrom: "desc" } } },
  });

  const rows = await Promise.all(
    users.map(async (rep) => {
      const stats = await prisma.dailyStat.findMany({ where: { userId: rep.id, date: { gte: weekStart, lt: weekEnd } } });
      const touches = await prisma.touch.findMany({ where: { userId: rep.id, occurredAt: { gte: weekStart, lt: weekEnd } } });
      const dealsCreated = await prisma.deal.count({ where: { ownerId: rep.id, createdAt: { gte: weekStart, lt: weekEnd } } });
      const dealsWon = await prisma.deal.count({ where: { ownerId: rep.id, wonAt: { gte: weekStart, lt: weekEnd } } });

      const avgTargetPct = stats.length ? Math.round(stats.reduce((s, d) => s + (d.targetPct ?? 0), 0) / stats.length) : 0;
      const sends = touches.filter((t) => t.outcome === "sent" || t.channel === "call").length;
      const replies = touches.filter((t) => t.outcome === "replied").length;
      const meetings = stats.reduce((s, d) => s + d.meetingsBooked, 0);

      return {
        rep,
        avgTargetPct,
        sends,
        replies,
        replyRate: sends > 0 ? Math.round((replies / sends) * 100) : 0,
        meetings,
        dealsCreated,
        dealsWon,
        streak: stats.at(-1)?.streakAfter ?? 0,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] tracking-tight mb-1.5">Team</h1>
        <p className="text-muted m-0">People, targets and how the week is going.</p>
      </div>

      <TeamPeopleClient
        users={users.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          role: u.role,
          status: u.status,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          targets: u.targetsOwned.map((t) => ({ id: t.id, metric: t.metric, dailyValue: t.dailyValue, effectiveFrom: t.effectiveFrom.toISOString() })),
        }))}
      />

      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[17px] font-medium m-0">This week</h2>
          <div className="flex gap-3 text-sm items-center">
            <Link href={`/team?week=${prevWeek.toISOString().slice(0, 10)}`} className="text-accent font-medium">
              ← Prior week
            </Link>
            <span className="text-muted">Week of {weekStart.toLocaleDateString()}</span>
            <Link href={`/team?week=${nextWeek.toISOString().slice(0, 10)}`} className="text-accent font-medium">
              Next week →
            </Link>
          </div>
        </div>
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-muted">
                  <th className="text-left font-medium py-1.5">Rep</th>
                  <th className="text-left font-medium py-1.5">Target %</th>
                  <th className="text-left font-medium py-1.5">Sends</th>
                  <th className="text-left font-medium py-1.5">Replies</th>
                  <th className="text-left font-medium py-1.5">Reply rate</th>
                  <th className="text-left font-medium py-1.5">Meetings</th>
                  <th className="text-left font-medium py-1.5">Deals created</th>
                  <th className="text-left font-medium py-1.5">Deals won</th>
                  <th className="text-left font-medium py-1.5">Streak</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rep.id} className="border-t border-rule">
                    <td className="py-2 font-medium">{r.rep.fullName}</td>
                    <td className="py-2">{r.avgTargetPct}%</td>
                    <td className="py-2">{r.sends}</td>
                    <td className="py-2">{r.replies}</td>
                    <td className="py-2">{r.replyRate}%</td>
                    <td className="py-2">{r.meetings}</td>
                    <td className="py-2">{r.dealsCreated}</td>
                    <td className="py-2">{r.dealsWon}</td>
                    <td className="py-2">{r.streak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
