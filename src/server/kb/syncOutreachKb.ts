import type { KbSeedEntry } from "@/server/kb/types";

/** Local demo seed id. Used only when that row already exists. Never created here. */
export const SEEDED_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const NERDFLOW_ORG_NAME = "NerdFlow";

export type OrgChoice = { id: string; name: string };

export type ExistingKbRow = { key: string };

export type OutreachKbLoadResult = {
  created: number;
  skipped: number;
};

export type KbSyncPlan = {
  create: KbSeedEntry[];
  skipped: number;
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
 * Insert-only. The database is the source of truth after the first import.
 * An existing key is skipped entirely: title, body, payload, and status stay as saved.
 * Keys that are only in the database are not deleted.
 */
export function planOutreachKbSync(existing: ExistingKbRow[], incoming: KbSeedEntry[]): KbSyncPlan {
  const keys = new Set(existing.map((row) => row.key));
  const incomingByKey = new Map<string, KbSeedEntry>();
  for (const entry of incoming) incomingByKey.set(entry.key, entry);
  const create: KbSeedEntry[] = [];
  let skipped = 0;
  for (const entry of incomingByKey.values()) {
    if (keys.has(entry.key)) skipped += 1;
    else create.push(entry);
  }
  return { create, skipped };
}

export function outreachKbLoadResult(plan: KbSyncPlan): OutreachKbLoadResult {
  return { created: plan.create.length, skipped: plan.skipped };
}

export function formatOutreachKbLoadLine(org: OrgChoice, result: OutreachKbLoadResult): string {
  return `Outreach knowledge base loaded: created ${result.created}, skipped existing ${result.skipped} for ${org.name} (${org.id})`;
}

/** One connection, so this short script does not take the app's pool during deploy. */
export function databaseUrlForKbLoad(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("DATABASE_URL is empty.");
  if (/[?&]connection_limit=\d+/.test(trimmed)) return trimmed.replace(/connection_limit=\d+/, "connection_limit=1");
  return `${trimmed}${trimmed.includes("?") ? "&" : "?"}connection_limit=1`;
}

