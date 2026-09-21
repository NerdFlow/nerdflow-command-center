import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { AdminTeamClient } from "@/components/AdminTeamClient";

export default async function AdminTeamPage() {
  const user = await requireRole(["admin"]);
  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { fullName: "asc" },
    include: { targetsOwned: { orderBy: { effectiveFrom: "desc" } } },
  });

  return (
    <AdminTeamClient
      users={users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        status: u.status,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        targets: u.targetsOwned.map((t) => ({
          id: t.id,
          metric: t.metric,
          dailyValue: t.dailyValue,
          effectiveFrom: t.effectiveFrom.toISOString(),
        })),
      }))}
    />
  );
}
