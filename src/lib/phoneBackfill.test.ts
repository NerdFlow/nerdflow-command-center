import { describe, expect, it } from "vitest";
import { planImportMerge, type StoredLeadContact } from "@/lib/phoneBackfill";
import { computeDedupeKey } from "@/server/leads";

function stored(overrides?: Partial<StoredLeadContact>): StoredLeadContact {
  const businessName = overrides?.businessName ?? "Shine Shop";
  const city = overrides?.city === undefined ? "Austin" : overrides.city;
  return {
    id: "lead-1",
    businessName,
    city,
    website: null,
    phone: null,
    dedupeKey: computeDedupeKey({ business_name: businessName, city: city ?? undefined }),
    ...overrides,
  };
}

describe("phone backfill on re-import", () => {
  it("writes the phone onto the existing name-keyed lead instead of inserting a second one", () => {
    const [item] = planImportMerge(
      [stored()],
      [{ business_name: "Shine Shop", city: "Austin", phone: "(203) 668-8164" }],
    );
    expect(computeDedupeKey({ business_name: "Shine Shop", city: "Austin", phone: "(203) 668-8164" })).toBe(
      "phone:2036688164",
    );
    expect(item?.action).toBe("backfill_phone");
    if (item?.action !== "backfill_phone") return;
    expect(item.leadId).toBe("lead-1");
    expect(item.phone).toBe("(203) 668-8164");
  });

  it("matches a unique business name when the stored dedupe key is not the current one", () => {
    const [item] = planImportMerge(
      [stored({ dedupeKey: "legacy:not-the-current-key" })],
      [{ business_name: "Shine Shop", city: "Austin", phone: "(203) 668-8164" }],
    );
    expect(item?.action).toBe("backfill_phone");
  });

  it("skips a lead that already has a dialable phone", () => {
    const [item] = planImportMerge(
      [stored({ phone: "512-555-0100" })],
      [{ business_name: "Shine Shop", city: "Austin", phone: "(203) 668-8164" }],
    );
    expect(item?.action).toBe("skip");
  });

  it("inserts different businesses and does not backfill the same lead twice", () => {
    const fresh = planImportMerge(
      [],
      [
        { business_name: "Shine Shop", city: "Austin", phone: "(203) 668-8164" },
        { business_name: "Polish Co", city: "Dallas", phone: "(214) 555-0199" },
      ],
    );
    expect(fresh.map((item) => item.action)).toEqual(["insert", "insert"]);

    const twice = planImportMerge(
      [stored()],
      [
        { business_name: "Shine Shop", city: "Austin", phone: "(203) 668-8164" },
        { business_name: "Shine Shop", city: "Austin", phone: "(203) 668-9999" },
      ],
    );
    expect(twice[0]?.action).toBe("backfill_phone");
    expect(twice[1]?.action).toBe("insert");
  });

  it("does not guess when two leads share a business name", () => {
    const [item] = planImportMerge(
      [
        stored({ id: "a", city: "Austin" }),
        stored({ id: "b", city: "Dallas", dedupeKey: "name:shine shop|dallas" }),
      ],
      [{ business_name: "Shine Shop", city: "Houston", phone: "(203) 668-8164" }],
    );
    expect(item?.action).toBe("insert");
  });

  it("backfills a website match whose phone was never stored", () => {
    const [item] = planImportMerge(
      [stored({ website: "https://shine.example", dedupeKey: "domain:shine.example" })],
      [{ business_name: "Shine Shop", website: "shine.example", phone: "(203) 668-8164" }],
    );
    expect(item?.action).toBe("backfill_phone");
  });
});
