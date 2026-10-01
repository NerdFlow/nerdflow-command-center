import { callClaudeJSON, AiUnavailableError, estimatePreCallCostUsd } from "@/server/ai/client";
import { SYSTEM_PROMPT, buildUserPrompt, PROMPT_VERSION } from "@/server/ai/prompts/campaign-strategy";
import { detailingStarterStrategy, isAutoDetailingContext } from "@/server/detailingStrategy";
import { getOrgSettings } from "@/server/settings";
import { campaignStrategySchema, type CampaignStrategy } from "@/server/playbook";

export {
  campaignStrategySchema,
  channelSchema,
  getCallScripts,
  getEmailScripts,
  renderMessage,
  renderScriptTemplate,
} from "@/server/playbook";
export type { CampaignStrategy } from "@/server/playbook";

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
  if (isAutoDetailingContext([input.productName, input.productSummary, input.buyerGuess, input.goal])) {
    return detailingStarterStrategy(input);
  }

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
    call_scripts: [
      "Hi, is this {name}? This is {me}. I noticed something at {biz} in {city} and wanted to say it directly. Got two minutes?",
      "Hi {name}, {me} again. Quick one about {biz}. {product} was built for this kind of problem. Worth ten minutes this week?",
    ],
    email_scripts: [
      `Subject: A quick note about {biz}\n\nHi {name},\n\nI noticed something at {biz} that ${input.productName} was built for. Worth 10 minutes to see if it's a fit?\n\n{me}`,
      `Subject: {biz} this week\n\nHi {name},\n\nDifferent angle: if ${input.productName} saved {biz} one headache a week, would ten minutes be worth it?\n\n{me}`,
    ],
  };
}

const STRATEGY_MAX_OUTPUT_TOKENS = 3000;

type StrategyGenInput = {
  organizationId: string;
  userId: string;
  productName: string;
  productType: "product" | "service";
  productSummary: string;
  location?: string;
  buyerGuess?: string;
  goal?: string;
  notes?: string;
  existingCampaigns?: string;
  currentStrategy?: CampaignStrategy;
  changeRequest?: string;
  approvedIcp?: CampaignStrategy["icp"];
};

function promptFor(input: StrategyGenInput, assistantName: string) {
  return buildUserPrompt({
    productName: input.productName,
    productType: input.productType,
    productSummary: input.productSummary,
    audience: input.buyerGuess,
    location: input.location,
    goal: input.goal,
    notes: input.notes,
    existingCampaigns: input.existingCampaigns,
    currentStrategy: input.currentStrategy ? JSON.stringify(input.currentStrategy) : undefined,
    changeRequest: input.changeRequest,
    approvedIcp: input.approvedIcp,
  });
}

/** Estimated cost in USD for a strategy generation call, or null if AI is unavailable (no key configured). */
export async function estimateStrategyCostUsd(input: Omit<StrategyGenInput, "organizationId" | "userId">): Promise<number | null> {
  const settings = await getOrgSettings();
  const prompt = promptFor({ ...input, organizationId: "", userId: "" }, settings.assistantName);
  return estimatePreCallCostUsd(SYSTEM_PROMPT(settings.assistantName).length + prompt.length, STRATEGY_MAX_OUTPUT_TOKENS);
}

/**
 * Real AI call through the gateway (src/server/ai/client.ts) — Market
 * Research + ICP + Playbook in one pass, per PROMPT_VERSION in
 * src/server/ai/prompts/campaign-strategy.ts. Falls back to the rule-based
 * template only when the AI call fails or the org's budget is hit; the
 * caller is told which happened so it can be honest with the rep.
 */
export async function generateCampaignStrategy(
  input: StrategyGenInput,
): Promise<{ strategy: CampaignStrategy; source: "ai"; promptVersion: number } | { strategy: CampaignStrategy; source: "fallback"; reason: string }> {
  const settings = await getOrgSettings();
  try {
    const strategy = await callClaudeJSON({
      feature: "strategy",
      organizationId: input.organizationId,
      userId: input.userId,
      system: SYSTEM_PROMPT(settings.assistantName),
      prompt: promptFor(input, settings.assistantName),
      schema: campaignStrategySchema,
      maxTokens: STRATEGY_MAX_OUTPUT_TOKENS,
    });
    // Belt-and-suspenders: force the approved ICP through exactly as approved,
    // regardless of what the model actually did with it.
    const finalStrategy: CampaignStrategy = {
      ...strategy,
      call_scripts: strategy.call_scripts ?? ["", ""],
      email_scripts: strategy.email_scripts ?? ["", ""],
      ...(input.approvedIcp ? { icp: input.approvedIcp } : {}),
    };
    return { strategy: finalStrategy, source: "ai", promptVersion: PROMPT_VERSION };
  } catch (err) {
    const reason = err instanceof AiUnavailableError ? err.message : "unexpected error generating strategy";
    const strategy = fallbackStrategy({
      productName: input.productName,
      productType: input.productType,
      productSummary: input.productSummary,
      location: input.location,
      buyerGuess: input.buyerGuess,
      goal: input.goal,
    });
    return { strategy, source: "fallback", reason };
  }
}
