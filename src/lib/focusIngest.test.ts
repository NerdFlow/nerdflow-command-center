import { describe, expect, it } from "vitest";
import {
  classifyFocusCards,
  focusIngestAuth,
  focusIngestBodySchema,
  planComplete,
  planFocusRebuild,
  preflightComplete,
  preflightRebuild,
  type FocusIngestCard,
  type RebuildPlan,
} from "@/lib/focusIngest";
import { PIPELINE_SPREADSHEET_ID, PIPELINE_TODAY_SHEET_ID, sheetRowForWriteback } from "@/lib/pipelineToday";

const SECRET = "ingest-test-secret";

const sampleCards: FocusIngestCard[] = [
  {
    cardId: "2026-10-02-hphs-lee-li",
    timePkt: "5:00 PM",
    name: "Lee Kurtas",
    company: "High Performance Home Systems",
    dealId: null,
    action: "LinkedIn request",
    link: { kind: "linkedin_profile", url: "https://www.linkedin.com/in/lee-kurtas-7790b225", label: "Open LinkedIn" },
    message: "",
    rules: { linkedinNote: false, autoSend: false, fromIdentity: "muqeet@nerdflow.tech" },
    done: false,
  },
  {
    cardId: "2026-10-02-hphs-lee-email",
    timePkt: "5:00 PM",
    name: "Lee Kurtas",
    company: "High Performance Home Systems",
    dealId: null,
    action: "Send email",
    link: { kind: "contact_form", url: "https://highperformancehomesystems.com/contact/", label: "Open form" },
    message: "Hi Lee,\n\nSaw High Performance Home Systems is hiring an HVAC dispatcher.\n\nMuqeet",
    rules: { linkedinNote: false, autoSend: false, fromIdentity: "muqeet@nerdflow.tech" },
    done: false,
  },
  {
    cardId: "2026-10-02-mm-doug-li",
    timePkt: "5:50 PM",
    name: "Doug Moncure",
    company: "M&M Roofing",
    dealId: null,
    action: "LinkedIn request",
    link: { kind: "linkedin_profile", url: "https://www.linkedin.com/in/douglas-moncure", label: "Open LinkedIn" },
    message: "",
    rules: { linkedinNote: false, autoSend: false, fromIdentity: "muqeet@nerdflow.tech" },
    done: false,
  },
  {
    cardId: "2026-10-02-mm-doug-email",
    timePkt: "5:50 PM",
    name: "Doug Moncure",
    company: "M&M Roofing",
    dealId: null,
    action: "Send email",
    link: {
      kind: "mailto",
      url: "mailto:info@mmroofsiding.com?subject=your%20intake%20coordinator%20opening&body=Hi%20Doug",
      label: "Open in Titan → info@mmroofsiding.com",
    },
    message: "Hi Doug,\n\nSaw M&M Roofing is hiring an intake coordinator.\n\nMuqeet",
    rules: { linkedinNote: false, autoSend: false, fromIdentity: "muqeet@nerdflow.tech" },
    done: false,
  },
  {
    cardId: "2026-10-02-northstar-bill-email",
    timePkt: "6:50 PM",
    name: "Bill Olson",
    company: "Northstar",
    dealId: null,
    action: "Send email",
    link: {
      kind: "mailto",
      url: "mailto:info@northstarcapecod.com?subject=dispatcher",
      label: "Open in Titan → info@northstarcapecod.com",
    },
    message: "Hi Bill,\n\nSaw Northstar is hiring an HVAC dispatcher.\n\nMuqeet",
    rules: { linkedinNote: false, autoSend: false, fromIdentity: "muqeet@nerdflow.tech" },
    done: false,
  },
  {
    cardId: "2026-10-02-fu-nf049",
    timePkt: null,
    name: "Travis Crawford",
    company: "Travis Crawford",
    dealId: "NF-049",
    action: "Follow-up",
    link: { kind: "linkedin_profile", url: "https://www.linkedin.com/in/travis-crawford-071a156", label: "Open LinkedIn" },
    message: "",
    rules: { linkedinNote: false, autoSend: false, fromIdentity: "muqeet@nerdflow.tech" },
    done: false,
  },
];

function body(cards: FocusIngestCard[], extra: Record<string, unknown> = {}) {
  return {
    owner: "muqeet",
    datePkt: "2026-10-02",
    source: "today-rebuild",
    cards,
    ...extra,
  };
}

function authHeader(secret = SECRET) {
  return `Bearer ${secret}`;
}

