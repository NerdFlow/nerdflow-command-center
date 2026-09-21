"use client";

type Row = { createdAt: string; actor: string; action: string; entityType: string; entityId: string };

function toCsv(rows: Row[]) {
  const header = "when,actor,action,entity_type,entity_id";
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.createdAt, r.actor, r.action, r.entityType, r.entityId].map(escape).join(","));
  return [header, ...lines].join("\n");
}

export function AuditLogExport({ rows }: { rows: Row[] }) {
  function download() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={download} disabled={rows.length === 0} className="text-sm text-accent font-medium disabled:opacity-50">
      Export CSV
    </button>
  );
}
