import { describe, expect, it } from "vitest";
import { liveAiSummary } from "@/lib/liveAi";

describe("live AI summary", () => {
  it("names the provider and model", () => {
    expect(liveAiSummary({ configured: true, provider: "Gemini", model: "gemini-3.5-flash-lite" })).toBe(
      "Gemini · gemini-3.5-flash-lite",
    );
  });

  it("says plainly when no provider key is configured", () => {
    expect(liveAiSummary({ configured: false, provider: null, model: null })).toBe("No AI provider key is configured.");
  });
});
