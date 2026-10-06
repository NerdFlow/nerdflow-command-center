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

  it("resolves a disabled primary button to the muted panel style, including while hovered", () => {
    const html = renderToStaticMarkup(createElement(Btn, { variant: "primary", disabled: true }, "Save"));
    expect(html).toContain("disabled");
    const rendered = classOf(html, "button").join(" ");
    const hovered = computedUtilities(rendered, { disabled: true, hover: true });
    expect(hovered.background).toBe("panel");
    expect(hovered.cursor).toBe("not-allowed");
    expect(hovered.opacity).toBe("40");
    const resting = computedUtilities(rendered, { disabled: true, hover: false });
    expect(resting.background).toBe("panel");
    expect(resting.cursor).toBe("not-allowed");
    expect(resting.opacity).toBe("40");

    const reversed = rendered.split(/\s+/).reverse().join(" ");
    expect(computedUtilities(reversed, { disabled: true, hover: true }).background).toBe("panel");

    const variant = focusActionClass({ tone: "primary", disabled: true });
    expect(computedUtilities(variant, { disabled: true, hover: true })).toMatchObject({
      background: "panel",
      cursor: "not-allowed",
      opacity: "40",
    });

    const enabled = renderToStaticMarkup(createElement(Btn, { variant: "primary" }, "Save"));
    expect(computedUtilities(classOf(enabled, "button").join(" "), { hover: true }).background).toBe("accent-hover");
  });
});

const PSEUDO = new Set(["hover", "disabled", "focus", "active", "focus-visible", "focus-within"]);

/** Picks the winning utility by variant specificity. Class-string order is not the cascade. */
function computedUtilities(className: string, state: { disabled?: boolean; hover?: boolean; active?: boolean; focus?: boolean }) {
  const winners = new Map<string, { value: string; score: number; ambiguous: boolean }>();
  for (const token of className.split(/\s+/).filter(Boolean)) {
    const parts = token.split(":");
    const variants: string[] = [];
    let index = 0;
    while (index < parts.length - 1 && PSEUDO.has(parts[index] ?? "")) {
      variants.push(parts[index] ?? "");
      index += 1;
    }
    const active = variants.every((variant) => Boolean(state[variant as keyof typeof state]));
    if (!active) continue;
    const utility = parts.slice(index).join(":");
    const parsed = utility.startsWith("bg-")
      ? { prop: "background", value: utility.slice(3) }
      : utility.startsWith("cursor-")
        ? { prop: "cursor", value: utility.slice("cursor-".length) }
        : utility.startsWith("opacity-")
          ? { prop: "opacity", value: utility.slice("opacity-".length) }
          : null;
    if (!parsed) continue;
    const score = variants.length;
    const current = winners.get(parsed.prop);
    if (!current || score > current.score) {
      winners.set(parsed.prop, { value: parsed.value, score, ambiguous: false });
      continue;
    }
    if (score === current.score && current.value !== parsed.value) {
      current.ambiguous = true;
    }
  }
  const background = winners.get("background");
  const cursor = winners.get("cursor");
  const opacity = winners.get("opacity");
  if (background?.ambiguous || cursor?.ambiguous || opacity?.ambiguous) {
    throw new Error("Equal specificity; class order must not decide the computed style");
  }
  return {
    background: background?.value,
    cursor: cursor?.value,
    opacity: opacity?.value,
  };
}
