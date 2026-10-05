import { describe, expect, it } from "vitest";
import { draftGenerationDecision } from "@/lib/outreachDraftRules";

const base = {
  mode: "generate" as const,
  hasDraft: false,
  regenerateCount: 0,
  killSwitch: false,
  usedToday: 0,
  dailyCap: 60,
  dnc: false,
};

describe("draft generation rules", () => {
  it("reuses a saved draft instead of calling the model again", () => {
    expect(draftGenerationDecision({ ...base, hasDraft: true })).toEqual({ ok: true, reuse: true });
  });

  it("stops on the kill switch, the daily cap, do-not-contact, and the third regeneration", () => {
    expect(draftGenerationDecision({ ...base, killSwitch: true }).ok).toBe(false);
    expect(draftGenerationDecision({ ...base, usedToday: 60 }).ok).toBe(false);
    expect(draftGenerationDecision({ ...base, dnc: true }).ok).toBe(false);
    const capped = draftGenerationDecision({ ...base, mode: "regenerate", hasDraft: true, regenerateCount: 3 });
    expect(capped.ok).toBe(false);
    if (!capped.ok) expect(capped.reason).toBe("This card has used its 3 regenerations.");
  });
});
