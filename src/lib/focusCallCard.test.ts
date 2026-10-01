import { describe, expect, it } from "vitest";
import {
  buildCallCard,
  callCardHasHoles,
  dropCard,
  finishPending,
  focusSessionStacks,
  formatLastTouch,
  normalizeCallerNote,
  recordPending,
  restoreCard,
  startOptimisticOutcome,
  websiteHref,
} from "@/lib/focusCallCard";

const strategy = {
  summary: "Find independent auto detailing shops that miss bookings when the bay is full.",
  icp: { business: "Independent auto detailing shops" },
  call_scripts: [
    "Hi, is this {name}? This is {me}, and I work with auto detailing shops in {city}. When the bay at {biz} is full, who catches the next booking?",
    "Hi {name}, {me} here. {product} keeps the next job on the calendar at {biz}.",
  ],
  objections: [
    { question: "We are already booked out.", answer: "{product} is for the calls that never make the calendar." },
    { question: "Just send me some info.", answer: "Agree, then book a follow-up with {name}." },
  ],
};

describe("call card copy", () => {
  it("resolves Immaculate Auto Spa without template holes when the contact name is missing", () => {
    const card = buildCallCard({
      leadId: "immaculate",
      contactName: null,
      contactRole: null,
      businessName: "Immaculate Auto Spa",
      city: "Milford",
      website: "immaculateautospa.example",
      fitReasons: ["Reviews mention missed callbacks"],
      productName: "BayBook",
      me: "Muqeet",
      strategy,
      lastTouch: null,
    });
    expect(card.opener).toContain("the owner");
    expect(card.opener).not.toMatch(/\bthere\b/i);
    expect(card.opener).toContain("Immaculate Auto Spa");
    expect(card.who).toBe("Ask for the owner");
    expect(card.why).toBe("Reviews mention missed callbacks");
    expect(card.websiteHref).toBe("https://immaculateautospa.example");
    expect(card.scriptLabel === "Script A" || card.scriptLabel === "Script B").toBe(true);
    expect(card.objections.some((item) => item.answer.includes("BayBook"))).toBe(true);
    expect(callCardHasHoles(card)).toBe(false);
    expect(focusSessionStacks()).toEqual({ card: "scroll", outcomes: "footer" });
  });

  it("uses the stored contact, website, and last touch", () => {
    const card = buildCallCard({
      leadId: "immaculate",
      contactName: "Maria Gomez",
      contactRole: "Owner",
      businessName: "Immaculate Auto Spa",
      city: "Milford",
      website: "https://immaculate.example",
      fitReasons: [],
      productName: "BayBook",
      me: "Muqeet",
      strategy,
      lastTouch: { channel: "call", outcome: "no_answer", occurredAt: new Date("2026-09-30T15:00:00.000Z") },
      now: new Date("2026-10-01T15:00:00.000Z"),
    });
    expect(card.who).toBe("Maria Gomez · Owner");
    expect(card.opener).toContain("Maria");
    expect(card.opener).not.toContain("{name}");
    expect(card.why.startsWith("Find independent auto detailing shops")).toBe(true);
    expect(card.websiteHref).toBe("https://immaculate.example");
    expect(card.lastTouch).toBe("Last touch: Call · No answer · yesterday");
    expect(formatLastTouch({ channel: "email", outcome: "sent", occurredAt: new Date("2026-10-01T12:00:00.000Z") }, new Date("2026-10-01T15:00:00.000Z"))).toBe(
      "Last touch: Email · Sent · today",
    );
  });
});

describe("optimistic outcomes", () => {
  const cards = [{ lead: { id: "a" } }, { lead: { id: "b" } }, { lead: { id: "c" } }];

  it("advances immediately and keeps every in-flight outcome", () => {
    const inFlight = new Set<string>();
    expect(startOptimisticOutcome(inFlight, "a")).toBe(true);
    expect(startOptimisticOutcome(inFlight, "a")).toBe(false);
    expect(startOptimisticOutcome(inFlight, "b")).toBe(true);

    let pending = recordPending([], { leadId: "a", outcome: "no_answer", callerNote: "Asked for Maria" });
    let visible = dropCard(cards, "a");
    pending = recordPending(pending, { leadId: "b", outcome: "voicemail", callerNote: null });
    visible = dropCard(visible, "b");

    expect(visible.map((card) => card.lead.id)).toEqual(["c"]);
    expect(pending).toEqual([
      { leadId: "a", outcome: "no_answer", callerNote: "Asked for Maria" },
      { leadId: "b", outcome: "voicemail", callerNote: null },
    ]);

    pending = finishPending(pending, "a");
    expect(pending.map((item) => item.leadId)).toEqual(["b"]);
  });

  it("puts a failed save back on the card so the outcome can be logged again", () => {
    const failed = { lead: { id: "a" } };
    const visible = dropCard(cards, "a");
    const restored = restoreCard(visible, failed);
    expect(restored[0]?.lead.id).toBe("a");
    expect(restored.map((card) => card.lead.id)).toEqual(["a", "b", "c"]);
    expect(normalizeCallerNote("  they asked me to call Thursday  ")).toBe("they asked me to call Thursday");
    expect(normalizeCallerNote("   ")).toBeNull();
  });
});
