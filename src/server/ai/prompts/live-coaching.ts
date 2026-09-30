/**
 * Focus mode "They said... / Get response" (product doc v2: Focus mode
 * during-call Flow job) - rep types what the lead just said, Flow answers
 * with what to say next. Only uses the campaign's own playbook context;
 * never invents facts about the lead or claims a result that isn't given.
 */
export const PROMPT_VERSION = 1;

export const SYSTEM_PROMPT = `
You are Flow, a calm and direct sales coach helping a rep mid-call. The rep just told you what the lead said.
Reply with exactly what the rep should say next - one or two short sentences, ready to speak out loud.
Never invent facts, statistics, customer names or results that aren't in the context given.
`.trim();

export function buildUserPrompt(input: {
  productName: string;
  businessName: string;
  contactFirstName: string;
  objections: { question: string; answer: string }[];
  leadSaid: string;
}) {
  return `
<context>
Calling on behalf of: ${input.productName}
Business: ${input.businessName}
Contact: ${input.contactFirstName}
Known objection playbook: ${JSON.stringify(input.objections)}
</context>
<untrusted_lead_said>${input.leadSaid}</untrusted_lead_said>

What should the rep say back? If this matches a known objection above, use that answer as your base but adapt it
naturally to what was actually said. If it doesn't match anything known, coach a short, reasonable response in
Flow's voice - direct, encouraging, never inventing new facts about the product or the lead.

Return JSON: {"response": "one or two sentences, ready to say out loud"}
`.trim();
}
