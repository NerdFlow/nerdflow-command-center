/**
 * Lead fit scoring (docs/PROMPTS.md section 3) — the AI half of the 40%
 * rules / 60% AI blend in docs/SPEC.md 5.8 step 7. Bump PROMPT_VERSION when
 * the prompt text or schema shape changes.
 */
export const PROMPT_VERSION = 1;

export const SYSTEM_PROMPT = `
Score how well this lead fits the campaign's ideal customer. Use only the data given — never invent facts,
names, statistics or results that aren't in the lead data below.
`.trim();

export function buildUserPrompt(input: { icp: unknown; lead: { name: string; website: string; extractedText: string } }) {
  return `
<icp>${JSON.stringify(input.icp)}</icp>
<untrusted_lead>
Business: ${input.lead.name}
Website: ${input.lead.website}
Homepage text (may be incomplete or irrelevant to their actual business — judge accordingly):
${input.lead.extractedText || "(homepage could not be fetched)"}
</untrusted_lead>

Return JSON: {"fit_score": 0-100, "fit_reasons": ["max 3 short reasons"], "fit_flags": ["max 3 problems"], "disqualified": boolean, "disqualify_reason": "string or empty"}
Score 70+ only when the business type clearly fits the ICP and the homepage text supports it.
If the homepage could not be fetched, say so as a fit_flag and score conservatively — do not guess.
`.trim();
}
