export type LiveAiConfig = {
  configured: boolean;
  provider: string | null;
  model: string | null;
};

/** Names only. The unconfigured sentence is what Settings shows when no provider key is set. */
export function liveAiSummary(ai: LiveAiConfig): string {
  if (!ai.configured || !ai.provider || !ai.model) return "No AI provider key is configured.";
  return `${ai.provider} · ${ai.model}`;
}
