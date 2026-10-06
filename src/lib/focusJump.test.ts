import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FocusQueueMenu } from "@/components/FocusQueueMenu";
import { commitQueueJump, DISCARD_DRAFT_EDITS, draftIsDirty, mayLeaveCardForJump, promoteQueueItem } from "@/lib/focusJump";

const queue = [
  { key: "ada", label: "Analytical Engines" },
  { key: "grace", label: "Hopper Heating" },
  { key: "ada-2", label: "Lovelace Roofing" },
];

describe("focus queue jump", () => {
  it("opens a later card without dropping or reordering the others", () => {
    const next = promoteQueueItem(queue, "ada-2", (item) => item.key);
    expect(next.map((item) => item.key)).toEqual(["ada-2", "ada", "grace"]);
    expect(queue.map((item) => item.key)).toEqual(["ada", "grace", "ada-2"]);
  });

  it("leaves the queue alone when the chosen card is already first or missing", () => {
    expect(promoteQueueItem(queue, "ada", (item) => item.key).map((item) => item.key)).toEqual(["ada", "grace", "ada-2"]);
    expect(promoteQueueItem(queue, "missing", (item) => item.key).map((item) => item.key)).toEqual(["ada", "grace", "ada-2"]);
    expect(promoteQueueItem(queue, null, (item) => item.key)).toEqual(queue);
  });

  it("lists the current filter and jumps by click target, not by skipping", () => {
    const html = renderToStaticMarkup(
      createElement(FocusQueueMenu, {
        items: queue,
        activeKey: "ada",
        onJump: () => undefined,
        startOpen: true,
      }),
    );
    expect(html).toContain("Queue · 3");
    expect(html).toContain("Analytical Engines");
    expect(html).toContain("Hopper Heating");
    expect(html).toContain("Lovelace Roofing");
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain("Skip");
    const options = html.match(/role="option"/g) ?? [];
    expect(options).toHaveLength(3);
  });

  it("onJump never calls skipFocusCard or any other server action", () => {
    const calls: string[] = [];
    const serverActions = {
      skipFocusCard: () => calls.push("skipFocusCard"),
      recordPipelineOutcome: () => calls.push("recordPipelineOutcome"),
      completeTodayRow: () => calls.push("completeTodayRow"),
      followUpTodayRow: () => calls.push("followUpTodayRow"),
      logTouchOutcome: () => calls.push("logTouchOutcome"),
    };
    let jumped: string | null = "stale";
    commitQueueJump("later", (key) => {
      jumped = key;
    }, serverActions);
    expect(jumped).toBe("later");
    expect(calls).toEqual([]);
  });

  it("asks before leaving a card with unsaved draft typing", () => {
    const seed = { subject: "Hi", body: "Hello", opener: "https://ada.example" };
    expect(draftIsDirty(seed, seed)).toBe(false);
    expect(draftIsDirty({ ...seed, body: "Hello Ada" }, seed)).toBe(true);

    const prompts: string[] = [];
    const stay = mayLeaveCardForJump({
      key: "grace",
      currentKey: "ada",
      dirty: true,
      confirmDiscard: (message) => {
        prompts.push(message);
        return false;
      },
    });
    expect(stay).toBe(false);
    expect(prompts).toEqual([DISCARD_DRAFT_EDITS]);

    const leave = mayLeaveCardForJump({
      key: "grace",
      currentKey: "ada",
      dirty: true,
      confirmDiscard: () => true,
    });
    expect(leave).toBe(true);

    let asked = false;
    expect(
      mayLeaveCardForJump({
        key: "grace",
        currentKey: "ada",
        dirty: false,
        confirmDiscard: () => {
          asked = true;
          return false;
        },
      }),
    ).toBe(true);
    expect(asked).toBe(false);
    expect(
      mayLeaveCardForJump({
        key: "ada",
        currentKey: "ada",
        dirty: true,
        confirmDiscard: () => true,
      }),
    ).toBe(false);
  });
});
