export const PROMPT_VERSION = 1;

export const SYSTEM_PROMPT = `
You define an Ideal Customer Profile from approved market research. Only use what's in the research given to you —
never invent a business type, signal or title that isn't grounded in it.
`.trim();

export function buildUserPrompt(input: {
  productName: string;
  productSummary: string;
  research: { marketSnapshot: string; buyers: { type: string; why: string }[]; painPoints: string[]; disqualifiers?: string[] };
}) {
  return `
<product>${input.productName}: ${input.productSummary}</product>
<approved_research>
Market: ${input.research.marketSnapshot}
Buyer types: ${JSON.stringify(input.research.buyers)}
Pain points: ${JSON.stringify(input.research.painPoints)}
</approved_research>

Define the single best-fit ICP for the first campaign from this research — pick the strongest buyer type, don't average across all of them.

Return JSON:
{
  "name": "string, short label for this ICP",
  "business_types": ["string"],
  "keywords": ["string, 3-5 search-friendly terms"],
  "size_signals": "string, one line on what size/scale fits",
  "must_have": ["string, 2-3 hard requirements"],
  "nice_to_have": ["string, 1-2 boosts"],
  "disqualifiers": ["string, 2-3"],
  "decision_maker_titles": ["string, 2-3 job titles/roles who'd decide"]
}
`.trim();
}
