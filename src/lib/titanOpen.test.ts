import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpenInTitan } from "@/components/OpenInTitan";
import { TITAN_NO_DRAFT_HINT, titanOpenState } from "@/lib/titanOpen";

const REASONS = ["Subject is missing.", "Needs one call to action."];

describe("Open in Titan", () => {
  it("stays visible and enabled when the lead has an email and the draft can be sent", () => {
    const state = titanOpenState({
      show: true,
      href: "mailto:ada@example.com?subject=Hi",
      sendBlocked: false,
      reasons: [],
      hasDraft: true,
    });
    expect(state).toEqual({
      visible: true,
      enabled: true,
      href: "mailto:ada@example.com?subject=Hi",
      reasons: [],
      hint: null,
    });
    const html = renderToStaticMarkup(createElement(OpenInTitan, { state }));
    expect(html).toContain("Open in Titan");
    expect(html).toContain('href="mailto:ada@example.com?subject=Hi"');
    expect(html).not.toContain("disabled");
  });

  it("stays visible and disabled with the checklist reasons", () => {
    const state = titanOpenState({
      show: true,
      href: "mailto:ada@example.com?subject=Hi",
      sendBlocked: true,
      reasons: REASONS,
      hasDraft: true,
    });
    expect(state.visible).toBe(true);
    expect(state.enabled).toBe(false);
    expect(state.href).toBeNull();
    expect(state.reasons).toEqual(REASONS);
    expect(state.hint).toBeNull();
    const html = renderToStaticMarkup(createElement(OpenInTitan, { state }));
    expect(html).toContain("Open in Titan");
    expect(html).toContain("disabled");
    expect(html).not.toContain("mailto:");
    for (const reason of REASONS) expect(html).toContain(reason);
  });

  it("stays visible with a hint when there is no draft yet", () => {
    const state = titanOpenState({
      show: true,
      href: null,
      sendBlocked: false,
      reasons: [],
      hasDraft: false,
    });
    expect(state.visible).toBe(true);
    expect(state.enabled).toBe(false);
    expect(state.href).toBeNull();
    expect(state.hint).toBe(TITAN_NO_DRAFT_HINT);
    const html = renderToStaticMarkup(createElement(OpenInTitan, { state }));
    expect(html).toContain("Open in Titan");
    expect(html).toContain("disabled");
    expect(html).toContain(TITAN_NO_DRAFT_HINT);
    expect(html).not.toContain("mailto:");
  });

  it("hides the control when the card has no email address", () => {
    const state = titanOpenState({
      show: false,
      href: null,
      sendBlocked: true,
      reasons: REASONS,
      hasDraft: false,
    });
    expect(state.visible).toBe(false);
    expect(renderToStaticMarkup(createElement(OpenInTitan, { state }))).toBe("");
  });
});
