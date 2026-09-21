import { z } from "zod";

export const channelSchema = z.enum(["email", "call", "instagram", "linkedin"]);

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
});

export type CampaignStrategy = z.infer<typeof campaignStrategySchema>;

function fillPlaceholders(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
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

/**
 * Product-type template used when the campaign builder's AI step is
 * unavailable (no ANTHROPIC_API_KEY) — SPEC 5.6 step 3 "Fallback:
 * product-type templates". Manager/rep edits this freely afterward.
 */
export function fallbackStrategy(input: {
  productName: string;
  productType: "product" | "service";
  productSummary: string;
  location?: string;
  buyerGuess?: string;
  goal?: string;
}): CampaignStrategy {
  const loc = input.location || "your target area";
  const buyer = input.buyerGuess || (input.productType === "service" ? "The owner or operations lead" : "The person who owns this problem day to day");

  return {
    summary: `Find ${buyer.toLowerCase()}s in ${loc} who feel the problem ${input.productName} solves, prove it with something specific to them, and book a short conversation.`,
    icp: {
      buyer,
      business: input.productSummary || `Businesses that would benefit from ${input.productName}`,
      location: loc,
      size: "Small to mid-size",
      triggers: [
        "Recently posted about the problem this solves",
        "Shows public signs of the pain point",
        "Growing fast enough that manual workarounds are breaking",
      ],
      disqualifiers: ["Already has a strong competing solution in place", "Too small to afford or need this yet"],
    },
    channels: [
      { channel: "email", why: "Carries detail and evidence, and keeps a written trail for follow-ups." },
      { channel: "call", why: "Fastest way to confirm the problem is real and get a same-day answer." },
    ],
    cadence: [
      { day: 0, channel: "call", purpose: "Open with a specific, observed problem, not a pitch.", tip: "Lead with what you noticed about them, not what you sell." },
      { day: 1, channel: "email", purpose: "Follow up with the evidence in writing.", tip: "Ask for one small yes before asking for a meeting." },
      { day: 4, channel: "email", purpose: "Add one new piece of information.", tip: "Never just 'bumping this' — bring something new every time." },
      { day: 8, channel: "call", purpose: "Final attempt to book a short call.", tip: "Ask for 10 minutes, not 'a demo'." },
    ],
    messages: {
      email: {
        first: `Subject: A quick note about {biz}\n\nHi {name},\n\nI noticed something at {biz} that ${input.productName} was built for. Worth 10 minutes to see if it's a fit?\n\n{me}`,
        follow: `Subject: Re: {biz}\n\nHi {name},\n\nFollowing up — happy to send more detail if useful, or find 10 minutes this week.\n\n{me}`,
      },
      call: {
        first: `Hi, is this {name}? This is {me}. I noticed something at {biz} and wanted to share it directly — got two minutes?`,
        follow: `Hi {name}, {me} again, following up on {biz}. Do you have 10 minutes this week?`,
      },
      instagram: {
        first: `Hey {name}! Following {biz}. Think {product} could help with something I noticed — want details?`,
        follow: `Hey {name}, circling back — still happy to share the details whenever's good.`,
      },
      linkedin: {
        first: `Hi {name}, saw {biz}'s work. {product} was built for exactly the kind of problem you're likely dealing with. Worth a short chat?`,
        follow: `Hi {name}, quick nudge — still worth 10 minutes this week?`,
      },
    },
    objections: [
      { question: "We already have something for this.", answer: "Great — ask what it doesn't cover, and offer to show the gap." },
      { question: "Send me some info.", answer: "Agree, then ask what they'd need to see to decide, and book the follow-up before hanging up." },
      { question: "Too expensive.", answer: "Compare the price to the cost of the problem itself, with their own numbers." },
    ],
    lead_gen: {
      sources: ["Google Maps", "Manual research"],
      search_queries: [`${input.productType === "service" ? "businesses" : "companies"} in ${loc}`],
      must_have: ["Public contact info", "Matches the ICP business type"],
      score_boost: ["Shows a public trigger signal"],
    },
    kill_rule: "Pause at 150 touches if reply rate is under 1% or bounce rate is over 5%.",
  };
}
