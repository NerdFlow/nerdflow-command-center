import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { findMany: vi.fn() },
}));

vi.mock("@/server/db", () => ({
  prisma: {
    outreachKbEntry: { findMany: (...args: unknown[]) => state.findMany(...args) },
  },
}));

import { clearApprovedKbCache, loadApprovedKbEntries } from "@/server/kb/load";

const row = {
  key: "product_truth:one_liner",
  layer: "core",
  kind: "product_truth",
  icp: null,
  scope: "universal",
  status: "approved",
  title: "One-liner",
  body: "ReceptAI is your after-hours ops layer.",
  payload: { locked: true },
  sourcePath: "outreach-kb/08-product-truth.md",
  version: 1,
};

describe("approved KB cache", () => {
  beforeEach(() => {
    clearApprovedKbCache();
    state.findMany.mockReset().mockResolvedValue([row]);
  });

  it("loads the approved pack once per organization inside the cache window", async () => {
    const first = await loadApprovedKbEntries("org-1");
    const second = await loadApprovedKbEntries("org-1");
    const other = await loadApprovedKbEntries("org-2");
    expect(second).toBe(first);
    expect(other[0]?.key).toBe(row.key);
    expect(state.findMany).toHaveBeenCalledTimes(2);
  });
});
