import { describe, expect, it } from "vitest";
import type { CampaignStrategy } from "@/server/strategy";
import {
  SHAPE_A_DONE_SKIP_LABELS,
  actionFromPipeline,
  actionHeader,
  actionOutcomeMode,
  actionShowsBlankMessage,
  actionVisible,
  expandShapeLead,
  formatQueueClock,
  linkedinRequestReason,
  orderActions,
  pickerCounts,
  projectTodayActions,
  shapeHeadline,
  shapeIntel,
  todayActionKey,
  type TodayShapeLead,
} from "@/lib/todayCards";
import type { PipelineCardView } from "@/lib/pipelineToday";

const emailStrategy = {
  summary: "HVAC owners who need a CSR.",
  icp: { business: "Independent HVAC shops" },
  channels: [
    { channel: "email", why: "Leaves the ask in writing." },
    { channel: "linkedin", why: "Connect with no note, then email." },
  ],
  cadence: [
    { day: 0, channel: "email", purpose: "Intro the CSR opening.", tip: "Short." },
    { day: 3, channel: "linkedin", purpose: "Connect.", tip: "No note." },
  ],
  messages: {
    email: { first: "Subject: your CSR opening\n\nHi {name},", follow: "" },
    call: { first: "", follow: "" },
    instagram: { first: "", follow: "" },
    linkedin: { first: "", follow: "" },
  },
  objections: [],
  lead_gen: { sources: [], search_queries: [], must_have: [], score_boost: [] },
  kill_rule: "pause",
} as unknown as CampaignStrategy;

function lead(overrides: Partial<TodayShapeLead> = {}): TodayShapeLead {
  return {
    id: "travis",
    phone: null,
    email: "travis@hvac.example",
    linkedinUrl: "https://www.linkedin.com/in/travis-crawford",
    instagramUrl: null,
    contactName: "Travis Crawford",
    cadenceStep: 0,
    nextChannelOverride: null,
    signals: {},
    strategy: emailStrategy,
    linkedinRequestSent: false,
    openReplies: [],
    callAllowedNow: true,
    ...overrides,
  };
}

describe("one card per Today row", () => {
  it("keeps LinkedIn request and Send email as two cards for the same person", () => {
    const actions = expandShapeLead(lead(), ["call", "email", "linkedin", "instagram"]);
    const kinds = actions.map((action) => action.kind);
    expect(kinds).toEqual(["linkedin_request", "send_email"]);
    expect(new Set(actions.map((action) => action.key)).size).toBe(2);
    expect(actions.every((action) => action.leadId === "travis")).toBe(true);
    expect(linkedinRequestReason(lead())).toBe("cold_email_pair");
  });

  it("drops the email and contact form after a bad contact, and keeps LinkedIn", () => {
    const actions = expandShapeLead(
      lead({
        signals: {
          emailInvalid: true,
          contactFormUrl: "https://hvac.example/contact",
        },
      }),
      ["call", "email", "linkedin"],
    );
    expect(actions.map((action) => action.kind)).toEqual(["linkedin_request"]);
  });

  it("does not collapse a reply into the cold cards", () => {
    const actions = expandShapeLead(
      lead({
        openReplies: [{ id: "reply-1", channel: "linkedin" }],
      }),
      ["email", "linkedin"],
    );
    expect(actions.map((action) => action.kind)).toEqual(["reply", "linkedin_request", "send_email"]);
    expect(actions[0]?.key).toBe(todayActionKey("travis", "reply", "reply-1"));
  });

  it("counts Call, Email, and LinkedIn separately and sums them on Everything", () => {
    const actions = [
      ...expandShapeLead(lead(), ["call", "email", "linkedin"]),
      ...expandShapeLead(
        lead({
          id: "caller",
          email: null,
          linkedinUrl: null,
          contactName: null,
          phone: "512-555-0199",
          cadenceStep: 2,
          strategy: {
            ...emailStrategy,
            cadence: [{ day: 0, channel: "call", purpose: "Call", tip: "Short." }],
          },
        }),
        ["call", "email", "linkedin"],
      ),
    ];
    const counts = pickerCounts(actions);
    expect(counts.email).toBe(1);
    expect(counts.linkedin).toBe(1);
    expect(counts.call).toBe(1);
    expect(counts.all).toBe(counts.email + counts.linkedin + counts.call);
    expect(actions.filter((action) => actionVisible(action, "call")).every((action) => action.kind === "call")).toBe(true);
  });

  it("hides a sent connection request and still shows the email", () => {
    const actions = expandShapeLead(lead({ linkedinRequestSent: true }), ["email", "linkedin"]);
    expect(actions.map((action) => action.kind)).toEqual(["send_email"]);
  });

  it("sorts a skipped row after the rows still open", () => {
    const actions = expandShapeLead(lead(), ["email", "linkedin"]);
    const ordered = orderActions(actions, [todayActionKey("travis", "linkedin_request")]);
    expect(ordered.map((action) => action.kind)).toEqual(["send_email", "linkedin_request"]);
  });
});

