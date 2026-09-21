import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel } from "@/components/ui";
import { AuditLogExport } from "@/components/AuditLogExport";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { actor?: string; action?: string; entityType?: string };
}) {
  const user = await requireRole(["admin"]);

  const actors = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });

  const logs = await prisma.auditLog.findMany({
    where: {
      organizationId: user.organizationId,
      ...(searchParams.actor ? { actorId: searchParams.actor } : {}),
      ...(searchParams.action ? { action: { contains: searchParams.action } } : {}),
      ...(searchParams.entityType ? { entityType: searchParams.entityType } : {}),
    },
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <form className="flex flex-wrap gap-2 mb-4 text-sm" method="get">
        <select name="actor" defaultValue={searchParams.actor ?? ""} className="border border-rule rounded-lg px-2 py-1.5 bg-panel">
          <option value="">All actors</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName}
            </option>
          ))}
        </select>
        <input
          name="action"
          defaultValue={searchParams.action ?? ""}
          placeholder="Action contains…"
          className="border border-rule rounded-lg px-2 py-1.5 bg-panel"
        />
        <input
          name="entityType"
          defaultValue={searchParams.entityType ?? ""}
          placeholder="Entity type"
          className="border border-rule rounded-lg px-2 py-1.5 bg-panel"
        />
        <button type="submit" className="text-accent font-medium">
          Filter
        </button>
      </form>

      <div className="flex justify-end mb-3">
        <AuditLogExport
          rows={logs.map((l) => ({
            createdAt: l.createdAt.toISOString(),
            actor: l.actor?.fullName ?? "system",
            action: l.action,
            entityType: l.entityType,
            entityId: l.entityId ?? "",
          }))}
        />
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium py-1.5">When</th>
                <th className="text-left font-medium py-1.5">Actor</th>
                <th className="text-left font-medium py-1.5">Action</th>
                <th className="text-left font-medium py-1.5">Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-rule">
                  <td className="py-1.5 text-muted">{l.createdAt.toLocaleString()}</td>
                  <td className="py-1.5">{l.actor?.fullName ?? "system"}</td>
                  <td className="py-1.5">{l.action}</td>
                  <td className="py-1.5">
                    {l.entityType}
                    {l.entityId ? ` · ${l.entityId.slice(0, 8)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <p className="text-muted py-4">No matching entries.</p>}
        </div>
      </Panel>
    </div>
  );
}
