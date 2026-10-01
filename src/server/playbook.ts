import { z } from "zod";

export const channelSchema = z.enum(["email", "call", "instagram", "linkedin"]);

const scriptPairSchema = z
  .tuple([z.string(), z.string()])
  .optional()
  .transform((v): [string, string] => [v?.[0] ?? "", v?.[1] ?? ""]);

export const campaignStrategySchema = z.object({
  summary: z.string(),
  icp: z.object({
    buyer: z.string(),
    business: z.string(),
    location: z.string(),
    size: z.string(),
    triggers: z.array(z.string()),
    disqualifiers: z.array(z.string()),
  }),
  channels: z.array(z.object({ channel: channelSchema, why: z.string() })),
  cadence: z.array(
    z.object({ day: z.number().int().min(0), channel: channelSchema, purpose: z.string(), tip: z.string() }),
  ),
  messages: z.record(channelSchema, z.object({ first: z.string(), follow: z.string() })),
  objections: z.array(z.object({ question: z.string(), answer: z.string() })),
  lead_gen: z.object({
    sources: z.array(z.string()),
    search_queries: z.array(z.string()),
    must_have: z.array(z.string()),
    score_boost: z.array(z.string()),
  }),
  kill_rule: z.string(),
  /**
   * Call openers A and B. Separate from email. Focus assigns one; the rep does not pick.
   * Stored on the touch as script_id (`call:a` or `call:b`).
   */
  call_scripts: scriptPairSchema,
  /** Email openers A and B. Separate from the call scripts. */
  email_scripts: scriptPairSchema,
});

export type CampaignStrategy = z.infer<typeof campaignStrategySchema>;

function fillPlaceholders(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

function scriptPair(scripts: readonly string[] | undefined): [string, string] {
  if (Array.isArray(scripts) && scripts.length >= 2) return [scripts[0] ?? "", scripts[1] ?? ""];
  return ["", ""];
}

export function getCallScripts(strategy: CampaignStrategy | null | undefined): [string, string] {
  return scriptPair(strategy?.call_scripts);
}

export function getEmailScripts(strategy: CampaignStrategy | null | undefined): [string, string] {
  return scriptPair(strategy?.email_scripts);
}

export function renderScriptTemplate(
  template: string,
  values: { name: string; biz: string; city: string; me: string; product: string },
) {
  return fillPlaceholders(template, values);
}

export function renderMessage(
  strategy: CampaignStrategy,
  channel: string,
  variant: "first" | "follow",
  values: { name: string; biz: string; city: string; me: string; product: string },
) {
  const msg = strategy.messages[channel as keyof typeof strategy.messages];
  if (!msg) return "";
  return fillPlaceholders(msg[variant], values);
}
