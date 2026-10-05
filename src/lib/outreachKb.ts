export const KB_LAYERS = ["sales_craft", "core", "icp"] as const;
export const KB_SCOPES = ["universal", "icp"] as const;
export const KB_STATUSES = ["draft", "pending", "approved", "retired"] as const;

export type KbLayerName = (typeof KB_LAYERS)[number];
export type KbScopeName = (typeof KB_SCOPES)[number];
export type KbStatusName = (typeof KB_STATUSES)[number];

export const KB_STATUS_LABEL: Record<KbStatusName, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  retired: "Archived",
};

export const KB_LAYER_LABEL: Record<KbLayerName, string> = {
  sales_craft: "Sales craft",
  core: "Core",
  icp: "ICP",
};

const PAGE_SIZE = 40;

export type KbListFilters = {
  layer: KbLayerName | "";
  kind: string;
  icp: string;
  status: KbStatusName | "";
  q: string;
  page: number;
};

export function parseKbListFilters(search: {
  layer?: string;
  kind?: string;
  icp?: string;
  status?: string;
  q?: string;
  page?: string;
}): KbListFilters {
  const layer = KB_LAYERS.includes(search.layer as KbLayerName) ? (search.layer as KbLayerName) : "";
  const status = KB_STATUSES.includes(search.status as KbStatusName) ? (search.status as KbStatusName) : "";
  const page = Math.max(1, Number.parseInt(search.page ?? "1", 10) || 1);
  return {
    layer,
    kind: (search.kind ?? "").trim().slice(0, 80),
    icp: (search.icp ?? "").trim().slice(0, 80),
    status,
    q: (search.q ?? "").trim().slice(0, 200),
    page,
  };
}

export function kbPageSize() {
  return PAGE_SIZE;
}

export function isLockedProductTruth(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && (payload as { locked?: unknown }).locked === true);
}

export function canEditOutreachKb(role: string): boolean {
  return role === "lead";
}

export function kbEditDeniedMessage(): string {
  return "Only a manager can edit the knowledge base.";
}

export function lockedEditDeniedMessage(): string {
  return "This is locked Product Truth. Confirm the edit before saving. Cold copy depends on it.";
}

export function kbFilterHref(filters: KbListFilters, patch: Partial<KbListFilters> = {}): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.layer) params.set("layer", next.layer);
  if (next.kind) params.set("kind", next.kind);
  if (next.icp) params.set("icp", next.icp);
  if (next.status) params.set("status", next.status);
  if (next.q) params.set("q", next.q);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/knowledge?${query}` : "/knowledge";
}

export function formatKbWhen(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
