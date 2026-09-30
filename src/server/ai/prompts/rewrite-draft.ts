/**
 * Focus mode email rewrite (SPEC 5.4 / AI_ENGINEER_BRIEF "Rewrite draft").
 * Rep taps Shorter / More casual / Different angle, or asks Flow freeform.
 * Never invents facts — only rewrites the given draft using campaign context.
 */
export const PROMPT_VERSION = 1;

export const SYSTEM_PROMPT = `
You are Flow, a calm and direct sales coach helping a non-salesperson write an outreach email.
Rewrite the draft they give you. Keep it human, short, and specific to the data provided.
Never invent facts, statistics, customer names, prices or results that are not in the context.
Never claim the product has been used by this lead. The app never sends the email — the rep will copy it.
Voice: calm, direct, a little dry. Short sentences. No hype, no emoji, no markdown.
`.trim();

export type RewriteStyle = "shorter" | "more_casual" | "different_angle" | "custom";

const STYLE_INSTRUCTIONS: Record<Exclude<RewriteStyle, "custom">, string> = {
  shorter: "Make it shorter. Cut fluff. Keep the ask. Under 70 words in the body.",
  more_casual: "Make it more casual and conversational, like a quick note from a peer — still professional, no slang.",
  different_angle: "Keep the same goal but open with a different angle or observation. Do not just rephrase synonyms.",
};

export function buildUserPrompt(input: {
  style: RewriteStyle;
  customInstruction?: string;
  productName: string;
  businessName: string;
  contactFirstName: string;
  city: string;
  purpose: string;
  tip: string;
  subject: string;
  body: string;
}) {
  const styleLine =
    input.style === "custom"
      ? `Custom instruction from the rep: ${input.customInstruction?.trim() || "Improve this email."}`
      : STYLE_INSTRUCTIONS[input.style];

  return `
<context>
Product: ${input.productName}
Business: ${input.businessName}
Contact first name: ${input.contactFirstName}
City: ${input.city || "unknown"}
Touch purpose: ${input.purpose}
Sales tip: ${input.tip}
</context>

<style>${styleLine}</style>

<untrusted_draft>
Subject: ${input.subject}

${input.body}
</untrusted_draft>

Rewrite the email. Address the contact by first name (${input.contactFirstName}).
Return JSON: {"subject": "subject line only, no Subject: prefix", "body": "email body only, no subject line"}
`.trim();
}
