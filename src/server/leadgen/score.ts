import { z } from "zod";
import { callClaudeJSON, AiUnavailableError } from "@/server/ai/client";
import { SYSTEM_PROMPT, buildUserPrompt, PROMPT_VERSION } from "@/server/ai/prompts/lead-fit";

export const fitCheckSchema = z.object({
  fit_score: z.number().min(0).max(100),
  fit_reasons: z.array(z.string()).max(3),
  fit_flags: z.array(z.string()).max(3),
  disqualified: z.boolean(),
  disqualify_reason: z.string(),
});

export type FitCheck = z.infer<typeof fitCheckSchema>;

/**
 * Final = 40% rule score + 60% AI fit score (docs/SPEC.md 5.8 step 7), or the
 * rule score alone when the AI call fails or the budget is hit.
 */
export async function scoreLead(input: {
  organizationId: string;
  userId?: string | null;
  ruleScore: number;
  icp: unknown;
  lead: { name: string; website: string; extractedText: string };
}): Promise<{ score: number; reasons: string[]; flags: string[]; disqualified: boolean; source: "blended" | "rules_only" }> {
  try {
    const ai = await callClaudeJSON({
      feature: "scoring",
      organizationId: input.organizationId,
      userId: input.userId,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt({ icp: input.icp, lead: input.lead }),
      schema: fitCheckSchema,
      maxTokens: 500,
    });
    return {
      score: ai.disqualified ? 0 : Math.round(0.4 * input.ruleScore + 0.6 * ai.fit_score),
      reasons: ai.fit_reasons,
      flags: ai.fit_flags,
      disqualified: ai.disqualified,
      source: "blended",
    };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return { score: input.ruleScore, reasons: [], flags: ["AI fit check unavailable — rule score only"], disqualified: false, source: "rules_only" };
  }
}

export { PROMPT_VERSION as FIT_PROMPT_VERSION };
