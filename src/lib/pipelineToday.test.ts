import { describe, expect, it } from "vitest";
import {
  TITAN_FROM,
  formatPktChip,
  mapPipelineGrid,
  outcomeLabels,
  parseMailtoTarget,
  parseTable,
  pipelineCardStaysVisible,
  pipelineMailtoHref,
  pipelinePersonKey,
  pipelineTimeChip,
} from "@/lib/pipelineToday";

const mailtoFormula =
  '=HYPERLINK("mailto:ada@example.com?subject=Quick%20note&body=Hi%20Ada%0ASecond%20line","Open in Titan → ada@example.com")';

describe("Today tab mapping", () => {
  it("turns each open row into one card and parses the Titan mailto formula", () => {
    const grid = [
      ["Time", "Name", "Company", "Action", "Link", "Message", "Done"],
      ["5:00 PM", "Ada Lovelace", "Analytical Engines", "Send email", mailtoFormula, "Hi Ada\nSecond line", "FALSE"],
      ["5:05 PM", "Ada Lovelace", "Analytical Engines", "LinkedIn request", "https://www.linkedin.com/in/ada", "Ignore this connection note", "FALSE"],
      ["—", "Grace Hopper", "Navy", "Reply to them", "https://www.linkedin.com/in/grace", "Thanks for connecting", "FALSE"],
      ["6:00 PM", "Form Co", "Form Co", "Send email", "https://form.example/contact", "Please reach the owner", "FALSE"],
      ["6:10 PM", "Follow Up", "Follow Co", "Follow-up", "https://www.linkedin.com/in/follow", "", "FALSE"],
      ["6:20 PM", "Live", "ReceptAI", "Get ReceptAI live", "https://example.com/ignore", "Ship it", "FALSE"],
      ["6:30 PM", "Caller", "Call Co", "Call", "tel:+1-555-0100", "Do not import", "FALSE"],
      ["6:40 PM", "Done Person", "Done Co", "Send email", mailtoFormula, "Already sent", "TRUE"],
    ];
    const result = mapPipelineGrid(grid);
    expect(result.filteredCalls).toBe(0);
    expect(result.rows).toHaveLength(8);
    expect(result.rows.map((row) => row.kind)).toEqual([
      "send_email",
      "linkedin_request",
      "reply",
      "contact_form",
      "follow_up",
      "next_action",
      "call",
      "send_email",
    ]);
    expect(result.rows[6]?.channel).toBe("call");
    expect(result.rows[6]?.phone).toBe("+1-555-0100");
    expect(result.rows[6]?.message).toBe("");
    expect(result.rows[6]?.sheetDone).toBe(false);
    expect(result.rows[7]?.sheetDone).toBe(true);
    expect(result.rows.slice(0, 7).every((row) => row.sheetDone === false)).toBe(true);
    expect(new Set(result.rows.map((row) => row.sheetRow)).size).toBe(8);
    expect(result.rows[0]?.sheetRow).toBe(2);

    const email = result.rows[0]!;
    expect(email.linkKind).toBe("mailto");
    expect(email.mailtoTo).toBe("ada@example.com");
    expect(email.mailtoSubject).toBe("Quick note");
    expect(email.message).toBe("Hi Ada\nSecond line");
    expect(email.timeLabel).toBe("5:00 PM PKT");
    expect(pipelineTimeChip(email.kind, email.timeLabel, email.actionLabel)).toBe("Emails · 5:00 PM PKT");
    expect(email.outcomeMode).toBe("done_skip");
    expect(outcomeLabels(email.outcomeMode)).toEqual(["Done", "Skip"]);
    const href = pipelineMailtoHref(email);
    expect(href?.startsWith("mailto:ada@example.com?")).toBe(true);
    expect(href).not.toContain(TITAN_FROM);
    expect(href).not.toContain("Open%20in%20Titan");

    const linkedin = result.rows[1]!;
    expect(linkedin.linkKind).toBe("linkedin_profile");
    expect(linkedin.linkUrl).toBe("https://www.linkedin.com/in/ada");
    expect(linkedin.message).toBe("");
    expect(linkedin.blankMessage).toBe(true);
    expect(linkedin.connectNoNote).toBe(true);
    expect(pipelinePersonKey(linkedin.company, linkedin.contactName)).toBe(pipelinePersonKey(email.company, email.contactName));

    const reply = result.rows[2]!;
    expect(reply.connectNoNote).toBe(false);
    expect(reply.message).toBe("Thanks for connecting");
    expect(reply.linkKind).toBe("linkedin_profile");
    expect(reply.outcomeMode).toBe("done_skip_followup");
    expect(reply.timeLabel).toBe("—");
    expect(pipelineTimeChip("reply", reply.timeLabel, reply.actionLabel)).toBe("Reply · —");

    const form = result.rows[3]!;
    expect(form.kind).toBe("contact_form");
    expect(form.linkKind).toBe("contact_form");
    expect(form.linkUrl).toBe("https://form.example/contact");
    expect(form.message).toBe("Please reach the owner");

    const follow = result.rows[4]!;
    expect(follow.kind).toBe("follow_up");
    expect(follow.linkKind).toBe("linkedin_profile");
    expect(follow.message).toBe("");
    expect(follow.blankMessage).toBe(false);
    expect(follow.outcomeMode).toBe("done_skip_followup");

    const next = result.rows[5]!;
    expect(next.kind).toBe("next_action");
    expect(next.linkKind).toBe("none");
    expect(next.linkUrl).toBeNull();
    expect(next.outcomeMode).toBe("done_followup");
    expect(outcomeLabels(next.outcomeMode)).toEqual(["Done", "Needs follow-up"]);
    expect(outcomeLabels(next.outcomeMode)).not.toContain("Skip");

    const done = mapPipelineGrid([
      ["6:40 PM", "Done Person", "Done Co", "Send email", mailtoFormula, "Already sent", "TRUE"],
    ]).rows[0];
    expect(done?.sheetDone).toBe(true);
    expect(done?.sheetRow).toBe(1);
  });

  it("does not treat the Open in Titan label as the link, and keeps a display-only address", () => {
    const parsed = parseMailtoTarget(mailtoFormula);
    expect(parsed?.to).toBe("ada@example.com");
    expect(parsed?.subject).toBe("Quick note");
    expect(parsed?.body).toContain("Hi Ada");
    expect(parseMailtoTarget("Open in Titan → ada@example.com")).toEqual({
      to: "ada@example.com",
      subject: "",
      body: "",
    });
    expect(formatPktChip("5:00 PM PKT")).toBe("5:00 PM PKT");
    expect(formatPktChip("—")).toBe("—");
  });

  it("parses a quoted paste of the Today columns", () => {
    const text = [
      "Time,Name,Company,Action,Link,Message,Done",
      '5:00 PM,Ada Lovelace,Analytical Engines,Send email,"=HYPERLINK(""mailto:ada@example.com?subject=Hi&body=Hello"",""Open in Titan → ada@example.com"")","Hi, Ada",FALSE',
    ].join("\n");
    const grid = parseTable(text);
    const result = mapPipelineGrid(grid);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.mailtoTo).toBe("ada@example.com");
    expect(result.rows[0]?.message).toBe("Hi, Ada");
  });
});

describe("pipeline card carry-over", () => {
  const today = "2026-10-03";

  it("keeps an untouched open card on a later day", () => {
    expect(pipelineCardStaysVisible("open", "2026-10-02", today)).toBe(true);
    expect(pipelineCardStaysVisible("open", today, today)).toBe(true);
  });

  it("leaves done and skipped cards hidden, including ones from earlier days", () => {
    expect(pipelineCardStaysVisible("done", "2026-10-02", today)).toBe(false);
    expect(pipelineCardStaysVisible("skipped", "2026-10-02", today)).toBe(false);
    expect(pipelineCardStaysVisible("done", today, today)).toBe(false);
    expect(pipelineCardStaysVisible("skipped", today, today)).toBe(false);
    expect(pipelineCardStaysVisible("follow_up", "2026-10-02", today)).toBe(false);
    expect(pipelineCardStaysVisible("dropped", "2026-10-02", today)).toBe(false);
    expect(pipelineCardStaysVisible("open", "2026-10-04", today)).toBe(false);
  });
});

