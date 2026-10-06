export type AiProviderName = "gemini" | "anthropic";

export type OutreachDraftAiConfig = {
  configured: boolean;
  provider: "Gemini" | "Anthropic" | null;
  model: string | null;
};

/** Which provider has a key. Names and presence only — the key itself never leaves this check. */
export function resolveAiProvider(): AiProviderName | null {
  const choice = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (choice === "gemini" || choice === "google") {
    return process.env.GEMINI_API_KEY ? "gemini" : null;
  }
  if (choice === "anthropic" || choice === "claude") {
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  }
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function modelMatches(provider: AiProviderName, model: string) {
  return provider === "gemini" ? !model.startsWith("claude") : !model.startsWith("gemini");
}

/** The model a call will actually use. A fast model for the other provider falls back to the default. */
export function modelForProvider(provider: AiProviderName, requested?: string) {
  const builtin = provider === "gemini" ? "gemini-3.6-flash" : "claude-sonnet-5";
  const envDefault = process.env.AI_MODEL_DEFAULT;
  const fallback = envDefault && modelMatches(provider, envDefault) ? envDefault : builtin;
  if (requested && modelMatches(provider, requested)) return requested;
  return fallback;
}

/** Provider and draft-model names from server config. Never includes API keys. */
export function outreachDraftAiConfig(): OutreachDraftAiConfig {
  const provider = resolveAiProvider();
  if (!provider) return { configured: false, provider: null, model: null };
  const requested = process.env.AI_MODEL_FAST?.trim() || process.env.AI_MODEL_DEFAULT?.trim() || undefined;
  return {
    configured: true,
    provider: provider === "gemini" ? "Gemini" : "Anthropic",
    model: modelForProvider(provider, requested),
  };
}
