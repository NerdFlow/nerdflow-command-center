import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeEditorRow } from "@/components/KnowledgeEditor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));

vi.mock("@/components/Toast", () => ({
  useToast: () => () => undefined,
}));

vi.mock("@/server/actions/outreachKb", () => ({
  archiveOutreachKbEntry: vi.fn(),
  createOutreachKbEntry: vi.fn(),
  updateOutreachKbEntry: vi.fn(),
}));

const { KnowledgeEditor } = await import("@/components/KnowledgeEditor");

const row: KnowledgeEditorRow = {
  id: "row-1",
  key: "product_truth:what-we-sell",
  layer: "core",
  kind: "product_truth",
  icp: null,
  scope: "universal",
  status: "approved",
  title: "What we sell",
  body: "We sell websites.",
  payload: {},
  locked: false,
  sourcePath: null,
  updatedLabel: null,
  updatedByName: null,
  version: 1,
};

function buttons(html: string) {
  const found: { label: string; disabled: boolean; className: string }[] = [];
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = match[1] ?? "";
    const label = (match[2] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (label !== "Save" && label !== "Archive" && label !== "Add row") continue;
    found.push({
      label,
      disabled: /\sdisabled(?:=|>|\s)/.test(`${attrs}>`),
      className: attrs.match(/class="([^"]*)"/)?.[1] ?? "",
    });
  }
  return found;
}

const PSEUDO = new Set(["hover", "disabled", "focus", "active", "focus-visible", "focus-within"]);
const COLORS = new Set(["on-accent", "stop", "muted", "ink", "accent", "go", "dim", "warm", "cold"]);

function computed(className: string, state: { disabled?: boolean; hover?: boolean }) {
  const winners = new Map<string, { value: string; score: number; ambiguous: boolean }>();
  for (const token of className.split(/\s+/).filter(Boolean)) {
    const parts = token.split(":");
    const variants: string[] = [];
    let index = 0;
    while (index < parts.length - 1 && PSEUDO.has(parts[index] ?? "")) {
      variants.push(parts[index] ?? "");
      index += 1;
    }
    if (!variants.every((variant) => Boolean(state[variant as keyof typeof state]))) continue;
    const utility = parts.slice(index).join(":");
    const color = utility.startsWith("text-") ? utility.slice("text-".length) : "";
    const parsed = utility.startsWith("bg-")
      ? { prop: "background", value: utility.slice(3) }
      : utility.startsWith("cursor-")
        ? { prop: "cursor", value: utility.slice("cursor-".length) }
        : utility.startsWith("opacity-")
          ? { prop: "opacity", value: utility.slice("opacity-".length) }
          : COLORS.has(color)
            ? { prop: "color", value: color }
            : null;
    if (!parsed) continue;
    const score = variants.length;
    const current = winners.get(parsed.prop);
    if (!current || score > current.score) {
      winners.set(parsed.prop, { value: parsed.value, score, ambiguous: false });
    } else if (score === current.score && current.value !== parsed.value) {
      current.ambiguous = true;
    }
  }
  for (const winner of winners.values()) {
    if (winner.ambiguous) throw new Error("Equal specificity; class order must not decide the computed style");
  }
  return {
    background: winners.get("background")?.value,
    cursor: winners.get("cursor")?.value,
    opacity: winners.get("opacity")?.value,
    color: winners.get("color")?.value,
  };
}

describe("knowledge Save and Archive", () => {
  it("keeps an editable row's Save primary and Archive on the stop style", () => {
    const html = renderToStaticMarkup(createElement(KnowledgeEditor, { row, canEdit: true }));
    const actions = buttons(html);
    const save = actions.find((button) => button.label === "Save");
    const archive = actions.find((button) => button.label === "Archive");
    expect(save?.disabled).toBe(false);
    expect(archive?.disabled).toBe(false);
    expect(computed(save?.className ?? "", { hover: true })).toMatchObject({
      background: "accent-hover",
      color: "on-accent",
    });
    expect(computed(save?.className ?? "", { hover: false }).background).toBe("accent");
    expect(computed(archive?.className ?? "", { hover: true })).toMatchObject({
      background: "panel",
      color: "stop",
    });
    expect(computed(archive?.className ?? "", {}).opacity).toBeUndefined();
    expect(computed(archive?.className ?? "", {}).cursor).toBeUndefined();
  });

  it("mutes Save and Archive when locked product truth still needs confirmation", () => {
    const html = renderToStaticMarkup(createElement(KnowledgeEditor, { row: { ...row, locked: true }, canEdit: true }));
    const actions = buttons(html);
    expect(actions.map((button) => button.label)).toEqual(["Save", "Archive"]);
    for (const button of actions) {
      expect(button.disabled).toBe(true);
      expect(computed(button.className, { disabled: true, hover: true })).toMatchObject({
        background: "panel",
        color: "muted",
        cursor: "not-allowed",
        opacity: "40",
      });
      expect(computed(button.className, { disabled: true, hover: true }).background).not.toBe("accent");
      expect(computed(button.className, { disabled: true, hover: true }).background).not.toBe("accent-hover");
    }
    expect(html).toContain("Tick the box before you save.");
  });
});
