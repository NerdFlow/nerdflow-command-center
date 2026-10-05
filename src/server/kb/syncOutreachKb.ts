import type { KbSeedEntry } from "@/server/kb/types";

/** Local demo seed id. Used only when that row already exists. Never created here. */
export const SEEDED_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const NERDFLOW_ORG_NAME = "NerdFlow";

export type OrgChoice = { id: string; name: string };

export type ExistingKbRow = {
  key: string;
  status: string;
  updatedById: string | null;
  layer: string;
  kind: string;
  icp: string | null;
  scope: string;
  title: string;
  body: string;
  payload: unknown;
  sourcePath: string;
  sourceLink: string | null;
  version: number;
};

export type OutreachKbLoadResult = {
  loaded: number;
  created: number;
  updated: number;
  unchanged: number;
  statusKept: number;
  left: number;
};

export type KbSyncPlan = {
  create: KbSeedEntry[];
  update: { key: string; entry: KbSeedEntry }[];
  unchanged: number;
  statusKept: number;
  left: number;
};

/**
 * Pick the production org without creating one.
 * Prefer the single organization named NerdFlow. The demo seed id is only a tie-break
 * when that row is already present.
 */
export function chooseOutreachKbOrg(orgs: OrgChoice[]): { ok: true; org: OrgChoice } | { ok: false; reason: string } {
  if (orgs.length === 0) {
    return { ok: false, reason: "No organizations exist. Refusing to create one." };
  }
  const named = orgs.filter((org) => org.name === NERDFLOW_ORG_NAME);
  if (named.length === 1) return { ok: true, org: named[0]! };
  if (named.length > 1) {
    const seeded = named.find((org) => org.id === SEEDED_ORG_ID);
    if (seeded) return { ok: true, org: seeded };
    return {
      ok: false,
      reason: `${named.length} organizations are named ${NERDFLOW_ORG_NAME} and none has the seeded id. Ids: ${named.map((org) => org.id).join(", ")}`,
    };
  }
  const seeded = orgs.find((org) => org.id === SEEDED_ORG_ID);
  if (seeded) return { ok: true, org: seeded };
  if (orgs.length === 1) return { ok: true, org: orgs[0]! };
  return {
    ok: false,
    reason: `No organization named ${NERDFLOW_ORG_NAME}, and the seeded id is not present. Found: ${orgs.map((org) => `${org.name} (${org.id})`).join("; ")}`,
  };
}

/**
 * Upsert plan. Existing status is kept so an in-app approval survives the next deploy.
 * Rows that are not in the markdown (manual edits, future learnings) are left in place.
 * Markdown title, body, and the other content fields still replace the stored copy.
 */
export function planOutreachKbSync(existing: ExistingKbRow[], incoming: KbSeedEntry[]): KbSyncPlan {
  const incomingByKey = new Map<string, KbSeedEntry>();
  for (const entry of incoming) incomingByKey.set(entry.key, entry);
  const byKey = new Map(existing.map((row) => [row.key, row]));
  const create: KbSeedEntry[] = [];
  const update: { key: string; entry: KbSeedEntry }[] = [];
  let unchanged = 0;
  let statusKept = 0;
  for (const entry of incomingByKey.values()) {
    const row = byKey.get(entry.key);
    if (!row) {
      create.push(entry);
      continue;
    }
    if (row.status !== entry.status) statusKept += 1;
    if (sameContent(row, entry)) {
      unchanged += 1;
      continue;
    }
    update.push({ key: entry.key, entry });
  }
  const left = existing.filter((row) => !incomingByKey.has(row.key)).length;
  return { create, update, unchanged, statusKept, left };
}

export function outreachKbLoadResult(plan: KbSyncPlan): OutreachKbLoadResult {
  return {
    loaded: plan.create.length + plan.update.length + plan.unchanged,
    created: plan.create.length,
    updated: plan.update.length,
    unchanged: plan.unchanged,
    statusKept: plan.statusKept,
    left: plan.left,
  };
}

export function formatOutreachKbLoadLine(org: OrgChoice, result: OutreachKbLoadResult): string {
  return `Outreach knowledge base loaded: ${result.loaded} rows for ${org.name} (${org.id}) (created ${result.created}, updated ${result.updated}, unchanged ${result.unchanged}, status kept ${result.statusKept}, left in place ${result.left})`;
}

/** One connection, so this short script does not take the app's pool during deploy. */
export function databaseUrlForKbLoad(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("DATABASE_URL is empty.");
  if (/[?&]connection_limit=\d+/.test(trimmed)) return trimmed.replace(/connection_limit=\d+/, "connection_limit=1");
  return `${trimmed}${trimmed.includes("?") ? "&" : "?"}connection_limit=1`;
}

function sameContent(existing: ExistingKbRow, entry: KbSeedEntry): boolean {
  return (
    existing.layer === entry.layer &&
    existing.kind === entry.kind &&
    (existing.icp ?? null) === (entry.icp ?? null) &&
    existing.scope === entry.scope &&
    existing.title === entry.title &&
    existing.body === entry.body &&
    existing.sourcePath === entry.sourcePath &&
    (existing.sourceLink ?? null) === (entry.sourceLink ?? null) &&
    existing.version === entry.version &&
    stable(existing.payload) === stable(entry.payload)
  );
}

function stable(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(record[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}
