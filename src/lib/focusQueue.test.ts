import { describe, expect, it } from "vitest";
import type { CampaignStrategy } from "@/server/strategy";
import { cadenceChannel, cardInRepQueue, focusWorkingChannel, leadHasPhone, matchesFocusFilter, tallyFocusChannels } from "@/lib/focusQueue";

const emailFirst: CampaignStrategy = {
  summary: "Email then call",
  icp: { buyer: "Owner", business: "Shops", location: "Austin", size: "small", triggers: [], disqualifiers: [] },
  channels: [
    { channel: "email", why: "writing" },
    { channel: "call", why: "voice" },
  ],
  cadence: [
    { day: 0, channel: "email", purpose: "intro", tip: "short" },
    { day: 2, channel: "call", purpose: "follow", tip: "short" },
  ],
  messages: {
    email: { first: "email", follow: "email follow" },
    call: { first: "call", follow: "call follow" },
    instagram: { first: "", follow: "" },
    linkedin: { first: "li", follow: "li follow" },
  },
  objections: [],
  lead_gen: { sources: [], search_queries: [], must_have: [], score_boost: [] },
  kill_rule: "pause",
  call_scripts: ["", ""],
  email_scripts: ["", ""],
};

function card(overrides?: { phone?: string | null; step?: number; emailCadence?: boolean }) {
  return {
    lead: {
      phone: overrides?.phone === undefined ? "512-555-0199" : overrides.phone,
      cadenceStep: overrides?.step ?? 0,
      nextChannelOverride: null,
    },
    campaign: { strategy: emailFirst },
  };
}

describe("phone-first Call queue", () => {
  it("treats a Day-0 email lead with a phone as a Call", () => {
    const lead = card();
    expect(cadenceChannel(lead)).toBe("email");
    expect(matchesFocusFilter(lead, "call")).toBe(true);
    expect(focusWorkingChannel(lead, "call")).toBe("call");
  });

  it("skips leads with no dialable phone", () => {
    expect(matchesFocusFilter(card({ phone: null }), "call")).toBe(false);
    expect(matchesFocusFilter(card({ phone: "   " }), "call")).toBe(false);
    expect(matchesFocusFilter(card({ phone: "n/a" }), "call")).toBe(false);
    expect(leadHasPhone("555-0100")).toBe(true);
    expect(leadHasPhone("(203) 668-8164")).toBe(true);
  });

  it("keeps Email on the cadence step and shows LinkedIn for the whole queue", () => {
    const lead = card();
    expect(matchesFocusFilter(lead, "email")).toBe(true);
    expect(matchesFocusFilter(lead, "linkedin")).toBe(true);
    expect(matchesFocusFilter(card({ phone: null }), "linkedin")).toBe(true);
    expect(focusWorkingChannel(lead, "email")).toBe("email");
    expect(focusWorkingChannel(lead, "linkedin")).toBe("linkedin");
    const onCallStep = card({ step: 1 });
    expect(cadenceChannel(onCallStep)).toBe("call");
    expect(matchesFocusFilter(onCallStep, "email")).toBe(false);
    expect(matchesFocusFilter(onCallStep, "linkedin")).toBe(true);
    expect(matchesFocusFilter(onCallStep, "call")).toBe(true);
  });

  it("still shows phone leads to a rep who works calls when cadence is email", () => {
    const lead = card();
    expect(cardInRepQueue(lead, ["call"])).toBe(true);
    expect(cardInRepQueue(lead, ["email"])).toBe(true);
    expect(cardInRepQueue(card({ phone: null }), ["call"])).toBe(false);
    expect(cardInRepQueue(card({ phone: null }), ["email"])).toBe(true);
  });

  it("counts phones under Call, cadence under Email, and every lead under LinkedIn", () => {
    expect(tallyFocusChannels([{ phone: "512-555-0199", cadence: "email" }])).toEqual({ call: 1, email: 1, linkedin: 1 });
    expect(tallyFocusChannels([{ phone: null, cadence: "email" }])).toEqual({ email: 1, linkedin: 1 });
    expect(tallyFocusChannels([{ phone: "(203) 668-8164", cadence: "call" }])).toEqual({ call: 1, linkedin: 1 });
    expect(tallyFocusChannels([{ phone: null, cadence: "email" }, { phone: null, cadence: "email" }]).linkedin).toBe(2);
  });

  it("hides out-of-hours calls only when that filter is on", () => {
    const lead = card();
    expect(matchesFocusFilter(lead, "call", { inBusinessHours: false })).toBe(false);
    expect(matchesFocusFilter(lead, "call", { inBusinessHours: true })).toBe(true);
    expect(matchesFocusFilter(lead, "email", { inBusinessHours: false })).toBe(true);
  });
});
