import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FALLBACK_DRAFT_NOTICE, OutreachDraftPanel } from "@/components/OutreachDraftPanel";

const review = { ok: true, blocks: [], warnings: [] };

function panel(source: string | null) {
  return renderToStaticMarkup(
    createElement(OutreachDraftPanel, {
      channel: "email",
      subject: "Hello",
      body: "A note",
      openerSourceUrl: "",
      review,
      saved: true,
      regenerateCount: 0,
      source,
      killSwitch: false,
      capReached: false,
      busy: false,
      onSubject: () => undefined,
      onBody: () => undefined,
      onOpener: () => undefined,
      onGenerate: () => undefined,
      onRegenerate: () => undefined,
    }),
  );
}

describe("fallback draft notice", () => {
  it("says a fallback template does not count toward the daily cap", () => {
    const html = panel("fallback");
    expect(html).toContain(FALLBACK_DRAFT_NOTICE);
    expect(html).toContain("does not count toward today's cap");
  });

  it("stays quiet when the model returned the draft", () => {
    expect(panel("generate")).not.toContain("Fallback draft");
  });
});
