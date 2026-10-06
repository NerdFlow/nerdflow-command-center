import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedOutreachKb } from "../../../prisma/seedOutreachKb";

function fakeClient(keys: string[]) {
  const created: { key: string; body: string; title: string; status: string }[] = [];
  let updates = 0;
  let deletes = 0;
  let skipDuplicates = false;
  const prisma = {
    outreachKbEntry: {
      findMany: async () => keys.map((key) => ({ key })),
      createMany: async ({ data, skipDuplicates: skip }: { data: { key: string; body: string; title: string; status: string }[]; skipDuplicates?: boolean }) => {
        skipDuplicates = skip === true;
        created.push(...data);
        return { count: data.length };
      },
      update: async () => {
        updates += 1;
        throw new Error("insert-only loader must not update");
      },
      delete: async () => {
        deletes += 1;
        throw new Error("insert-only loader must not delete");
      },
      deleteMany: async () => {
        deletes += 1;
        throw new Error("insert-only loader must not delete");
      },
    },
    $transaction: async () => {
      throw new Error("insert-only loader must not open a transaction");
    },
  };
  return { prisma: prisma as unknown as PrismaClient, created, counts: () => ({ updates, deletes }), skippedDuplicates: () => skipDuplicates };
}

describe("seedOutreachKb", () => {
  it("inserts missing keys and leaves an edited row untouched", async () => {
    const db = fakeClient(["product_truth:one_liner"]);
    const result = await seedOutreachKb(db.prisma, "org-1");
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(db.created.length);
    expect(result.created).toBeGreaterThan(300);
    expect(db.created.some((row) => row.key === "product_truth:one_liner")).toBe(false);
    expect(db.skippedDuplicates()).toBe(true);
    expect(db.counts()).toEqual({ updates: 0, deletes: 0 });
  });

  it("skips every key when the database already has the import", async () => {
    const first = fakeClient([]);
    const seeded = await seedOutreachKb(first.prisma, "org-1");
    const second = fakeClient(first.created.map((row) => row.key));
    const again = await seedOutreachKb(second.prisma, "org-1");
    expect(again).toEqual({ created: 0, skipped: seeded.created });
    expect(second.created).toEqual([]);
    expect(second.counts()).toEqual({ updates: 0, deletes: 0 });
  });
});
