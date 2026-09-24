import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";
import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";
import type { AiFeature } from "@prisma/client";

/**
 * Every AI call in the app goes through here. When the selected provider has
 * no API key, or the monthly budget is exhausted, callClaudeJSON throws
 * AiUnavailableError — callers must catch it and fall back to the rule-based
 * behavior described in docs/SPEC.md. The UI must work when AI is down.
 *
 * AI_PROVIDER=gemini uses GEMINI_API_KEY. AI_PROVIDER=anthropic uses
 * ANTHROPIC_API_KEY. If AI_PROVIDER is unset, Gemini is used when its key is
 * set, otherwise Claude.
 */
export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(`AI unavailable: ${reason}`);
    this.name = "AiUnavailableError";
  }
}

type Provider = "gemini" | "anthropic";

// Rough planning estimates (USD per million tokens).
const PRICING_PER_MTOK: Record<string, { in: number; out: number }> = {
  "gemini-3.6-flash": { in: 0.3, out: 2.5 },
  "gemini-3.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-flash-lite-latest": { in: 0.1, out: 0.4 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4 },
  "claude-opus-5": { in: 15, out: 75 },
};

const CALL_TIMEOUT_MS = 90_000;

let cachedAnthropic: Anthropic | null | undefined;
let cachedGemini: GoogleGenAI | null | undefined;

function resolveProvider(): Provider | null {
  const choice = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (choice === "gemini" || choice === "google") {
    return process.env.GEMINI_API_KEY ? "gemini" : null;
  }
  if (choice === "anthropic" || choice === "claude") {
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  }
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function isAiEnabled() {
  return resolveProvider() !== null;
}

export function aiProviderName(): Provider | null {
  return resolveProvider();
}

function getAnthropic(): Anthropic | null {
  if (cachedAnthropic !== undefined) return cachedAnthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  cachedAnthropic = apiKey ? new Anthropic({ apiKey, timeout: CALL_TIMEOUT_MS }) : null;
  return cachedAnthropic;
}

function getGemini(): GoogleGenAI | null {
  if (cachedGemini !== undefined) return cachedGemini;
  const apiKey = process.env.GEMINI_API_KEY;
  cachedGemini = apiKey ? new GoogleGenAI({ apiKey }) : null;
  return cachedGemini;
}

function modelMatches(provider: Provider, model: string) {
  return provider === "gemini" ? !model.startsWith("claude") : !model.startsWith("gemini");
}

function modelFor(provider: Provider, requested?: string) {
  const builtin = provider === "gemini" ? "gemini-3.6-flash" : "claude-sonnet-5";
  const envDefault = process.env.AI_MODEL_DEFAULT;
  const fallback = envDefault && modelMatches(provider, envDefault) ? envDefault : builtin;
  if (requested && modelMatches(provider, requested)) return requested;
  return fallback;
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const rate =
    PRICING_PER_MTOK[model] ??
    (model.startsWith("gemini") ? PRICING_PER_MTOK["gemini-3.6-flash"]! : PRICING_PER_MTOK["claude-sonnet-5"]!);
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

type Completion = { text: string; usage: { input_tokens: number; output_tokens: number } };

async function completeGemini(model: string, system: string, prompt: string, maxTokens: number): Promise<Completion> {
  const gemini = getGemini();
  if (!gemini) throw new AiUnavailableError("no GEMINI_API_KEY configured");
  const resp = await gemini.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      maxOutputTokens: maxTokens,
      temperature: 0.2,
      responseMimeType: "application/json",
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    },
  });
  return {
    text: resp.text ?? "",
    usage: {
      input_tokens: resp.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: resp.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

async function completeClaude(model: string, system: string, prompt: string, maxTokens: number): Promise<Completion> {
  const anthropic = getAnthropic();
  if (!anthropic) throw new AiUnavailableError("no ANTHROPIC_API_KEY configured");
  const resp = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { text, usage: resp.usage };
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
  const provider = resolveProvider();
  if (!provider) {
    throw new AiUnavailableError("no GEMINI_API_KEY or ANTHROPIC_API_KEY configured");
  }
  if (!(await underBudget(opts.organizationId))) {
    throw new AiUnavailableError("monthly AI budget reached");
  }

  const model = modelFor(provider, opts.model || process.env.AI_MODEL_FAST || process.env.AI_MODEL_DEFAULT);
  const system = `${opts.system}\n\nRespond with ONLY valid JSON matching the required shape. No markdown fences, no commentary before or after.`;
  const maxTokens = opts.maxTokens ?? 2000;
  const start = Date.now();

  const attempt = (extra?: string) => {
    const prompt = extra ? `${opts.prompt}\n\n${extra}` : opts.prompt;
    return provider === "gemini"
      ? completeGemini(model, system, prompt, maxTokens)
      : completeClaude(model, system, prompt, maxTokens);
  };

  let inputTokens = 0;
  let outputTokens = 0;
  try {
    let completion = await attempt();
    inputTokens += completion.usage.input_tokens;
    outputTokens += completion.usage.output_tokens;
    let parsed = parseWithSchema(opts.schema, completion.text);

    if (!parsed.success) {
      const retry = await attempt(
        `Your previous reply did not match the required JSON shape (${parsed.error.message}). Reply again with corrected JSON only.`,
      );
      inputTokens += retry.usage.input_tokens;
      outputTokens += retry.usage.output_tokens;
      parsed = parseWithSchema(opts.schema, retry.text);
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

function parseWithSchema<T>(schema: ZodType<T>, text: string) {
  try {
    return schema.safeParse(JSON.parse(extractJson(text)));
  } catch (err) {
    return {
      success: false as const,
      error: { message: err instanceof Error ? err.message : "response was not valid JSON" },
    };
  }
}
