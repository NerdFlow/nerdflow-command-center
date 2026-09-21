import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel, Chip } from "@/components/ui";

export default async function TeamPage() {
  const user = await requireRole(["manager", "admin"]);

  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { fullName: "asc" },
  });

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const rows = await Promise.all(
    users.map(async (u) => {
      const stats = await prisma.dailyStat.findMany({ where: { userId: u.id, date: { gte: sevenDaysAgo } } });
      const openDeals = await prisma.deal.count({ where: { ownerId: u.id, stage: { notIn: ["won", "lost"] } } });
      const avg = stats.length ? Math.round(stats.reduce((s, d) => s + (d.targetPct ?? 0), 0) / stats.length) : 0;
      const progress = (u.onboardingProgress as Record<string, boolean>) ?? {};
      const progressCount = Object.values(progress).filter(Boolean).length;
      return { u, avg, openDeals, progressCount, streak: stats.at(-1)?.streakAfter ?? 0 };
    }),
  );

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Team</h1>
      <p className="text-muted mb-6">Read-only. Role changes, deactivation and target history live in Admin.</p>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium py-1.5">Name</th>
                <th className="text-left font-medium py-1.5">Role</th>
                <th className="text-left font-medium py-1.5">Status</th>
                <th className="text-left font-medium py-1.5">Onboarding</th>
                <th className="text-left font-medium py-1.5">7-day target avg</th>
                <th className="text-left font-medium py-1.5">Streak</th>
                <th className="text-left font-medium py-1.5">Open deals</th>
                <th className="text-left font-medium py-1.5">Last login</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ u, avg, openDeals, progressCount, streak }) => (
                <tr key={u.id} className="border-t border-rule">
                  <td className="py-2 font-medium">{u.fullName}</td>
                  <td className="py-2">{u.role}</td>
                  <td className="py-2">
                    <Chip tone={u.status === "active" ? "go" : u.status === "invited" ? "acc" : "stop"}>{u.status}</Chip>
                  </td>
                  <td className="py-2">{u.onboardingCompletedAt ? "Done" : `${progressCount}/6 steps`}</td>
                  <td className="py-2">{avg}%</td>
                  <td className="py-2">{streak}</td>
                  <td className="py-2">{openDeals}</td>
                  <td className="py-2 text-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
