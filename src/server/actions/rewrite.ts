"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { campaignStrategySchema, renderMessage } from "@/server/strategy";
import { callClaudeJSON, AiUnavailableError } from "@/server/ai/client";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  type RewriteStyle,
} from "@/server/ai/prompts/rewrite-draft";
import { joinEmailDraft, splitEmailDraft } from "@/server/cadence";

const rewriteSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

function firstNameOf(contactName: string | null | undefined): string {
  if (!contactName) return "there";
  return contactName.trim().split(/\s+/)[0] ?? "there";
}

/**
 * Focus email rewrite. Falls back to the campaign's saved email template when
 * AI is down, and tells the caller so the UI can say so.
 */
export async function rewriteEmailDraft(input: {
  campaignId: string;
  leadId: string;
  style: RewriteStyle;
  customInstruction?: string;
  subject: string;
  body: string;
}): Promise<{ subject: string; body: string; source: "ai" | "fallback"; note?: string }> {
  const user = await requireUser();
  const [campaign, lead] = await Promise.all([
    prisma.campaign.findFirst({
      where: { id: input.campaignId, organizationId: user.organizationId },
      include: { product: true },
    }),
    prisma.lead.findFirst({ where: { id: input.leadId, organizationId: user.organizationId } }),
  ]);
  if (!campaign || !lead) throw new Error("Lead or campaign not found");

  const parsed = campaignStrategySchema.safeParse(campaign.strategy);
  const strategy = parsed.success ? parsed.data : null;
  const contactFirstName = firstNameOf(lead.contactName);
  const variant = lead.cadenceStep === 0 ? "first" : "follow";
  const productName = campaign.product.name;
  const businessName = lead.businessName;
  const city = lead.city || "";
  const cadenceStep = lead.cadenceStep;
  const meName = user.fullName;
  const currentSubject = input.subject;
  const currentBody = input.body;

  function templateFallback(note: string) {
    const draft = strategy
      ? renderMessage(strategy, "email", variant, {
          name: contactFirstName,
          biz: businessName,
          city,
          me: meName,
          product: productName,
        })
      : joinEmailDraft(currentSubject, currentBody);
    const parts = splitEmailDraft(draft || joinEmailDraft(currentSubject, currentBody));
    return { subject: parts.subject || currentSubject, body: parts.body || currentBody, source: "fallback" as const, note };
  }

  if (input.style === "custom" && !input.customInstruction?.trim()) {
    return templateFallback("Tell Flow what you want changed.");
  }

  const step = strategy?.cadence?.find((s) => s.channel === "email") ?? strategy?.cadence?.[cadenceStep];

  try {
    const result = await callClaudeJSON({
      feature: "draft_review",
      organizationId: user.organizationId,
      userId: user.id,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt({
        style: input.style,
        customInstruction: input.customInstruction,
        productName,
        businessName,
        contactFirstName,
        city,
        purpose: step?.purpose ?? "Reach out and ask for a short conversation.",
        tip: step?.tip ?? "",
        subject: currentSubject,
        body: currentBody,
      }),
      schema: rewriteSchema,
      maxTokens: 600,
    });
    return {
      subject: result.subject.replace(/^(Subject|SUBJECT)\s*:\s*/i, "").trim(),
      body: result.body.trim(),
      source: "ai",
    };
  } catch (e) {
    if (e instanceof AiUnavailableError || e instanceof Error) {
      return templateFallback("AI unavailable — restored the campaign's saved email template.");
    }
    throw e;
  }
}
