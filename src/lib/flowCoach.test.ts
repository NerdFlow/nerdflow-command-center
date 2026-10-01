import { describe, expect, it } from "vitest";
import { coachPrompt, coachReplyDraft, matchCoachCandidates, noteSignalsInterest } from "@/lib/flowCoach";

const tonys = [
  { id: "nf-041", contactName: "Tony Russo", businessName: "Capri", channel: "linkedin" as const },
  { id: "nf-028", contactName: "Tony Chen", businessName: "HostBNB", channel: "email" as const },
];

describe("Flow coach match", () => {
  it("asks which Tony when two people share the name", () => {
    const matches = matchCoachCandidates("Tony messaged me on LinkedIn — interested in a demo next week.", tonys);
    expect(matches.map((match) => match.businessName)).toEqual(["Capri", "HostBNB"]);
    expect(coachPrompt(matches).title).toBe("Which Tony?");
    expect(coachPrompt(matches).body).toBe("Confirm before I log this to Pipeline.");
    expect(noteSignalsInterest("Tony messaged me on LinkedIn — interested in a demo next week.")).toBe(true);
  });

  it("puts the company named in the note first and still offers the other Tony", () => {
    const matches = matchCoachCandidates("Tony at Capri wants a demo.", tonys);
    expect(matches[0]?.businessName).toBe("Capri");
    expect(matches).toHaveLength(2);
  });

  it("logs nothing when nobody matches", () => {
    const matches = matchCoachCandidates("Someone random emailed.", tonys);
    expect(matches).toEqual([]);
    expect(coachPrompt(matches).title).toBe("No match");
  });

  it("fills a reply draft from stored text and does not invent a result", () => {
    expect(coachReplyDraft({ stored: "Hi {name}, here is the note we already wrote.", contactName: "London", businessName: "Capri" })).toBe(
      "Hi {name}, here is the note we already wrote.",
    );
    const fallback = coachReplyDraft({ stored: "", contactName: "London", businessName: "Capri" });
    expect(fallback).toContain("London");
    expect(fallback).toContain("Capri");
    expect(fallback).not.toMatch(/\d+%|\$\d|customers saved/i);
  });
});
