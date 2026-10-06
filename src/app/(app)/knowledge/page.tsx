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
  kbKindLabel,
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
            {total} {total === 1 ? "row" : "rows"}. Outreach only uses rows marked <span className="text-go font-medium">Approved</span>.{" "}
            <Link href="/knowledge?kind=product_truth" className="text-warm">
              Product truth
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

      <form method="get" className="space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
          <label className="text-sm sm:col-span-2 lg:col-span-1">
            Search
            <input name="q" defaultValue={filters.q} placeholder="Search titles and text" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" />
          </label>
          <label className="text-sm">
            Type
            <select name="kind" defaultValue={filters.kind} className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1">
              <option value="">All</option>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kbKindLabel(kind)}
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
          <button type="submit" className="bg-accent border border-accent text-on-accent font-semibold px-3.5 py-2 rounded-xl text-sm">
            Filter
          </button>
        </div>
        <details open={Boolean(filters.layer || filters.icp)} className="text-sm">
          <summary className="cursor-pointer text-muted w-fit">More filters</summary>
          <div className="grid sm:grid-cols-2 gap-2 mt-2 max-w-xl">
            <label>
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
            <label>
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
          </div>
        </details>
        {(filters.q || filters.kind || filters.status || filters.layer || filters.icp) && (
          <Link href="/knowledge" className="text-sm text-muted inline-block">
            Clear
          </Link>
        )}
      </form>

      <div className="border border-rule rounded-card overflow-hidden bg-panel">
        {rows.length === 0 ? (
          <p className="text-sm text-muted px-4 py-6 m-0">No rows match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-muted">
                  <th className="text-left font-medium px-4 py-2">Title</th>
                  <th className="text-left font-medium px-4 py-2">Type</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                  <th className="text-left font-medium px-4 py-2">Last edited</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const locked = isLockedProductTruth(row.payload);
                  return (
                    <tr key={row.id} className="border-t border-rule hover:bg-panel2">
                      <td className="px-4 py-3 align-top">
                        <Link href={`/knowledge/${row.id}`} className="font-medium">
                          {row.title}
                        </Link>
                        {locked && <span className="ml-2 text-xs rounded-full px-2 py-0.5 bg-warm-soft text-warm">Locked</span>}
                      </td>
                      <td className="px-4 py-3 align-top text-muted">{kbKindLabel(row.kind)}</td>
                      <td className="px-4 py-3 align-top">
                        <StatusChip status={row.status} />
                      </td>
                      <td className="px-4 py-3 align-top text-muted whitespace-nowrap">
                        {formatKbWhen(row.updatedAt)}
                        {row.updatedBy?.fullName ? <span className="block text-xs">by {row.updatedBy.fullName}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
