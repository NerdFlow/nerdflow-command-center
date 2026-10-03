import { describe, expect, it } from "vitest";
import { emptyLoad, rewriteForSlot, type RouteRep } from "@/lib/focusRouting";
import type { MappedPipelineRow } from "@/lib/pipelineToday";
import {
  cardForBadContactRoute,
  decideSkip,
  defaultSkipReturnStamp,
  routeAfterBadContact,
  validSkipReturnStamp,
} from "@/lib/skipReason";

function rep(id: string, channels: RouteRep["channels"]): RouteRep {
  return { id, channels, caps: {}, load: emptyLoad() };
}

function emailRow(): MappedPipelineRow {
  return {
    sheetRow: 1,
    timeLabel: "5:00 PM PKT",
    contactName: "Lee Kurtas",
    company: "High Performance Home Systems",
    actionLabel: "Send email",
    kind: "send_email",
    channel: "email",
    linkKind: "mailto",
    linkUrl: null,
    mailtoTo: "lee@example.com",
    mailtoSubject: "Hello",
    message: "Hi Lee",
    blankMessage: false,
    connectNoNote: false,
    phone: "512-555-0100",
    outcomeMode: "done_skip",
    intel: "Open in Titan and send it yourself.",
    sheetDone: false,
  };
}

const today = "2026-10-03";

