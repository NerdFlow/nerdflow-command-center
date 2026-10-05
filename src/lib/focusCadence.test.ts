import { describe, expect, it } from "vitest";
import { pktDateStamp } from "@/lib/pipelineToday";
import {
  DEFAULT_FOCUS_CADENCE,
  parseFocusCadence,
  placeRoutedChannel,
  pktDayStart,
  queueLeadBlockedByPipeline,
  walkCadence,
  type CadenceContact,
} from "@/lib/focusCadence";

const muqeet = ["email", "linkedin"] as const;
const anchor = "2026-10-01";

function contact(overrides: Partial<CadenceContact> = {}): CadenceContact {
  return {
    email: "lee@example.com",
    emailInvalid: false,
    linkedinUrl: "https://www.linkedin.com/in/lee",
    phone: "512-555-0100",
    ...overrides,
  };
}

describe("team focus cadence", () => {
  it("defaults to email, LinkedIn, email, email", () => {
    expect(parseFocusCadence(undefined)).toEqual(DEFAULT_FOCUS_CADENCE);
    expect(parseFocusCadence([{ day: 10, channel: "email" }, { day: 0, channel: "call" }])).toEqual([
      { day: 0, channel: "call" },
      { day: 10, channel: "email" },
    ]);
    expect(parseFocusCadence([{ day: -1, channel: "email" }])).toEqual(DEFAULT_FOCUS_CADENCE);
  });

  it("keeps LinkedIn hidden on day 0 and shows it on day 2 in Asia/Karachi", () => {
    const hidden = walkCadence({
      cadence: DEFAULT_FOCUS_CADENCE,
      startIndex: 1,
      anchor,
      today: anchor,
      contact: contact(),
      ownerChannels: muqeet,
    });
    expect(hidden).toEqual({ state: "waiting", stepIndex: 1, channel: "linkedin", dueOn: "2026-10-03" });

    const dayOne = walkCadence({
      cadence: DEFAULT_FOCUS_CADENCE,
      startIndex: 1,
      anchor,
      today: "2026-10-02",
      contact: contact(),
      ownerChannels: muqeet,
    });
    expect(dayOne.state).toBe("waiting");

    const due = walkCadence({
      cadence: DEFAULT_FOCUS_CADENCE,
      startIndex: 1,
      anchor,
      today: "2026-10-03",
      contact: contact(),
      ownerChannels: muqeet,
    });
    expect(due).toEqual({ state: "due", stepIndex: 1, channel: "linkedin", dueOn: "2026-10-03" });

    const start = pktDayStart("2026-10-03");
    expect(pktDateStamp(start)).toBe("2026-10-03");
    expect(pktDateStamp(new Date(start.getTime() - 60_000))).toBe("2026-10-02");
  });

  it("jumps LinkedIn when the lead has no profile and shows the next email on day 4", () => {
    const onDayTwo = walkCadence({
      cadence: DEFAULT_FOCUS_CADENCE,
      startIndex: 1,
      anchor,
      today: "2026-10-03",
      contact: contact({ linkedinUrl: null }),
      ownerChannels: muqeet,
    });
    expect(onDayTwo).toEqual({ state: "waiting", stepIndex: 2, channel: "email", dueOn: "2026-10-05" });

    const onDayFour = walkCadence({
      cadence: DEFAULT_FOCUS_CADENCE,
      startIndex: 1,
      anchor,
      today: "2026-10-05",
      contact: contact({ linkedinUrl: null }),
      ownerChannels: muqeet,
    });
    expect(onDayFour).toEqual({ state: "due", stepIndex: 2, channel: "email", dueOn: "2026-10-05" });
  });

  it("jumps a channel this owner does not work, including a call they cannot make", () => {
    const noLinkedIn = walkCadence({
      cadence: DEFAULT_FOCUS_CADENCE,
      startIndex: 1,
      anchor,
      today: "2026-10-03",
      contact: contact(),
      ownerChannels: ["email"],
    });
    expect(noLinkedIn.state).toBe("waiting");
    if (noLinkedIn.state === "finished") throw new Error("expected the day-4 email");
    expect(noLinkedIn.channel).toBe("email");
    expect(noLinkedIn.dueOn).toBe("2026-10-05");

    const withCall = [
      { day: 0, channel: "email" as const },
      { day: 1, channel: "call" as const },
      { day: 4, channel: "email" as const },
    ];
    const caller = walkCadence({
      cadence: withCall,
      startIndex: 1,
      anchor,
      today: "2026-10-02",
      contact: contact(),
      ownerChannels: ["email", "call"],
    });
    expect(caller).toEqual({ state: "due", stepIndex: 1, channel: "call", dueOn: "2026-10-02" });

    const noPhone = walkCadence({
      cadence: withCall,
      startIndex: 1,
      anchor,
      today: "2026-10-02",
      contact: contact({ phone: null }),
      ownerChannels: ["email", "call"],
    });
    expect(noPhone).toEqual({ state: "waiting", stepIndex: 2, channel: "email", dueOn: "2026-10-05" });
  });

  it("does not schedule a second LinkedIn card when a skip already opened that channel", () => {
    const placed = placeRoutedChannel({
      cadence: DEFAULT_FOCUS_CADENCE,
      stepIndex: 0,
      routedChannel: "linkedin",
      anchor,
      today: anchor,
      contact: contact(),
      ownerChannels: muqeet,
    });
    expect(placed).toEqual({ stepIndex: 1, dueOn: null, matchedCadenceStep: true });
    expect(queueLeadBlockedByPipeline("lead-1", new Set(["lead-1"]))).toBe(true);
    expect(queueLeadBlockedByPipeline("lead-2", new Set(["lead-1"]))).toBe(false);
  });

  it("leaves the next email on its own day when a bad contact opens a call instead", () => {
    const placed = placeRoutedChannel({
      cadence: DEFAULT_FOCUS_CADENCE,
      stepIndex: 0,
      routedChannel: "call",
      anchor,
      today: anchor,
      contact: contact({ linkedinUrl: null }),
      ownerChannels: ["email", "call"],
    });
    expect(placed.matchedCadenceStep).toBe(false);
    expect(placed).toEqual({ stepIndex: 2, dueOn: "2026-10-05", matchedCadenceStep: false });
  });

  it("stops when every remaining step is an invalid email", () => {
    const done = walkCadence({
      cadence: DEFAULT_FOCUS_CADENCE,
      startIndex: 2,
      anchor,
      today: "2026-10-20",
      contact: contact({ emailInvalid: true, linkedinUrl: null }),
      ownerChannels: muqeet,
    });
    expect(done).toEqual({ state: "finished" });
  });
});
