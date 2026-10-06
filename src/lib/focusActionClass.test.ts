import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Btn } from "@/components/ui";
import { OpenInTitan } from "@/components/OpenInTitan";
import { focusActionClass } from "@/lib/focusActionClass";
import { titanOpenState } from "@/lib/titanOpen";

function tokens(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function classOf(html: string, tag: "button" | "a"): string[] {
  const match = html.match(new RegExp(`<${tag}[^>]*class="([^"]+)"`));
  return tokens(match?.[1] ?? "");
}

describe("disabled focus controls", () => {
  it("gives Open in Titan the same muted class as Copy draft, with no primary fill or hover", () => {
    const titan = focusActionClass({ tone: "primary", disabled: true });
    const copy = focusActionClass({ tone: "quiet", disabled: true });
    const done = focusActionClass({ tone: "primary", disabled: true, size: "sm" });
    expect(titan).toBe(copy);
    for (const className of [titan, done]) {
      const names = tokens(className);
      expect(names).toContain("bg-panel");
      expect(names).toContain("text-muted");
      expect(names).toContain("opacity-40");
      expect(names).toContain("cursor-not-allowed");
      expect(names).not.toContain("bg-accent");
      expect(names.some((name) => name.startsWith("hover:"))).toBe(false);
    }
  });

  it("renders a blocked card's Titan, Copy, and Done without the green primary style", () => {
    const state = titanOpenState({
      show: true,
      href: "mailto:ada@example.com?subject=Hi",
      sendBlocked: true,
      reasons: ["Subject is missing.", "Needs one call to action."],
      hasDraft: true,
    });
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement("button", { type: "button", disabled: true, className: focusActionClass({ tone: "quiet", disabled: true }) }, "Copy draft"),
        createElement(OpenInTitan, { state }),
        createElement("button", { type: "button", disabled: true, className: focusActionClass({ tone: "primary", disabled: true, size: "sm" }) }, "Done"),
      ),
    );
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button).toContain("disabled");
      const names = classOf(button + "</button>", "button");
      expect(names).toContain("cursor-not-allowed");
      expect(names).toContain("bg-panel");
      expect(names).not.toContain("bg-accent");
      expect(names.some((name) => name.startsWith("hover:"))).toBe(false);
    }
    expect(html).toContain("Subject is missing.");
    expect(html).toContain("Needs one call to action.");
  });

  it("keeps an enabled Open in Titan on the primary style", () => {
    const state = titanOpenState({
      show: true,
      href: "mailto:ada@example.com",
      sendBlocked: false,
      reasons: [],
      hasDraft: true,
    });
    const html = renderToStaticMarkup(createElement(OpenInTitan, { state }));
    const names = classOf(html, "a");
    expect(names).toContain("bg-accent");
    expect(names).toContain("hover:bg-accent-hover");
    expect(html).not.toContain("disabled");
  });

  it("puts the disabled look after the primary variant so hover cannot win", () => {
    const html = renderToStaticMarkup(createElement(Btn, { variant: "primary", disabled: true }, "Save"));
    const names = classOf(html, "button");
    const hover = names.indexOf("hover:bg-accent-hover");
    const disabledHover = names.indexOf("disabled:hover:bg-panel");
    expect(hover).toBeGreaterThan(-1);
    expect(disabledHover).toBeGreaterThan(hover);
    expect(names).toContain("disabled:cursor-not-allowed");
    expect(names).toContain("disabled:bg-panel");
    expect(names).toContain("disabled:opacity-40");
    expect(html).toContain("disabled");
  });
});