describe("skip reasons", () => {
  it("brings a not_now card back seven days later, or on the date the rep picks", () => {
    expect(defaultSkipReturnStamp(today)).toBe("2026-10-10");
    expect(validSkipReturnStamp("2026-10-10", today)).toBe(true);
    expect(validSkipReturnStamp(today, today)).toBe(false);

    const picked = decideSkip({
      reason: "not_now",
      linkedinUrl: null,
      phone: null,
      reps: [],
      defaultCap: 30,
      leadOwnerId: "owner",
      returnsOn: "2026-10-20",
      todayPkt: today,
    });
    expect(picked.cardStatus).toBe("snoozed");
    expect(picked.returnsOn).toBe("2026-10-20");
    expect(picked.leadStatus).toBeNull();

    const fallback = decideSkip({
      reason: "not_now",
      linkedinUrl: null,
      phone: null,
      reps: [],
      defaultCap: 30,
      leadOwnerId: "owner",
      returnsOn: null,
      todayPkt: today,
    });
    expect(fallback.returnsOn).toBe("2026-10-10");
  });

  it("marks a bad email and opens LinkedIn when a profile URL exists", () => {
    const reps = [rep("muqeet", ["email", "linkedin"])];
    const route = routeAfterBadContact({
      linkedinUrl: "https://www.linkedin.com/in/lee-kurtas",
      phone: "512-555-0100",
      reps,
      defaultCap: 30,
      leadOwnerId: "muqeet",
    });
    expect(route).toEqual({ slot: "linkedin", assigneeId: "muqeet" });
    const card = cardForBadContactRoute(emailRow(), route, { email: "lee@example.com", linkedinUrl: route.slot ? "https://www.linkedin.com/in/lee-kurtas" : null, phone: "512-555-0100" }, reps[0]);
    expect(card.kind).toBe("linkedin_request");
    expect(card.linkKind).toBe("linkedin_profile");
    expect(card.kind).not.toBe("contact_form");
    expect(card.linkKind).not.toBe("contact_form");
  });

  it("opens a call card when there is a phone and someone works calls", () => {
    const reps = [rep("caller", ["call"]), rep("mail", ["email"])];
    const route = routeAfterBadContact({
      linkedinUrl: null,
      phone: "512-555-0100",
      reps,
      defaultCap: 30,
      leadOwnerId: "mail",
    });
    expect(route.slot).toBe("call");
    expect(route.assigneeId).toBe("caller");
    const card = cardForBadContactRoute(emailRow(), route, { email: "lee@example.com", linkedinUrl: null, phone: "512-555-0100" }, reps[0]);
    expect(card.kind).toBe("call");
    expect(card.channel).toBe("call");
    expect(card.linkKind).not.toBe("contact_form");
  });

  it("sets needs_contact when there is no LinkedIn URL and nobody can call", () => {
    const decision = decideSkip({
      reason: "bad_contact",
      linkedinUrl: null,
      phone: "512-555-0100",
      reps: [rep("mail", ["email"])],
      defaultCap: 30,
      leadOwnerId: "mail",
      returnsOn: null,
      todayPkt: today,
    });
    expect(decision.emailInvalid).toBe(true);
    expect(decision.leadStatus).toBe("needs_contact");
    expect(decision.route?.slot).toBe("needs_contact");
    const card = cardForBadContactRoute(
      emailRow(),
      { slot: "needs_contact", assigneeId: "mail" },
      { email: "lee@example.com", linkedinUrl: null, phone: "512-555-0100" },
      rep("mail", ["email"]),
    );
    expect(card.kind).toBe("needs_contact");
    expect(card.kind).not.toBe("contact_form");
    expect(rewriteForSlot(emailRow(), "needs_contact", { email: null, linkedinUrl: null, phone: null }, undefined).linkKind).not.toBe("contact_form");
  });

  it("stops outreach for not a fit and already in touch, and leaves other as a card skip", () => {
    const notFit = decideSkip({
      reason: "not_fit",
      linkedinUrl: null,
      phone: null,
      reps: [],
      defaultCap: 30,
      leadOwnerId: "owner",
      returnsOn: null,
      todayPkt: today,
    });
    expect(notFit.leadStatus).toBe("not_fit");
    expect(notFit.route).toBeNull();

    const inTouch = decideSkip({
      reason: "already_in_touch",
      linkedinUrl: null,
      phone: null,
      reps: [],
      defaultCap: 30,
      leadOwnerId: "owner",
      returnsOn: null,
      todayPkt: today,
    });
    expect(inTouch.stopOutreach).toBe(true);
    expect(inTouch.leadStatus).toBeNull();

    const other = decideSkip({
      reason: "other",
      linkedinUrl: "https://www.linkedin.com/in/lee",
      phone: "512-555-0100",
      reps: [rep("owner", ["email", "linkedin", "call"])],
      defaultCap: 30,
      leadOwnerId: "owner",
      returnsOn: null,
      todayPkt: today,
    });
    expect(other.leadStatus).toBeNull();
    expect(other.route).toBeNull();
    expect(other.emailInvalid).toBe(false);

    const wrong = decideSkip({
      reason: "wrong_person",
      linkedinUrl: null,
      phone: null,
      reps: [],
      defaultCap: 30,
      leadOwnerId: "owner",
      returnsOn: null,
      todayPkt: today,
    });
    expect(wrong.leadStatus).toBe("needs_contact");
    expect(wrong.route).toBeNull();
  });

  it("does not open a second copy of the card that was just skipped", () => {
    const onLinkedIn = decideSkip({
      reason: "bad_contact",
      linkedinUrl: "https://www.linkedin.com/in/lee-kurtas",
      phone: "512-555-0100",
      reps: [rep("caller", ["call", "linkedin"])],
      defaultCap: 30,
      leadOwnerId: "caller",
      returnsOn: null,
      todayPkt: today,
      currentSlot: "linkedin",
    });
    expect(onLinkedIn.emailInvalid).toBe(true);
    expect(onLinkedIn.route?.slot).toBe("call");

    const onCall = decideSkip({
      reason: "bad_contact",
      linkedinUrl: null,
      phone: "512-555-0100",
      reps: [rep("caller", ["call"])],
      defaultCap: 30,
      leadOwnerId: "caller",
      returnsOn: null,
      todayPkt: today,
      currentSlot: "call",
    });
    expect(onCall.route?.slot).toBe("needs_contact");
    expect(onCall.leadStatus).toBe("needs_contact");
  });
});
