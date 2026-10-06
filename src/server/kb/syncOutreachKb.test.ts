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
  return { key: "principle:offer", ...overrides };
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
  it("inserts only keys that are not already stored", () => {
    const plan = planOutreachKbSync(
      [row({ key: "principle:offer" })],
      [entry({ status: "pending", body: "Markdown copy." }), entry({ key: "learning:new", title: "New", body: "Fresh." })],
    );
    expect(plan.skipped).toBe(1);
    expect(plan.create.map((item) => item.key)).toEqual(["learning:new"]);
    expect(plan.create[0]?.body).toBe("Fresh.");
  });

  it("does not plan an update or a delete when markdown and the database disagree", () => {
    const plan = planOutreachKbSync(
      [row(), { key: "learning:week-12" }],
      [entry({ body: "File copy", status: "approved" })],
    );
    expect(plan.create).toEqual([]);
    expect(plan.skipped).toBe(1);
    expect("update" in plan).toBe(false);
  });

  it("formats the deploy log line with created and skipped counts", () => {
    const line = formatOutreachKbLoadLine({ id: "prod-org", name: "NerdFlow" }, { created: 0, skipped: 353 });
    expect(line).toBe("Outreach knowledge base loaded: created 0, skipped existing 353 for NerdFlow (prod-org)");
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