function statuses(plan: RebuildPlan) {
  if (!plan.ok) throw new Error(plan.error);
  return Object.fromEntries(plan.writes.map((write) => [write.cardId, write.status]));
}

describe("focus ingest auth", () => {
  it("rejects a missing secret, a missing header, and a wrong token", () => {
    expect(focusIngestAuth(authHeader(), undefined)).toBe("unconfigured");
    expect(focusIngestAuth(authHeader(), "  ")).toBe("unconfigured");
    expect(focusIngestAuth(null, SECRET)).toBe("unauthorized");
    expect(focusIngestAuth("Bearer wrong", SECRET)).toBe("unauthorized");
    expect(focusIngestAuth(`bearer ${SECRET}`, SECRET)).toBe("unauthorized");
    expect(focusIngestAuth(authHeader(), SECRET)).toBe("ok");
  });

  it("returns 401 and 501 from preflight and keeps an owner as a hint", () => {
    const payload = body(sampleCards);
    const unconfigured = preflightRebuild({
      authorization: authHeader(),
      secret: undefined,
      pathDate: "2026-10-02",
      queryForce: null,
      body: payload,
    });
    expect(unconfigured.ok).toBe(false);
    if (!unconfigured.ok) expect(unconfigured.status).toBe(501);
    const denied = preflightRebuild({
      authorization: "Bearer nope",
      secret: SECRET,
      pathDate: "2026-10-02",
      queryForce: null,
      body: payload,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.status).toBe(401);

    const hinted = preflightRebuild({
      authorization: authHeader(),
      secret: SECRET,
      pathDate: "2026-10-02",
      queryForce: null,
      body: body(sampleCards, { owner: "hadi" }),
    });
    expect(hinted.ok).toBe(true);
    if (!hinted.ok) return;
    expect(hinted.ownerHint).toBe("hadi");

    const noOwner = preflightRebuild({
      authorization: authHeader(),
      secret: SECRET,
      pathDate: "2026-10-02",
      queryForce: null,
      body: { datePkt: "2026-10-02", source: "today-rebuild", cards: [sampleCards[0]] },
    });
    expect(noOwner.ok).toBe(true);
    if (!noOwner.ok) return;
    expect(noOwner.ownerHint).toBeNull();
  });
});

describe("focus ingest rebuild", () => {
  it("maps the sample day and keeps call cards for routing", () => {
    const call: FocusIngestCard = {
      ...sampleCards[0]!,
      cardId: "2026-10-02-call",
      action: "Call",
      link: { kind: "none", url: null, label: "Dial" },
    };
    const classified = classifyFocusCards([...sampleCards, call, { ...call, cardId: "2026-10-02-phone", action: "Phone call" }]);
    expect(classified.rejected).toEqual([]);
    expect(classified.accepted.map((card) => card.cardId)).toEqual([
      ...sampleCards.map((card) => card.cardId),
      "2026-10-02-call",
      "2026-10-02-phone",
    ]);
    expect(classified.accepted.map((card) => card.row.kind)).toEqual([
      "linkedin_request",
      "contact_form",
      "linkedin_request",
      "send_email",
      "send_email",
      "follow_up",
      "call",
      "call",
    ]);
    expect(classified.accepted[0]?.row.message).toBe("");
    expect(classified.accepted[0]?.row.connectNoNote).toBe(true);
    expect(classified.accepted[1]?.row.linkUrl).toBe("https://highperformancehomesystems.com/contact/");
    expect(classified.accepted[3]?.row.mailtoTo).toBe("info@mmroofsiding.com");
    expect(classified.accepted[3]?.row.message).toContain("Hi Doug");
    expect(classified.accepted[5]?.row.timeLabel).toBe("—");
    expect(classified.accepted[5]?.dealCode).toBe("NF-049");
    expect(classified.accepted[5]?.row.outcomeMode).toBe("done_skip_followup");
    expect(classified.accepted.some((card) => card.row.kind === "call")).toBe(true);

    const mixed = preflightRebuild({
      authorization: authHeader(),
      secret: SECRET,
      pathDate: "2026-10-02",
      queryForce: null,
      body: body([...sampleCards, call]),
    });
    expect(mixed.ok).toBe(true);
    if (!mixed.ok) return;
    expect(mixed.rejected).toEqual([]);
    expect(mixed.accepted).toHaveLength(7);
    expect(sheetRowForWriteback(mixed.accepted[0]!.cardId, mixed.accepted[0]!.row.sheetRow)).toBeNull();
    expect(sheetRowForWriteback(`${PIPELINE_SPREADSHEET_ID}:${PIPELINE_TODAY_SHEET_ID}:2026-10-02:4`, 4)).toBe(4);

    const onlyCalls = preflightRebuild({
      authorization: authHeader(),
      secret: SECRET,
      pathDate: "2026-10-02",
      queryForce: null,
      body: body([call]),
    });
    expect(onlyCalls.ok).toBe(true);
    if (!onlyCalls.ok) return;
    expect(onlyCalls.accepted.map((card) => card.row.kind)).toEqual(["call"]);
  });

  it("is idempotent and keeps same-day Done unless force=true", () => {
    const parsed = focusIngestBodySchema.parse(body(sampleCards));
    const ownerId = "user-muqeet";
    const cards = parsed.cards.map((card) => ({ cardId: card.cardId, done: card.done, assigneeId: ownerId }));
    const first = planFocusRebuild({ datePkt: "2026-10-02", cards, existing: [], force: false });
    expect(statuses(first)).toEqual({
      "2026-10-02-hphs-lee-li": "open",
      "2026-10-02-hphs-lee-email": "open",
      "2026-10-02-mm-doug-li": "open",
      "2026-10-02-mm-doug-email": "open",
      "2026-10-02-northstar-bill-email": "open",
      "2026-10-02-fu-nf049": "open",
    });
    if (!first.ok) return;
    expect(first.dropKeys).toEqual([]);

    const stored = first.writes.map((write) => ({
      externalKey: write.cardId,
      queueDate: "2026-10-02",
      status: write.status,
      ownerId,
    }));
    stored.push({ externalKey: "2026-10-02-already-done", queueDate: "2026-10-02", status: "done", ownerId });
    stored.push({ externalKey: "2026-10-02-still-open", queueDate: "2026-10-02", status: "open", ownerId });

    const second = planFocusRebuild({ datePkt: "2026-10-02", cards, existing: stored, force: false });
    expect(statuses(second)).toEqual(statuses(first));
    if (!second.ok) return;
    expect(second.dropKeys).toEqual(["2026-10-02-still-open"]);
    expect(second.dropKeys).not.toContain("2026-10-02-already-done");

    const held = planFocusRebuild({
      datePkt: "2026-10-02",
      cards,
      existing: [
        ...stored,
        { externalKey: "2026-10-02-routed-li", queueDate: "2026-10-02", status: "open", ownerId, held: true },
      ],
      force: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.dropKeys).not.toContain("2026-10-02-routed-li");

    const afterDrop = stored.map((row) => (row.externalKey === "2026-10-02-still-open" ? { ...row, status: "dropped" } : row));
    const third = planFocusRebuild({ datePkt: "2026-10-02", cards, existing: afterDrop, force: false });
    expect(statuses(third)).toEqual(statuses(first));
    if (!third.ok) return;
    expect(third.dropKeys).toEqual([]);

    const doneInPayload = planFocusRebuild({
      datePkt: "2026-10-02",
      cards: [{ cardId: "2026-10-02-already-done", done: false, assigneeId: ownerId }],
      existing: [{ externalKey: "2026-10-02-already-done", queueDate: "2026-10-02", status: "done", ownerId }],
      force: false,
    });
    expect(statuses(doneInPayload)).toEqual({ "2026-10-02-already-done": "done" });

    const forced = planFocusRebuild({
      datePkt: "2026-10-02",
      cards: [{ cardId: "2026-10-02-already-done", done: false, assigneeId: "user-caller" }],
      existing: [
        { externalKey: "2026-10-02-already-done", queueDate: "2026-10-02", status: "done", ownerId },
        { externalKey: "2026-10-02-old-done", queueDate: "2026-10-02", status: "done", ownerId },
      ],
      force: true,
    });
    expect(statuses(forced)).toEqual({ "2026-10-02-already-done": "open" });
    if (!forced.ok) return;
    expect(forced.dropKeys).toEqual(["2026-10-02-old-done"]);

    const stale = planFocusRebuild({
      datePkt: "2026-10-02",
      cards: [{ cardId: "2026-10-01-old", done: false, assigneeId: ownerId }],
      existing: [{ externalKey: "2026-10-01-old", queueDate: "2026-10-01", status: "open", ownerId }],
      force: false,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.status).toBe(409);
  });

  it("rejects auto-send, a mismatched day, and duplicate card ids", () => {
    const sending = { ...sampleCards[1]!, cardId: "2026-10-02-autosend", rules: { autoSend: true, fromIdentity: "muqeet@nerdflow.tech" } };
    const pre = preflightRebuild({
      authorization: authHeader(),
      secret: SECRET,
      pathDate: "2026-10-02",
      queryForce: "true",
      body: body([sampleCards[0]!, sending]),
    });
    expect(pre.ok).toBe(true);
    if (!pre.ok) return;
    expect(pre.force).toBe(true);
    expect(pre.rejected).toEqual([{ cardId: "2026-10-02-autosend", reason: "auto_send_forbidden" }]);

    const mismatch = preflightRebuild({
      authorization: authHeader(),
      secret: SECRET,
      pathDate: "2026-10-03",
      queryForce: null,
      body: body(sampleCards),
    });
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) return;
    expect(mismatch.status).toBe(422);

    const dup = preflightRebuild({
      authorization: authHeader(),
      secret: SECRET,
      pathDate: "2026-10-02",
      queryForce: null,
      body: body([sampleCards[0]!, sampleCards[0]!]),
    });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.status).toBe(422);
  });
});

describe("focus ingest complete", () => {
  it("maps done, skip, and needs_follow_up, and conflicts on a second outcome", () => {
    expect(planComplete({ status: "open", outcomeMode: "done_skip", outcome: "done" })).toEqual({
      ok: true,
      status: "done",
      already: false,
    });
    expect(planComplete({ status: "open", outcomeMode: "done_skip", outcome: "skip" })).toEqual({
      ok: true,
      status: "skipped",
      already: false,
    });
    expect(planComplete({ status: "open", outcomeMode: "done_skip_followup", outcome: "needs_follow_up" })).toEqual({
      ok: true,
      status: "follow_up",
      already: false,
    });
    expect(planComplete({ status: "open", outcomeMode: "done_followup", outcome: "needs_follow_up" }).ok).toBe(true);
    expect(planComplete({ status: "done", outcomeMode: "done_skip", outcome: "done" })).toEqual({
      ok: true,
      status: "done",
      already: true,
    });

    const followOnEmail = planComplete({ status: "open", outcomeMode: "done_skip", outcome: "needs_follow_up" });
    expect(followOnEmail.ok).toBe(false);
    if (followOnEmail.ok) return;
    expect(followOnEmail.status).toBe(422);

    const skipOnNext = planComplete({ status: "open", outcomeMode: "done_followup", outcome: "skip" });
    expect(skipOnNext.ok).toBe(true);
    if (!skipOnNext.ok) return;
    expect(skipOnNext.status).toBe("skipped");

    const conflict = planComplete({ status: "done", outcomeMode: "done_skip", outcome: "skip" });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.status).toBe(409);

    const removed = planComplete({ status: "dropped", outcomeMode: "done_skip", outcome: "done" });
    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.status).toBe(409);
  });

  it("requires the bearer token and a real due date only for follow-up", () => {
    const missing = preflightComplete({ authorization: null, secret: SECRET, body: { outcome: "done" } });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.status).toBe(401);

    const dueOnDone = preflightComplete({
      authorization: authHeader(),
      secret: SECRET,
      body: { outcome: "done", dueDate: "2026-10-06" },
    });
    expect(dueOnDone.ok).toBe(false);

    const follow = preflightComplete({
      authorization: authHeader(),
      secret: SECRET,
      body: { outcome: "needs_follow_up", dueDate: "2026-10-06", note: "Asked for a quote", completedAtPkt: "2026-10-02T18:40" },
    });
    expect(follow.ok).toBe(true);
    if (!follow.ok) return;
    expect(follow.dueAt?.toISOString()).toBe("2026-10-06T04:00:00.000Z");
    expect(follow.occurredAt?.toISOString()).toBe("2026-10-02T13:40:00.000Z");
    expect(follow.note).toBe("Asked for a quote");

    const skipBare = preflightComplete({ authorization: authHeader(), secret: SECRET, body: { outcome: "skip" } });
    expect(skipBare.ok).toBe(false);
    if (!skipBare.ok) expect(skipBare.status).toBe(422);

    const skip = preflightComplete({
      authorization: authHeader(),
      secret: SECRET,
      body: { outcome: "skip", reason: "bad_contact", note: "Bounced" },
    });
    expect(skip.ok).toBe(true);
    if (!skip.ok) return;
    expect(skip.reason).toBe("bad_contact");
    expect(skip.note).toBe("Bounced");

    const later = preflightComplete({
      authorization: authHeader(),
      secret: SECRET,
      body: { outcome: "skip", reason: "not_now", dueDate: "2026-10-10" },
    });
    expect(later.ok).toBe(true);
    if (!later.ok) return;
    expect(later.returnStamp).toBe("2026-10-10");
  });
});
