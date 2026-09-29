/**
 * Market research (Campaign wizard Step 1). Two-pass by necessity: Gemini's
 * googleSearch grounding tool and forced JSON output don't reliably mix in
 * one call (same constraint documented in discoverBusinessesWithGemini), so
 * pass one does real grounded research in free text, and pass two structures
 * that text into JSON — sources are taken from pass one's actual grounding
 * citations, never from the structuring pass, so nothing here can invent a
 * source that wasn't a real search result.
 */
export const PROMPT_VERSION = 1;

export function buildResearchPrompt(input: { productName: string; productSummary: string; audience?: string; location?: string }) {
  return `
Research the market for "${input.productName}" — ${input.productSummary}.
${input.audience ? `Likely buyer: ${input.audience}.` : ""} ${input.location ? `Target area: ${input.location}.` : ""}

Use Google Search. Cover, in plain prose:
- What the market actually looks like right now for this kind of buyer
- 2-4 distinct buyer types who'd want this, with what makes each one different
- The real, specific pain points these buyers have (not generic ones)
- 2-4 real competing products or approaches buyers currently use instead
- Which outreach channels would plausibly reach these buyers, and why
- 2-3 possible angles to open a conversation with

Be concrete and specific to what you actually find — never invent a competitor, statistic or buyer detail you didn't find through search.
`.trim();
}

export const STRUCTURE_SYSTEM_PROMPT = `
You turn free-text market research notes into structured JSON. Only use facts present in the notes you're given —
never add a buyer, competitor, pain point or channel that isn't in the source text.
`.trim();

export function buildStructurePrompt(researchText: string) {
  return `
<research_notes>
${researchText}
</research_notes>

Return JSON matching this shape exactly, using only what's in the notes above:
{
  "market_snapshot": "string, 2-3 sentences",
  "buyers": [{"type": "string", "why": "string"}],
  "pain_points": ["string"],
  "competitors": [{"name": "string", "gap": "string, what they don't cover"}],
  "channels": [{"channel": "email|call|instagram|linkedin", "why": "string"}],
  "angles": ["string, 2-3 possible opening angles"]
}
`.trim();
}
