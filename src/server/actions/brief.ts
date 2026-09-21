"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth";
import { buildBrief } from "@/server/brief";
import { callClaudeJSON, isAiEnabled } from "@/server/ai/client";

const briefSchema = z.object({ lines: z.array(z.string()) });

export async function getSharperBrief() {
  const user = await requireUser();
  const { lines } = await buildBrief(user);

  if (!isAiEnabled()) return { lines, usedAi: false as const };

  try {
    const result = await callClaudeJSON({
      feature: "brief",
      model: process.env.AI_MODEL_FAST,
      system:
        "You are Flow, an internal sales-coaching assistant for a small sales team. Rewrite the given brief lines into a tighter, more direct, more motivating version. Never invent a fact, name, number or claim that isn't already present in the input lines — only rephrase and reorder for clarity and momentum.",
      prompt: `Rewrite these brief lines (same facts, sharper delivery, ${lines.length} lines or fewer):\n${lines
        .map((l) => `- ${l}`)
        .join("\n")}\n\nReturn JSON: {"lines": string[]}`,
      schema: briefSchema,
      organizationId: user.organizationId,
      userId: user.id,
    });
    return { lines: result.lines, usedAi: true as const };
  } catch {
    return { lines, usedAi: false as const };
  }
}