describe("Shape A outcomes and copy", () => {
  it("uses Done and Skip on cold rows, Needs follow-up on warmer rows, and leaves Interested on Call", () => {
    expect(actionOutcomeMode("send_email")).toBe("done_skip");
    expect(actionOutcomeMode("linkedin_request")).toBe("done_skip");
    expect(actionOutcomeMode("contact_form")).toBe("done_skip");
    expect(actionOutcomeMode("reply")).toBe("done_skip_followup");
    expect(actionOutcomeMode("follow_up")).toBe("done_skip_followup");
    expect(actionOutcomeMode("next_action")).toBe("done_followup");
    expect(actionOutcomeMode("call")).toBe("call");
    expect(SHAPE_A_DONE_SKIP_LABELS).toEqual(["Done", "Skip"]);
    expect(SHAPE_A_DONE_SKIP_LABELS).not.toContain("Interested");
    expect(actionShowsBlankMessage("linkedin_request")).toBe(true);
    expect(actionShowsBlankMessage("send_email")).toBe(false);
    expect(actionShowsBlankMessage("reply")).toBe(false);
  });

  it("formats the PKT clock and a name-plus-why strip", () => {
    expect(formatQueueClock(new Date("2026-10-01T12:00:00.000Z"), "Asia/Karachi")).toBe("5:00 PM PKT");
    expect(actionHeader("send_email", "HVAC", "5:00 PM PKT")).toBe("Emails · 5:00 PM PKT");
    expect(actionHeader("linkedin_request", "HVAC", "5:00 PM PKT")).toBe("LinkedIn · 5:00 PM PKT");
    expect(actionHeader("reply", "Capri", "5:00 PM PKT")).toBe("Reply · Capri");
    expect(shapeHeadline("Travis Crawford", "HVAC")).toBe("Travis Crawford · HVAC");
    expect(shapeIntel({
      contactRole: "Owner",
      city: "Austin",
      region: "TX",
      fitReasons: ["Reviews mention a CSR opening"],
      summary: "HVAC owners who need a CSR.",
    })).toBe("Owner · Austin, TX — Reviews mention a CSR opening");
  });

  it("hides Call for a rep whose Focus is pipeline-only and keeps one card per synced row", () => {
    const withPhone = lead({ phone: "512-555-0199" });
    const hidden = projectTodayActions({
      lead: withPhone,
      allowedChannels: ["call", "email", "linkedin"],
      hideCall: true,
    });
    expect(hidden.some((action) => action.kind === "call")).toBe(false);
    expect(hidden.map((action) => action.kind)).toEqual(["linkedin_request", "send_email"]);

    const pipeline: PipelineCardView = {
      rowId: "row-1",
      sheetRow: 2,
      timeLabel: "5:00 PM PKT",
      actionLabel: "Send email",
      kind: "send_email",
      channel: "email",
      linkKind: "mailto",
      linkUrl: null,
      mailtoTo: "ada@example.com",
      mailtoSubject: "Hello",
      message: "Hi Ada",
      blankMessage: false,
      connectNoNote: false,
      outcomeMode: "done_skip",
      intel: "Open in Titan and send it yourself.",
      company: "Analytical Engines",
    };
    const synced = projectTodayActions({
      pipeline,
      lead: withPhone,
      allowedChannels: ["call", "email"],
      hideCall: true,
    });
    expect(synced).toHaveLength(1);
    expect(synced[0]?.key).toBe("pipeline:row-1");
    expect(actionFromPipeline("travis", pipeline).kind).toBe("send_email");
    expect(actionVisible(synced[0]!, "email")).toBe(true);
    expect(actionVisible(synced[0]!, "call")).toBe(false);
  });
});
