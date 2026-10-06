import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FocusQueueMenu } from "@/components/FocusQueueMenu";
import { promoteQueueItem } from "@/lib/focusJump";

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
});
