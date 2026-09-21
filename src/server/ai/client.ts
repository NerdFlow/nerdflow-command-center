import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";
import type { AiFeature } from "@prisma/client";

/**
 * Every AI call in the app goes through here (CLAUDE.md code rule). Nothing
 * else may import "@anthropic-ai/sdk" directly. When ANTHROPIC_API_KEY is
 * unset, or the monthly budget is exhausted, callClaudeJSON throws
 * AiUnavailableError — callers must catch it and fall back to the rule-based
 * behavior described in docs/SPEC.md. The UI must work when AI is down.
 */
export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(`AI unavailable: ${reason}`);
    this.name = "AiUnavailableError";
  }
}

// Rough planning estimates (USD per million tokens) — confirm against the
// current Anthropic pricing page before relying on this for real budgeting.
const PRICING_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4 },
  "claude-opus-5": { in: 15, out: 75 },
};

let cachedClient: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  cachedClient = apiKey ? new Anthropic({ apiKey }) : null;
  return cachedClient;
}

export function isAiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const rate = PRICING_PER_MTOK[model] ?? PRICING_PER_MTOK["claude-sonnet-5"]!;
  return (inputTokens / 1_000_000) * rate.in + (outputTokens / 1_000_000) * rate.out;
}

async function underBudget(organizationId: string): Promise<boolean> {
  const settings = await getOrgSettings();
  const budget = settings.aiMonthlyBudgetUsd || Number(process.env.AI_MONTHLY_BUDGET_USD || 150);
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const usage = await prisma.aiUsage.aggregate({
    where: { organizationId, createdAt: { gte: startOfMonth } },
    _sum: { costUsd: true },
  });
  const spent = Number(usage._sum.costUsd ?? 0);
  return spent < budget;
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? (fenced[1] ?? raw) : raw;
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  const first = start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
  const lastCurly = candidate.lastIndexOf("}");
  const lastSquare = candidate.lastIndexOf("]");
  const last = Math.max(lastCurly, lastSquare);
  if (first === -1 || last === -1) return candidate.trim();
  return candidate.slice(first, last + 1);
}

async function logUsage(params: {
  organizationId: string;
  userId?: string | null;
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
}) {
  await prisma.aiUsage.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId ?? null,
      feature: params.feature,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costUsd: estimateCostUsd(params.model, params.inputTokens, params.outputTokens),
      latencyMs: params.latencyMs,
      success: params.success,
    },
  });
}

export async function callClaudeJSON<T>(opts: {
  feature: AiFeature;
  model?: string;
  system: string;
  prompt: string;
  schema: ZodType<T>;
  organizationId: string;
  userId?: string | null;
  maxTokens?: number;
}): Promise<T> {
  const anthropic = getClient();
  if (!anthropic) throw new AiUnavailableError("no ANTHROPIC_API_KEY configured");
  if (!(await underBudget(opts.organizationId))) {
    throw new AiUnavailableError("monthly AI budget reached");
  }

  const model = opts.model || process.env.AI_MODEL_DEFAULT || "claude-sonnet-5";
  const system = `${opts.system}\n\nRespond with ONLY valid JSON matching the required shape. No markdown fences, no commentary before or after.`;
  const start = Date.now();

  const attempt = async (extra?: string) => {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      system,
      messages: [{ role: "user", content: extra ? `${opts.prompt}\n\n${extra}` : opts.prompt }],
    });
    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, usage: resp.usage };
  };

  let inputTokens = 0;
  let outputTokens = 0;
  try {
    let { text, usage } = await attempt();
    inputTokens += usage.input_tokens;
    outputTokens += usage.output_tokens;
    let parsed = opts.schema.safeParse(JSON.parse(extractJson(text)));

    if (!parsed.success) {
      const retry = await attempt(
        `Your previous reply did not match the required JSON shape (${parsed.error.message}). Reply again with corrected JSON only.`,
      );
      inputTokens += retry.usage.input_tokens;
      outputTokens += retry.usage.output_tokens;
      parsed = opts.schema.safeParse(JSON.parse(extractJson(retry.text)));
    }

    if (!parsed.success) {
      await logUsage({
        organizationId: opts.organizationId,
        userId: opts.userId,
        feature: opts.feature,
        model,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - start,
        success: false,
      });
      throw new AiUnavailableError("model output failed schema validation twice");
    }

    await logUsage({
      organizationId: opts.organizationId,
      userId: opts.userId,
      feature: opts.feature,
      model,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - start,
      success: true,
    });
    return parsed.data;
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    await logUsage({
      organizationId: opts.organizationId,
      userId: opts.userId,
      feature: opts.feature,
      model,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - start,
      success: false,
    });
    throw new AiUnavailableError(err instanceof Error ? err.message : "unknown error");
  }
}
