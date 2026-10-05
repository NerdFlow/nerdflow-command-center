import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  KB_LAYER_LABEL,
  KB_LAYERS,
  KB_STATUS_LABEL,
  KB_STATUSES,
  canEditOutreachKb,
  formatKbWhen,
  isLockedProductTruth,
  kbFilterHref,
  kbPageSize,
  parseKbListFilters,
  type KbStatusName,
} from "@/lib/outreachKb";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: { layer?: string; kind?: string; icp?: string; status?: string; q?: string; page?: string };
}) {
  const user = await requireUser();
  const canEdit = canEditOutreachKb(user.role);
  const filters = parseKbListFilters(searchParams);
  const where: Prisma.OutreachKbEntryWhereInput = {
    organizationId: user.organizationId,
    ...(filters.layer ? { layer: filters.layer } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.icp === "universal" ? { scope: "universal" } : filters.icp ? { icp: filters.icp } : {}),
    ...(filters.q
      ? {
          OR: [
            { title: { contains: filters.q, mode: "insensitive" } },
            { body: { contains: filters.q, mode: "insensitive" } },
            { key: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const take = kbPageSize();
  const [total, rows, grouped] = await Promise.all([
    prisma.outreachKbEntry.count({ where }),
    prisma.outreachKbEntry.findMany({
      where,
      orderBy: [{ layer: "asc" }, { kind: "asc" }, { title: "asc" }],
      skip: (filters.page - 1) * take,
      take,
      include: { updatedBy: { select: { fullName: true } } },
    }),
    prisma.outreachKbEntry.groupBy({
      by: ["kind", "icp"],
      where: { organizationId: user.organizationId },
    }),
  ]);
  const kinds = [...new Set(grouped.map((item) => item.kind))].sort();
  const icps = [...new Set(grouped.map((item) => item.icp).filter((item): item is string => Boolean(item)))].sort();
  const pages = Math.max(1, Math.ceil(total / take));
  const page = Math.min(filters.page, pages);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] tracking-tight mb-1.5">Knowledge</h1>
          <p className="text-muted m-0">
            {total} {total === 1 ? "row" : "rows"}. Generate only reads <span className="text-go font-medium">Approved</span>.{" "}
            <Link href="/knowledge?kind=product_truth" className="text-warm">
              Locked product truth
            </Link>
          </p>
        </div>
        {canEdit ? (
          <Link href="/knowledge/new" className="bg-accent border border-accent text-on-accent font-semibold px-3.5 py-2 rounded-xl text-sm">
            Add row
          </Link>
        ) : (
          <p className="text-sm text-muted m-0">You can read this. Managers edit it.</p>
        )}
      </div>

      <form method="get" className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
        <label className="text-sm">
          Layer
          <select name="layer" defaultValue={filters.layer} className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1">
            <option value="">All</option>
            {KB_LAYERS.map((layer) => (
              <option key={layer} value={layer}>
                {KB_LAYER_LABEL[layer]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Kind
          <select name="kind" defaultValue={filters.kind} className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1">
            <option value="">All</option>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          ICP
          <select name="icp" defaultValue={filters.icp} className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1">
            <option value="">All</option>
            <option value="universal">Universal</option>
            {icps.map((icp) => (
              <option key={icp} value={icp}>
                {icp}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Status
          <select name="status" defaultValue={filters.status} className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1">
            <option value="">All</option>
            {KB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {KB_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm lg:col-span-2">
          Search
          <input name="q" defaultValue={filters.q} placeholder="Title, body, or key" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" />
        </label>
        <div className="flex gap-3 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="bg-accent border border-accent text-on-accent font-semibold px-3.5 py-2 rounded-xl text-sm">
            Filter
          </button>
          <Link href="/knowledge" className="text-sm text-muted self-center">
            Clear
          </Link>
        </div>
      </form>

      <div className="border border-rule rounded-card overflow-hidden bg-panel">
        {rows.length === 0 ? (
          <p className="text-sm text-muted px-4 py-6 m-0">No rows match these filters.</p>
        ) : (
          <ul className="divide-y divide-rule m-0 p-0 list-none">
            {rows.map((row) => {
              const locked = isLockedProductTruth(row.payload);
              return (
                <li key={row.id}>
                  <Link href={`/knowledge/${row.id}`} className="block px-4 py-3 hover:bg-panel2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.title}</span>
                      <StatusChip status={row.status} />
                      {locked && <span className="text-xs rounded-full px-2 py-0.5 bg-warm-soft text-warm">Locked</span>}
                    </div>
                    <p className="text-sm text-muted m-0 mt-1">
                      {KB_LAYER_LABEL[row.layer]} · {row.kind}
                      {row.icp ? ` · ${row.icp}` : " · universal"}
                      {" · "}
                      {row.updatedBy?.fullName ? `Edited by ${row.updatedBy.fullName}` : "Not edited since import"}
                      {` · ${formatKbWhen(row.updatedAt)}`}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={kbFilterHref(filters, { page: page - 1 })}>Previous</Link>}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={kbFilterHref(filters, { page: page + 1 })} className="text-accent">Next</Link>}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: KbStatusName }) {
  const tone = status === "approved" ? "bg-go-soft text-go" : status === "retired" ? "bg-stop-soft text-stop" : status === "pending" ? "bg-warm-soft text-warm" : "bg-panel2 text-muted";
  return <span className={`text-xs rounded-full px-2 py-0.5 ${tone}`}>{KB_STATUS_LABEL[status]}</span>;
}
