import Link from "next/link";
import { notFound } from "next/navigation";
import { KnowledgeEditor } from "@/components/KnowledgeEditor";
import { KnowledgeReader } from "@/components/KnowledgeReader";
import { canEditOutreachKb, formatKbWhen, isLockedProductTruth, kbKindLabel, kbReaderView, type KbLayerName, type KbScopeName, type KbStatusName } from "@/lib/outreachKb";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KnowledgeEntryPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!UUID.test(params.id)) notFound();
  const row = await prisma.outreachKbEntry.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: { updatedBy: { select: { fullName: true } } },
  });
  if (!row) notFound();
  const canEdit = canEditOutreachKb(user.role);
  const locked = isLockedProductTruth(row.payload);

  return (
    <div className="space-y-4">
      <Link href="/knowledge" className="text-sm text-muted">
        Back to Knowledge
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg tracking-tight m-0">{kbKindLabel(row.kind)}</h1>
        {locked && <span className="text-xs rounded-full px-2 py-0.5 bg-warm-soft text-warm">Locked</span>}
      </div>
      {canEdit ? (
        <KnowledgeEditor
          canEdit
          row={{
            id: row.id,
            key: row.key,
            layer: row.layer as KbLayerName,
            kind: row.kind,
            icp: row.icp,
            scope: row.scope as KbScopeName,
            status: row.status as KbStatusName,
            title: row.title,
            body: row.body,
            payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {},
            locked,
            sourcePath: row.sourcePath,
            updatedLabel: formatKbWhen(row.updatedAt),
            updatedByName: row.updatedBy?.fullName ?? null,
            version: row.version,
          }}
        />
      ) : (
        <KnowledgeReader
          view={kbReaderView({
            title: row.title,
            body: row.body,
            status: row.status as KbStatusName,
            kind: row.kind,
            updatedAt: row.updatedAt,
            updatedByName: row.updatedBy?.fullName ?? null,
            payload: row.payload,
          })}
        />
      )}
    </div>
  );
}
