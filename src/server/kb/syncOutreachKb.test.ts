import { describe, expect, it } from "vitest";
import type { KbSeedEntry } from "@/server/kb/types";
import {
  chooseOutreachKbOrg,
  databaseUrlForKbLoad,
  formatOutreachKbLoadLine,
  planOutreachKbSync,
  SEEDED_ORG_ID,
  type ExistingKbRow,
} from "@/server/kb/syncOutreachKb";

function entry(overrides: Partial<KbSeedEntry> = {}): KbSeedEntry {
  return {
    key: "principle:offer",
    layer: "core",
    kind: "principle",
    icp: null,
    scope: "universal",
    status: "pending",
    title: "Offer",
    body: "Free for 1 week.",
    payload: { tasks: ["write_outreach"] },
    sourcePath: "outreach-kb/10-message-principles.md",
    sourceLink: null,
    version: 1,
    ...overrides,
  };
}

function row(overrides: Partial<ExistingKbRow> = {}): ExistingKbRow {
  const seed = entry();
  return {
    key: seed.key,
    status: "approved",
    updatedById: "user-1",
    layer: seed.layer,
    kind: seed.kind,
    icp: seed.icp,
    scope: seed.scope,
    title: seed.title,
    body: seed.body,
    payload: seed.payload,
    sourcePath: seed.sourcePath,
    sourceLink: seed.sourceLink,
    version: seed.version,
    ...overrides,
  };
}

describe("chooseOutreachKbOrg", () => {
  it("uses the NerdFlow org and does not require the seed id", () => {
    const choice = chooseOutreachKbOrg([{ id: "prod-org", name: "NerdFlow" }]);
    expect(choice).toEqual({ ok: true, org: { id: "prod-org", name: "NerdFlow" } });
  });

  it("uses the seed id only when that row exists", () => {
    const choice = chooseOutreachKbOrg([
      { id: "other", name: "Other" },
      { id: SEEDED_ORG_ID, name: "Demo" },
    ]);
    expect(choice.ok).toBe(true);
    if (choice.ok) expect(choice.org.id).toBe(SEEDED_ORG_ID);
  });

  it("uses the only organization when it is not named NerdFlow", () => {
    const choice = chooseOutreachKbOrg([{ id: "only", name: "Sales" }]);
    expect(choice).toEqual({ ok: true, org: { id: "only", name: "Sales" } });
  });

  it("refuses to guess among several unnamed orgs", () => {
    const choice = chooseOutreachKbOrg([
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ]);
    expect(choice.ok).toBe(false);
  });
});

describe("planOutreachKbSync", () => {
  it("creates missing rows and keeps an approved status when the markdown changes", () => {
    const plan = planOutreachKbSync(
      [row({ status: "approved", body: "Old body." })],
      [entry({ status: "pending", body: "Free for 1 week." })],
    );
    expect(plan.create).toEqual([]);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0]?.entry.body).toBe("Free for 1 week.");
    expect(plan.statusKept).toBe(1);
    expect(plan.unchanged).toBe(0);
  });

  it("does not write when the markdown matches, and still counts a kept status", () => {
    const plan = planOutreachKbSync([row({ status: "approved" })], [entry({ status: "pending" })]);
    expect(plan.update).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.statusKept).toBe(1);
  });

  it("leaves rows that are not in the markdown, including a later learning", () => {
    const learning = row({
      key: "learning:week-12",
      status: "approved",
      updatedById: null,
      kind: "learning",
      sourcePath: "outreach-kb/11-learnings.md",
      body: "Owners who heard the summary booked a call.",
    });
    const plan = planOutreachKbSync([learning, row()], [entry()]);
    expect(plan.left).toBe(1);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("formats the deploy log line with the loaded count", () => {
    const line = formatOutreachKbLoadLine(
      { id: "prod-org", name: "NerdFlow" },
      { loaded: 353, created: 353, updated: 0, unchanged: 0, statusKept: 0, left: 0 },
    );
    expect(line).toBe(
      "Outreach knowledge base loaded: 353 rows for NerdFlow (prod-org) (created 353, updated 0, unchanged 0, status kept 0, left in place 0)",
    );
  });
});

describe("databaseUrlForKbLoad", () => {
  it("forces a single connection without dropping the rest of the url", () => {
    expect(databaseUrlForKbLoad("postgresql://db.example/postgres?pgbouncer=true&connection_limit=5")).toBe(
      "postgresql://db.example/postgres?pgbouncer=true&connection_limit=1",
    );
    expect(databaseUrlForKbLoad("postgresql://db.example/postgres")).toBe("postgresql://db.example/postgres?connection_limit=1");
  });
});
