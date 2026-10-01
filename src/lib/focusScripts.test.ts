import { describe, expect, it } from "vitest";
import { autoDetailingStarter } from "@/lib/playbooks/autoDetailing";
import {
  assignScriptVariant,
  resolveFocusOpener,
  scriptIdFor,
  startOfIsoWeek,
  weeklyScriptComparison,
} from "@/lib/focusScripts";

const values = { name: "Sam", biz: "Shine Shop", city: "Austin", me: "Alex", product: "BayBook" };

describe("system script assignment", () => {
  it("assigns a stable A or B and never asks the rep", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const id = `lead-${i}`;
      const variant = assignScriptVariant(id);
      expect(assignScriptVariant(id)).toBe(variant);
      seen.add(variant);
    }
    expect(seen.has("a")).toBe(true);
    expect(seen.has("b")).toBe(true);
    expect(scriptIdFor("email", "b")).toBe("email_b");
    expect(scriptIdFor("call", "a")).toBe("call_a");
  });

  it("logs a different script id for call and email variants", () => {
    const strategy = autoDetailingStarter({ productName: "BayBook", location: "Austin" });
    const call = resolveFocusOpener({
      channel: "call",
      leadId: "lead-1",
      productName: "BayBook",
      strategy,
      values,
    });
    const email = resolveFocusOpener({
      channel: "email",
      leadId: "lead-1",
      productName: "BayBook",
      strategy,
      values,
    });
    expect(call.variant).toBe(email.variant);
    expect(call.scriptId.startsWith("call_")).toBe(true);
    expect(email.scriptId.startsWith("email_")).toBe(true);
    expect(call.text).not.toBe(email.text);
  });
});

describe("opener copy", () => {
  it("shows a detailing opener instead of restaurant rush copy", () => {
    const opener = resolveFocusOpener({
      channel: "call",
      leadId: "shop-9",
      productName: "Auto Detailing OS",
      strategy: {
        summary: "restaurants that miss the dinner rush",
        icp: { business: "Independent restaurants" },
        call_scripts: [
          "Hi, this is {me} from ReceptAI. The kitchen's slammed at dinner rush.",
          "We help restaurants stop losing those calls.",
        ],
      },
      values,
    });
    expect(opener.text.toLowerCase()).not.toMatch(/receptai|dinner rush|restaurant/);
    expect(opener.text.toLowerCase()).toMatch(/detail/);
    expect(opener.text).toContain("Shine Shop");
  });

  it("keeps restaurant copy when the ICP is restaurants", () => {
    const opener = resolveFocusOpener({
      channel: "call",
      leadId: "shop-9",
      productName: "ReceptAI",
      strategy: {
        icp: { business: "Independent restaurants" },
        call_scripts: ["Hi {name}, this is {me} from ReceptAI. Dinner rush at {biz} is when calls drop.", "Second"],
      },
      values,
    });
    expect(opener.text).toMatch(/ReceptAI/);
  });
});

describe("weekly A/B", () => {
  const now = new Date("2026-10-01T15:00:00.000Z"); // Thursday

  it("counts interested per 100 touches for this week only", () => {
    const start = startOfIsoWeek(now);
    expect(start.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    const rows = weeklyScriptComparison(
      [
        { channel: "call", outcome: "interested", occurredAt: new Date("2026-09-29T12:00:00.000Z"), scriptId: "call_a" },
        { channel: "call", outcome: "no_answer", occurredAt: new Date("2026-09-30T12:00:00.000Z"), scriptUsed: "a" },
        { channel: "call", outcome: "meeting_booked", occurredAt: new Date("2026-09-30T18:00:00.000Z"), scriptId: "call_b" },
        { channel: "call", outcome: "no_answer", occurredAt: new Date("2026-09-30T19:00:00.000Z"), scriptId: "call_b" },
        { channel: "email", outcome: "replied", occurredAt: new Date("2026-10-01T12:00:00.000Z"), scriptId: "email_a" },
        { channel: "email", outcome: "sent", occurredAt: new Date("2026-10-01T13:00:00.000Z"), scriptId: "email_a" },
        { channel: "email", outcome: "sent", occurredAt: new Date("2026-10-01T14:00:00.000Z"), scriptId: "email_a" },
        { channel: "email", outcome: "sent", occurredAt: new Date("2026-10-01T15:00:00.000Z"), scriptId: "email_a" },
        { channel: "call", outcome: "interested", occurredAt: new Date("2026-09-20T12:00:00.000Z"), scriptId: "call_a" },
      ],
      now,
    );
    const callA = rows.find((r) => r.channel === "call" && r.variant === "a");
    const callB = rows.find((r) => r.channel === "call" && r.variant === "b");
    const emailA = rows.find((r) => r.channel === "email" && r.variant === "a");
    expect(callA).toMatchObject({ touches: 2, positive: 1, per100: 50 });
    expect(callB).toMatchObject({ touches: 2, positive: 1, per100: 50 });
    expect(emailA).toMatchObject({ touches: 4, positive: 1, per100: 25 });
  });
});
