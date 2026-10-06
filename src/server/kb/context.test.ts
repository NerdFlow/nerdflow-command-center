import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCKED_OFFER_LINE, LOCKED_ONE_LINER } from "@/server/kb/lockedTruth";
import { parseOutreachKbFiles } from "@/server/kb/parseOutreachKb";
import type { KbContextRow } from "@/server/kb/types";
import { WRITE_OUTREACH_MAX_CHARS, getKbContext, renderKbContext, renderWriteOutreachContext } from "@/server/kb/context";

function row(input: { key: string; kind: string; title: string; body: string }): KbContextRow {
  return {
    key: input.key,
    layer: "core",
    kind: input.kind,
    icp: null,
    scope: "universal",
    status: "approved",
    title: input.title,
    body: input.body,
    payload: {},
    sourcePath: "test",
    version: 1,
  };
}

describe("write_outreach knowledge context", () => {
  it("always includes product truth and keeps the rest under the cap", () => {
    const truth = `${LOCKED_ONE_LINER} ${LOCKED_OFFER_LINE} Price stays $497/mo.`;
    const huge = "Do not paste this sales-craft chapter. ".repeat(40);
    const rows = [
      ...Array.from({ length: 16 }, (_, index) =>
        row({
          key: `principle:sales:${index}`,
          kind: "principle",
          title: `Sales craft ${index}`,
          body: `Chapter ${index}. ${huge}`,
        }),
      ),
      row({ key: "product_truth:one_liner", kind: "product_truth", title: "One-liner", body: truth }),
      row({ key: "message_version:E1-A", kind: "message_version", title: "E1-A", body: "Hi [first name], short email." }),
      row({ key: "banned_phrase:streamline", kind: "banned_phrase", title: "streamline", body: "streamline" }),
    ];

    const before = renderKbContext(rows);
    const after = renderWriteOutreachContext(rows);

    expect(before.length).toBeGreaterThan(10_000);
    expect(before).not.toContain(truth);
    expect(after).toContain(truth);
    expect(after).toContain("Hi [first name], short email.");
    expect(after).toContain("streamline");
    expect(after).not.toContain(huge);
    expect(after.length).toBeLessThanOrEqual(WRITE_OUTREACH_MAX_CHARS);
    expect(after.length).toBeLessThan(before.length);
  });

  it("keeps locked product truth in full when that section alone exceeds the cap", () => {
    const truth = "LOCKED TRUTH ".repeat(800);
    const text = renderWriteOutreachContext(
      [
        row({ key: "principle:long", kind: "principle", title: "Long", body: "Y".repeat(4000) }),
        row({ key: "product_truth:price", kind: "product_truth", title: "Price", body: truth }),
      ],
      500,
    );
    expect(text).toContain(truth.trim());
    expect(text).not.toContain("Y".repeat(200));
  });

  it("trims the seeded contractor email pack", () => {
    const files = readdirSync(path.join(process.cwd(), "outreach-kb"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => ({ path: `outreach-kb/${name}`, markdown: readFileSync(path.join(process.cwd(), "outreach-kb", name), "utf8") }));
    const entries = parseOutreachKbFiles(files);
    const slice = getKbContext({ entries, task: "write_outreach", icp: "contractors", channel: "email" });
    const before = renderKbContext(slice);
    const after = renderWriteOutreachContext(slice);
    const truth = slice.filter((entry) => entry.kind === "product_truth");

    expect(truth.length).toBeGreaterThan(5);
    for (const entry of truth) expect(after).toContain(entry.body.trim());
    expect(after).toContain(LOCKED_ONE_LINER);
    expect(after).toContain(LOCKED_OFFER_LINE);
    expect(after.length).toBeLessThanOrEqual(WRITE_OUTREACH_MAX_CHARS);
    expect(after.length).toBeLessThan(before.length);

    const longPrinciple = slice.find((entry) => (entry.kind === "principle" || entry.kind === "learning") && entry.body.length > 800);
    if (longPrinciple && after.includes(longPrinciple.title)) {
      expect(after).not.toContain(longPrinciple.body.trim());
    }
  });
});
