"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth";
import { callClaudeJSON, isAiEnabled } from "@/server/ai/client";
import { getOrgSettings } from "@/server/settings";

const replySchema = z.object({ reply: z.string() });

export async function askFlow(input: { screen: string; message: string }) {
  const user = await requireUser();
  const settings = await getOrgSettings();

  if (!isAiEnabled()) {
    return {
      reply: `${settings.assistantName} isn't connected to an AI model yet, so I can't answer freeform questions right now — everything else in the app (targets, cadence, scoring) still works without me.`,
      aiUsed: false as const,
    };
  }

  try {
    const result = await callClaudeJSON({
      feature: "chat",
      system: `You are ${settings.assistantName}, a calm, direct, encouraging sales co-pilot for a small team of non-salespeople at NerdFlow. Short sentences, always end with a clear next action. You never invent facts about a specific lead, deal or campaign that weren't given to you — if you don't have the data, say so plainly instead of guessing. You never send anything to a prospect; you only draft and suggest.`,
      prompt: `The rep is currently on the "${input.screen}" screen. They asked: "${input.message}"\n\nReply in 2-4 short sentences.\n\nReturn JSON: {"reply": string}`,
      schema: replySchema,
      organizationId: user.organizationId,
      userId: user.id,
      maxTokens: 400,
    });
    return { reply: result.reply, aiUsed: true as const };
  } catch {
    return {
      reply: "I couldn't reach the AI model just now — try again in a moment.",
      aiUsed: false as const,
    };
  }
}
