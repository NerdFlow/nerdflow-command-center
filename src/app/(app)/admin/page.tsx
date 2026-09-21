import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel } from "@/components/ui";

export default async function AdminOverviewPage() {
  const user = await requireRole(["admin"]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({ where: { organizationId: user.organizationId, status: { not: "deactivated" } } });
  const todayStats = await prisma.dailyStat.findMany({ where: { organizationId: user.organizationId, date: today } });
  const statByUser = new Map(todayStats.map((s) => [s.userId, s]));

  const touchesToday = await prisma.touch.count({ where: { organizationId: user.organizationId, occurredAt: { gte: today } } });
  const repliesToday = await prisma.touch.count({
    where: { organizationId: user.organizationId, occurredAt: { gte: today }, outcome: "replied" },
  });
  const dealsMovedToday = await prisma.deal.count({ where: { organizationId: user.organizationId, stageChangedAt: { gte: today } } });
  const closedOutToday = todayStats.filter((s) => s.closedOutAt).length;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dailyTrend: { date: string; touches: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const count = await prisma.touch.count({ where: { organizationId: user.organizationId, occurredAt: { gte: day, lt: next } } });
    dailyTrend.push({ date: day.toLocaleDateString(undefined, { weekday: "short" }), touches: count });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        {[
          { label: "Touches today", value: touchesToday },
          { label: "Replies today", value: repliesToday },
          { label: "Deals moved today", value: dealsMovedToday },
          { label: "Closed out today", value: `${closedOutToday}/${users.length}` },
        ].map((stat) => (
          <Panel key={stat.label}>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-xs text-muted">{stat.label}</div>
          </Panel>
        ))}
      </div>

      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Who&apos;s active today</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted">
              <th className="text-left font-medium py-1">Name</th>
              <th className="text-left font-medium py-1">Role</th>
              <th className="text-left font-medium py-1">Target %</th>
              <th className="text-left font-medium py-1">Closed out</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const stat = statByUser.get(u.id);
              return (
                <tr key={u.id} className="border-t border-rule">
                  <td className="py-1.5">{u.fullName}</td>
                  <td className="py-1.5">{u.role}</td>
                  <td className="py-1.5">{stat?.targetPct ?? "—"}</td>
                  <td className="py-1.5">{stat?.closedOutAt ? "Yes" : "Not yet"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Last 7 days — touches</h2>
        <div className="flex gap-3 items-end h-24">
          {dailyTrend.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div
                className="w-full bg-accent rounded-t"
                style={{ height: `${Math.max(4, (d.touches / Math.max(1, ...dailyTrend.map((x) => x.touches))) * 80)}px` }}
              />
              <span className="text-xs text-muted">{d.date}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
