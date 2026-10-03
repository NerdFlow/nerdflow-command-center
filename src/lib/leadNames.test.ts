import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, leadBusinessName, presentLeadName } from "@/lib/leadNames";

describe("lead names", () => {
  it("decodes HTML entities in a name and leaves a plain ampersand alone", () => {
    expect(decodeHtmlEntities("Fish &amp; Chips")).toBe("Fish & Chips");
    expect(decodeHtmlEntities("Tom&#39;s Grill")).toBe("Tom's Grill");
    expect(decodeHtmlEntities("Tom&#x27;s Grill")).toBe("Tom's Grill");
    expect(decodeHtmlEntities("A &amp;amp; B")).toBe("A & B");
    expect(decodeHtmlEntities("AT&T")).toBe("AT&T");
    expect(presentLeadName("  Bob&nbsp;&amp;&nbsp;Grill  ")).toBe("Bob & Grill");
  });

  it("stores the Places name when the page title is different or entity-encoded", () => {
    const pageTitle = "Home | Fish &amp; Chips Co | Order Online";
    expect(leadBusinessName({ placesName: "Fish &amp; Chips Co", pageTitle })).toBe("Fish & Chips Co");
    expect(leadBusinessName({ placesName: "Karachi Detailing", pageTitle: "Best Auto Detailing in Karachi" })).toBe(
      "Karachi Detailing",
    );
    expect(leadBusinessName({ placesName: "   ", pageTitle: "Welcome | Official Site" })).toBe("Unknown business");
    expect(leadBusinessName({ placesName: "", pageTitle })).toBe("Unknown business");
  });
});
