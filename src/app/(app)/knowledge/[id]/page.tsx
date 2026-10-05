import Link from "next/link";
import { notFound } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { KnowledgeEditor } from "@/components/KnowledgeEditor";
import { canEditOutreachKb, formatKbWhen, isLockedProductTruth, KB_LAYER_LABEL, type KbLayerName, type KbScopeName, type KbStatusName } from "@/lib/outreachKb";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function KnowledgeEntryPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!UUID.test(params.id)) notFound();
  const row = await prisma.outreachKbEntry.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: { updatedBy: { select: { fullName: true } } },
  });
  if (!row) notFound();
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {};

  return (
    <div className="space-y-4">
      <Link href="/knowledge" className="text-sm text-muted">
        Back to Knowledge
      </Link>
      <div>
        <p className="text-sm text-muted m-0 mb-1">{KB_LAYER_LABEL[row.layer]}</p>
        <h1 className="text-[28px] tracking-tight m-0">{row.title}</h1>
      </div>
      <KnowledgeEditor
        canEdit={canEditOutreachKb(user.role)}
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
          payload,
          locked: isLockedProductTruth(row.payload),
          sourcePath: row.sourcePath,
          updatedLabel: formatKbWhen(row.updatedAt),
          updatedByName: row.updatedBy?.fullName ?? null,
        }}
      />
    </div>
  );
}
