import { describe, expect, it } from "vitest";
import { classifyFocusCards, type FocusIngestCard } from "@/lib/focusIngest";
import {
  emptyLoad,
  isNamedPersonEmail,
  matchOwnerHint,
  planQueueReroute,
  selectRoutedCards,
  type RouteRep,
} from "@/lib/focusRouting";
import type { MappedPipelineRow } from "@/lib/pipelineToday";

function rep(id: string, channels: RouteRep["channels"], load: Partial<RouteRep["load"]> = {}, caps: RouteRep["caps"] = {}): RouteRep {
  return { id, channels, caps, load: { ...emptyLoad(), ...load } };
}

function card(partial: Partial<FocusIngestCard> & Pick<FocusIngestCard, "cardId" | "name" | "action">): MappedPipelineRow {
  const parsed = classifyFocusCards([
    {
      company: partial.company ?? "Acme",
      link: partial.link ?? { kind: "none" },
      message: partial.message ?? "",
      ...partial,
    },
  ]);
  const row = parsed.accepted[0]?.row;
  if (!row) throw new Error(`card ${partial.cardId} was rejected`);
  return row;
}

const muqeet = () => rep("muqeet", ["email", "linkedin"], {}, { email: 5, linkedin: 5 });
const caller = () => rep("caller", ["call"], {}, { call: 5 });
const mailer = () => rep("mailer", ["email"], {}, { email: 5 });

describe("named-person email", () => {
  it("accepts a person's address and skips a role inbox", () => {
    expect(isNamedPersonEmail("lee@example.com")).toBe(true);
    expect(isNamedPersonEmail("info@example.com")).toBe(false);
    expect(isNamedPersonEmail("sales@example.com")).toBe(false);
  });
});

