import { describe, expect, it } from "vitest";
import {
  leadStatusForConfirmedReply,
  outreachBlockReason,
  outreachStopped,
  withStopOutreach,
} from "@/lib/replyLog";

describe("logged reply outcomes", () => {
  it("maps each confirmed label onto the lead status", () => {
    expect(leadStatusForConfirmedReply("interested", false)).toBe("deal");
    expect(leadStatusForConfirmedReply("interested", true)).toBe("deal");
    expect(leadStatusForConfirmedReply("not_now", false)).toBe("finished");
    expect(leadStatusForConfirmedReply("unsubscribe", false)).toBe("do_not_contact");
    expect(leadStatusForConfirmedReply("question", false)).toBe("replied");
    expect(leadStatusForConfirmedReply("objection", false)).toBe("replied");
    expect(leadStatusForConfirmedReply("out_of_office", false)).toBe("replied");
    expect(leadStatusForConfirmedReply("wrong_person", false)).toBe("replied");
  });

  it("blocks a new outreach card after a logged reply", () => {
    expect(outreachBlockReason({ status: "in_cadence" })).toBeNull();
    expect(outreachBlockReason({ status: "queued" })).toBeNull();
    expect(outreachBlockReason({ status: "replied" })).toBe("replied");
    expect(outreachBlockReason({ status: "finished" })).toBeNull();
    expect(outreachBlockReason({ status: "deal" })).toBe("deal");
    expect(outreachBlockReason({ status: "do_not_contact" })).toBe("do_not_contact");
    expect(outreachBlockReason({ status: "not_fit" })).toBe("not_a_fit");
    expect(outreachBlockReason({ status: "finished", signals: { stopOutreach: true } })).toBe("finished");
    expect(outreachBlockReason({ status: "in_cadence", signals: { stopOutreach: true } })).toBe("replied");
    expect(outreachBlockReason({ status: "in_cadence", signals: { stopOutreach: true, stopOutreachReason: "already_in_touch" } })).toBe(
      "already_in_touch",
    );
    expect(outreachStopped(withStopOutreach({ pipelineToday: true }))).toBe(true);
  });
});
