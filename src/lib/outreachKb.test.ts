import { describe, expect, it } from "vitest";
import { kbKindLabel, knowledgePayloadOnSave } from "@/lib/outreachKb";

describe("knowledgePayloadOnSave", () => {
  const original = { claim: "yes", locked: true, tasks: ["write_outreach"], safeToQuote: false };

  it("keeps the payload when only the title would change", () => {
    const saved = knowledgePayloadOnSave(original, { claim: "yes", safeToQuote: false }, null);
    expect(saved).toEqual({ ok: true, payload: original });
  });

  it("updates a plain claim without dropping the other fields", () => {
    const saved = knowledgePayloadOnSave(original, { claim: "roadmap", safeToQuote: false }, null);
    expect(saved).toEqual({
      ok: true,
      payload: { claim: "roadmap", locked: true, tasks: ["write_outreach"], safeToQuote: false },
    });
  });

  it("uses the technical JSON only after that section is edited", () => {
    const saved = knowledgePayloadOnSave(original, { claim: "yes" }, JSON.stringify({ note: "custom" }));
    expect(saved).toEqual({ ok: true, payload: { note: "custom" } });
  });

  it("rejects technical fields that are not an object", () => {
    expect(knowledgePayloadOnSave(original, {}, "not json").ok).toBe(false);
    expect(knowledgePayloadOnSave(original, {}, "[]").ok).toBe(false);
  });
});

describe("kbKindLabel", () => {
  it("uses a plain name for a kind", () => {
    expect(kbKindLabel("product_truth")).toBe("Product truth");
    expect(kbKindLabel("banned_phrase")).toBe("Phrase to avoid");
  });
});
