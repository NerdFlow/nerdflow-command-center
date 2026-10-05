import { afterEach, describe, expect, it } from "vitest";
import { outreachDraftAiConfig } from "@/server/ai/draftModel";

const KEYS = ["AI_PROVIDER", "AI_MODEL_FAST", "AI_MODEL_DEFAULT", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"] as const;

function snapshot(): Record<(typeof KEYS)[number], string | undefined> {
  return Object.fromEntries(KEYS.map((key) => [key, process.env[key]])) as Record<(typeof KEYS)[number], string | undefined>;
}

function restore(saved: Record<(typeof KEYS)[number], string | undefined>) {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

describe("outreach draft AI config", () => {
  const saved = snapshot();
  afterEach(() => restore(saved));

  it("reports the live provider and fast model without the key", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "super-secret-gemini-key";
    process.env.AI_MODEL_FAST = "gemini-3.5-flash-lite";
    delete process.env.AI_MODEL_DEFAULT;
    const config = outreachDraftAiConfig();
    expect(config).toEqual({ configured: true, provider: "Gemini", model: "gemini-3.5-flash-lite" });
    expect(JSON.stringify(config)).not.toContain("super-secret-gemini-key");
  });

  it("uses the default model when the fast model belongs to the other provider", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "super-secret-gemini-key";
    process.env.AI_MODEL_FAST = "claude-haiku-4-5-20251001";
    process.env.AI_MODEL_DEFAULT = "gemini-3.5-flash-lite";
    expect(outreachDraftAiConfig()).toEqual({ configured: true, provider: "Gemini", model: "gemini-3.5-flash-lite" });
  });

  it("is not configured when the chosen provider has no key", () => {
    process.env.AI_PROVIDER = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = "super-secret-gemini-key";
    const config = outreachDraftAiConfig();
    expect(config.configured).toBe(false);
    expect(config.provider).toBeNull();
    expect(config.model).toBeNull();
    expect(JSON.stringify(config)).not.toContain("super-secret-gemini-key");
  });
});