describe("focus card routing", () => {
  it("gives a named email to the lead owner when they work email and have room", () => {
    const routed = selectRoutedCards({
      cards: [
        { cardId: "email", row: card({ cardId: "email", name: "Lee", action: "Send email", link: { kind: "mailto", url: "mailto:lee@example.com" } }) },
        { cardId: "li", row: card({ cardId: "li", name: "Lee", action: "LinkedIn request", link: { kind: "linkedin_profile", url: "https://www.linkedin.com/in/lee" } }) },
      ],
      leadOwners: new Map(),
      hintOwnerId: "muqeet",
      fallbackOwnerId: "muqeet",
      reps: [muqeet(), caller(), mailer()],
      defaultCap: 30,
    });
    expect(routed.routed).toEqual([
      expect.objectContaining({ cardId: "email", assigneeId: "muqeet", leadOwnerId: "muqeet", slot: "email" }),
    ]);
    expect(routed.rejected).toEqual([{ cardId: "li", reason: "later_channel" }]);
  });

  it("routes a call on Muqeet's lead to the call rep and does not change the lead owner", () => {
    const routed = selectRoutedCards({
      cards: [{ cardId: "call-1", row: card({ cardId: "call-1", name: "Lee", company: "HPHS", action: "Call" }) }],
      leadOwners: new Map([["pipeline:hphs|lee", "muqeet"]]),
      hintOwnerId: null,
      fallbackOwnerId: "mailer",
      reps: [muqeet(), caller()],
      defaultCap: 30,
    });
    expect(routed.routed).toEqual([
      expect.objectContaining({ cardId: "call-1", assigneeId: "caller", leadOwnerId: "muqeet", slot: "call" }),
    ]);
    expect(routed.rejected).toEqual([]);
  });

  it("skips a full channel and uses the next one", () => {
    const full = muqeet();
    full.load.email = 5;
    const routed = selectRoutedCards({
      cards: [
        { cardId: "email", row: card({ cardId: "email", name: "Lee", action: "Send email", link: { kind: "mailto", url: "mailto:lee@example.com" } }) },
        { cardId: "li", row: card({ cardId: "li", name: "Lee", action: "LinkedIn request", link: { kind: "linkedin_profile", url: "https://www.linkedin.com/in/lee" } }) },
      ],
      leadOwners: new Map([["pipeline:acme|lee", "muqeet"]]),
      hintOwnerId: null,
      fallbackOwnerId: "muqeet",
      reps: [full],
      defaultCap: 30,
    });
    expect(routed.routed.map((item) => item.slot)).toEqual(["linkedin"]);
    expect(routed.routed[0]?.assigneeId).toBe("muqeet");
    expect(routed.rejected).toEqual([{ cardId: "email", reason: "channel_skipped" }]);
  });

  it("picks the teammate with the fewest cards today", () => {
    const busy = mailer();
    busy.load.email = 2;
    const quiet = rep("quiet", ["email"], { email: 0 }, { email: 5 });
    const routed = selectRoutedCards({
      cards: [{ cardId: "email", row: card({ cardId: "email", name: "Lee", action: "Send email", link: { kind: "mailto", url: "mailto:lee@example.com" } }) }],
      leadOwners: new Map([["pipeline:acme|lee", "muqeet"]]),
      hintOwnerId: null,
      fallbackOwnerId: "muqeet",
      reps: [muqeet(), busy, quiet],
      defaultCap: 30,
    });
    expect(routed.routed[0]?.assigneeId).toBe("quiet");
    expect(routed.routed[0]?.leadOwnerId).toBe("muqeet");
  });

  it("drops contact forms and role inboxes, then keeps LinkedIn", () => {
    const routed = selectRoutedCards({
      cards: [
        {
          cardId: "form",
          row: card({ cardId: "form", name: "Lee", action: "Send email", link: { kind: "contact_form", url: "https://example.com/contact" } }),
        },
        {
          cardId: "info",
          row: card({ cardId: "info", name: "Doug", company: "Roofs", action: "Send email", link: { kind: "mailto", url: "mailto:info@roofs.example" } }),
        },
        {
          cardId: "li",
          row: card({ cardId: "li", name: "Doug", company: "Roofs", action: "LinkedIn request", link: { kind: "linkedin_profile", url: "https://www.linkedin.com/in/doug" } }),
        },
      ],
      leadOwners: new Map(),
      hintOwnerId: "muqeet",
      fallbackOwnerId: "muqeet",
      reps: [muqeet(), caller()],
      defaultCap: 30,
    });
    expect(routed.rejected).toContainEqual({ cardId: "form", reason: "contact_form" });
    expect(routed.rejected).toContainEqual({ cardId: "info", reason: "not_named_email" });
    expect(routed.routed.map((item) => ({ id: item.cardId, slot: item.slot, assignee: item.assigneeId }))).toEqual([
      { id: "li", slot: "linkedin", assignee: "muqeet" },
    ]);
    expect(routed.routed.some((item) => item.row.kind === "contact_form")).toBe(false);
  });

  it("does not queue a contact form on its own", () => {
    const routed = selectRoutedCards({
      cards: [
        {
          cardId: "form",
          row: card({ cardId: "form", name: "Lee", action: "Send email", link: { kind: "contact_form", url: "https://example.com/contact" } }),
        },
      ],
      leadOwners: new Map([["pipeline:acme|lee", "muqeet"]]),
      hintOwnerId: null,
      fallbackOwnerId: "muqeet",
      reps: [muqeet(), caller()],
      defaultCap: 30,
    });
    expect(routed.routed).toEqual([]);
    expect(routed.rejected).toEqual([{ cardId: "form", reason: "contact_form" }]);
  });

  it("turns a call nobody can take into needs_contact on the lead owner", () => {
    const routed = selectRoutedCards({
      cards: [{ cardId: "call-1", row: card({ cardId: "call-1", name: "Lee", action: "Call" }) }],
      leadOwners: new Map([["pipeline:acme|lee", "muqeet"]]),
      hintOwnerId: null,
      fallbackOwnerId: "muqeet",
      reps: [muqeet()],
      defaultCap: 30,
    });
    expect(routed.routed[0]).toEqual(expect.objectContaining({ assigneeId: "muqeet", leadOwnerId: "muqeet", slot: "needs_contact" }));
    expect(routed.routed[0]?.row.kind).toBe("needs_contact");
    expect(routed.routed[0]?.row.channel).not.toBe("call");
  });

  it("moves an open call off a rep who stopped working calls", () => {
    const plans = planQueueReroute({
      cards: [
        {
          id: "row-1",
          slot: "call",
          leadOwnerId: "muqeet",
          assigneeId: "muqeet",
          hasNamedEmail: true,
          hasLinkedin: true,
          hasPhone: true,
        },
      ],
      reps: [muqeet(), caller()],
      defaultCap: 30,
    });
    expect(plans).toEqual([{ id: "row-1", assigneeId: "caller", slot: "call", changed: true }]);
  });
});

describe("owner hint", () => {
  it("matches an email, a local part, or a full name", () => {
    const users = [
      { id: "1", email: "muqeet@nerdflow.tech", fullName: "Muqeet Shah" },
      { id: "2", email: "baryal@nerdflow.tech", fullName: "Baryal" },
    ];
    expect(matchOwnerHint(users, "muqeet")?.id).toBe("1");
    expect(matchOwnerHint(users, "Baryal")?.id).toBe("2");
    expect(matchOwnerHint(users, "")).toBeNull();
    expect(matchOwnerHint(users, "nobody")).toBeNull();
  });
});
