import { describe, expect, it } from "vitest";
import { formatKbWhen, kbKindLabel, kbReaderView, knowledgePayloadOnSave } from "@/lib/outreachKb";

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

describe("kbReaderView", () => {
  it("sends only the display fields and the plain claim values", () => {
    const updatedAt = new Date("2026-10-05T12:00:00Z");
    const view = kbReaderView({
      title: "One-liner",
      body: "ReceptAI is your after-hours ops layer.",
      status: "approved",
      kind: "product_truth",
      updatedAt,
      updatedByName: "Muqeet",
      payload: { claim: "yes", safeToQuote: false, doNotQuote: true, locked: true, tasks: ["write_outreach"], secret: "hidden" },
    });
    expect(view).toEqual({
      title: "One-liner",
      body: "ReceptAI is your after-hours ops layer.",
      status: "Approved",
      type: "Product truth",
      lastEdited: `${formatKbWhen(updatedAt)} by Muqeet`,
      claim: "yes",
      safeToQuote: false,
      doNotQuote: true,
    });
    const packed = JSON.stringify(view);
    expect(packed).not.toContain("write_outreach");
    expect(packed).not.toContain("hidden");
    expect(packed).not.toContain("locked");
    expect(Object.keys(view).sort()).toEqual(["body", "claim", "doNotQuote", "lastEdited", "safeToQuote", "status", "title", "type"]);
  });
});

describe("kbKindLabel", () => {
  it("uses a plain name for a kind", () => {
    expect(kbKindLabel("product_truth")).toBe("Product truth");
    expect(kbKindLabel("banned_phrase")).toBe("Phrase to avoid");
  });
});
