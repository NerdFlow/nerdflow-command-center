import { beforeEach, describe, expect, it, vi } from "vitest";

const actor = { id: "user-1", role: "rep" as "rep" | "lead", organizationId: "org-1" };

const rowId = "11111111-1111-4111-8111-111111111111";

type Stored = {
  id: string;
  organizationId: string;
  key: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  status: string;
  layer: string;
  kind: string;
  scope: string;
  icp: string | null;
  version: number;
  updatedById: string | null;
  sourcePath: string;
};

const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Stored[],
    audits: [] as { action: string }[],
    deletes: 0,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireUser: async () => actor }));
vi.mock("@/server/db", () => ({
  prisma: {
    outreachKbEntry: {
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        state.rows.find((row) => row.id === where.id && row.organizationId === where.organizationId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Stored> }) => {
        const row = state.rows.find((item) => item.id === where.id);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: { data: Omit<Stored, "id"> & { id?: string } }) => {
        const row = { id: "22222222-2222-4222-8222-222222222222", ...data } as Stored;
        state.rows.push(row);
        return row;
      },
      delete: async () => {
        state.deletes += 1;
      },
      deleteMany: async () => {
        state.deletes += 1;
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string } }) => {
        state.audits.push(data);
        return data;
      },
    },
  },
}));

import { archiveOutreachKbEntry, createOutreachKbEntry, updateOutreachKbEntry } from "@/server/actions/outreachKb";

function sample(overrides: Partial<Stored> = {}): Stored {
  return {
    id: rowId,
    organizationId: "org-1",
    key: "principle:offer",
    title: "Offer",
    body: "Free for 1 week.",
    payload: { tasks: ["write_outreach"] },
    status: "pending",
    layer: "core",
    kind: "principle",
    scope: "universal",
    icp: null,
    version: 1,
    updatedById: null,
    sourcePath: "outreach-kb/10-message-principles.md",
    ...overrides,
  };
}

const edit = {
  id: rowId,
  title: "Offer rewritten",
  body: "Free for 1 week on the after-hours line.",
  payload: { tasks: ["write_outreach"] },
  status: "approved" as const,
  layer: "core" as const,
  kind: "principle",
  scope: "universal" as const,
  icp: null,
};

beforeEach(() => {
  actor.role = "rep";
  state.rows = [sample()];
  state.audits = [];
  state.deletes = 0;
});

describe("outreach KB edit permissions", () => {
  it("lets a rep read by refusing every write", async () => {
    await expect(updateOutreachKbEntry(edit)).rejects.toThrow("Only a manager can edit the knowledge base.");
    await expect(
      createOutreachKbEntry({ ...edit, key: "learning:new" }),
    ).rejects.toThrow("Only a manager can edit the knowledge base.");
    await expect(archiveOutreachKbEntry({ id: rowId })).rejects.toThrow("Only a manager can edit the knowledge base.");
    expect(state.rows[0]?.title).toBe("Offer");
    expect(state.rows[0]?.status).toBe("pending");
    expect(state.deletes).toBe(0);
    expect(state.audits).toEqual([]);
  });

  it("lets a manager save, and requires a confirm on locked Product Truth", async () => {
    actor.role = "lead";
    await updateOutreachKbEntry(edit);
    expect(state.rows[0]?.title).toBe("Offer rewritten");
    expect(state.rows[0]?.status).toBe("approved");
    expect(state.rows[0]?.updatedById).toBe("user-1");
    expect(state.audits.map((item) => item.action)).toEqual(["kb_updated"]);

    state.rows[0] = sample({ payload: { locked: true, claim: "yes" }, title: "One-liner", body: "Original truth." });
    await expect(updateOutreachKbEntry({ ...edit, title: "Changed truth", confirmLocked: false })).rejects.toThrow(
      "locked Product Truth",
    );
    expect(state.rows[0]?.body).toBe("Original truth.");

    await updateOutreachKbEntry({ ...edit, title: "Changed truth", body: "Still the offer.", confirmLocked: true });
    expect(state.rows[0]?.title).toBe("Changed truth");
  });

  it("archives by setting retired and never deletes the row", async () => {
    actor.role = "lead";
    await archiveOutreachKbEntry({ id: rowId });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]?.status).toBe("retired");
    expect(state.rows[0]?.updatedById).toBe("user-1");
    expect(state.deletes).toBe(0);
    expect(state.audits.map((item) => item.action)).toEqual(["kb_archived"]);
  });

  it("lets a manager add a row", async () => {
    actor.role = "lead";
    const created = await createOutreachKbEntry({ ...edit, key: "learning:week-1", status: "draft" });
    expect(created.id).toBeTruthy();
    expect(state.rows.some((row) => row.key === "learning:week-1" && row.status === "draft" && row.updatedById === "user-1")).toBe(true);
    expect(state.deletes).toBe(0);
  });
});
