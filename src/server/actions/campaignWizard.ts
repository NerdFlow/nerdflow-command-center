"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { researchMarketWithGemini, callClaudeJSON, AiUnavailableError } from "@/server/ai/client";
import { buildResearchPrompt, buildStructurePrompt, STRUCTURE_SYSTEM_PROMPT } from "@/server/ai/prompts/market-research";
import { SYSTEM_PROMPT as ICP_SYSTEM_PROMPT, buildUserPrompt as buildIcpPrompt } from "@/server/ai/prompts/icp-generation";
import { generateCampaignStrategy, campaignStrategySchema, type CampaignStrategy } from "@/server/strategy";

const researchStructureSchema = z.object({
  market_snapshot: z.string(),
  buyers: z.array(z.object({ type: z.string(), why: z.string() })),
  pain_points: z.array(z.string()),
  competitors: z.array(z.object({ name: z.string(), gap: z.string() })),
  channels: z.array(z.object({ channel: z.string(), why: z.string() })),
  angles: z.array(z.string()),
});

const icpSchema = z.object({
  name: z.string(),
  business_types: z.array(z.string()),
  keywords: z.array(z.string()),
  size_signals: z.string(),
  must_have: z.array(z.string()),
  nice_to_have: z.array(z.string()),
  disqualifiers: z.array(z.string()),
  decision_maker_titles: z.array(z.string()),
});

async function loadCampaign(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId: user.organizationId }, include: { product: true } });
  if (!campaign) throw new Error("Campaign not found");
  if (user.role === "rep" && campaign.ownerId !== user.id) throw new Error("Not your campaign");
  return { user, campaign };
}

/** Wizard Step 1: real grounded research (two-pass — see market-research.ts). Upserts the campaign's one Research row. */
export async function generateResearch(campaignId: string) {
  const { user, campaign } = await loadCampaign(campaignId);

  try {
    const grounded = await researchMarketWithGemini({
      organizationId: user.organizationId,
      userId: user.id,
      prompt: buildResearchPrompt({
        productName: campaign.product.name,
        productSummary: campaign.product.summary,
        audience: campaign.goal ?? undefined,
        location: campaign.location ?? undefined,
      }),
    });

    const structured = await callClaudeJSON({
      feature: "research",
      organizationId: user.organizationId,
      userId: user.id,
      system: STRUCTURE_SYSTEM_PROMPT,
      prompt: buildStructurePrompt(grounded.text),
      schema: researchStructureSchema,
      maxTokens: 1200,
      model: process.env.AI_MODEL_DEFAULT,
    });

    const research = await prisma.research.upsert({
      where: { campaignId },
      create: {
        organizationId: user.organizationId,
        campaignId,
        marketSnapshot: structured.market_snapshot,
        buyers: structured.buyers,
        painPoints: structured.pain_points,
        competitors: structured.competitors,
        channels: structured.channels,
        angles: structured.angles,
        sources: grounded.sources,
      },
      update: {
        marketSnapshot: structured.market_snapshot,
        buyers: structured.buyers,
        painPoints: structured.pain_points,
        competitors: structured.competitors,
        channels: structured.channels,
        angles: structured.angles,
        sources: grounded.sources,
        approvedById: null,
        approvedAt: null,
      },
    });
    revalidatePath(`/campaigns/${campaignId}/wizard`);
    return { source: "ai" as const, research };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return { source: "unavailable" as const, reason: err.message };
  }
}

export async function approveResearch(campaignId: string) {
  const { user } = await loadCampaign(campaignId);
  const research = await prisma.research.update({
    where: { campaignId },
    data: { approvedById: user.id, approvedAt: new Date() },
  });
  await writeAuditLog({ organizationId: user.organizationId, actorId: user.id, action: "research_approved", entityType: "campaign", entityId: campaignId });
  revalidatePath(`/campaigns/${campaignId}/wizard`);
  return research;
}

/** ICP generation grounded in existing research (no separate approve click). */
export async function generateIcp(campaignId: string) {
  const { user, campaign } = await loadCampaign(campaignId);
  const research = await prisma.research.findUnique({ where: { campaignId } });
  if (!research) throw new Error("Run market research first.");

  try {
    const result = await callClaudeJSON({
      feature: "strategy",
      organizationId: user.organizationId,
      userId: user.id,
      system: ICP_SYSTEM_PROMPT,
      prompt: buildIcpPrompt({
        productName: campaign.product.name,
        productSummary: campaign.product.summary,
        research: {
          marketSnapshot: research.marketSnapshot ?? "",
          buyers: research.buyers as { type: string; why: string }[],
          painPoints: research.painPoints as string[],
        },
      }),
      schema: icpSchema,
      maxTokens: 700,
    });

    // Auto-mark research used so older wizard UIs stay consistent.
    if (!research.approvedAt) {
      await prisma.research.update({
        where: { campaignId },
        data: { approvedById: user.id, approvedAt: new Date() },
      });
    }

    await prisma.icp.updateMany({ where: { campaignId }, data: { isActive: false } });
    const icp = await prisma.icp.create({
      data: {
        organizationId: user.organizationId,
        campaignId,
        name: result.name,
        businessTypes: result.business_types,
        keywords: result.keywords,
        sizeSignals: result.size_signals,
        mustHave: result.must_have,
        niceToHave: result.nice_to_have,
        disqualifiers: result.disqualifiers,
        decisionMakerTitles: result.decision_maker_titles,
        isActive: true,
      },
    });
    revalidatePath(`/campaigns/${campaignId}/wizard`);
    revalidatePath(`/campaigns/${campaignId}`);
    return { source: "ai" as const, icp };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return { source: "unavailable" as const, reason: err.message };
  }
}

/**
 * One-shot research → who-to-target for campaign create. No approval gates.
 * Merges ICP keywords into the campaign strategy search queries when AI works.
 */
export async function runResearchAndIcp(campaignId: string) {
  const researchResult = await generateResearch(campaignId);
  if (researchResult.source !== "ai") {
    return {
      ok: false as const,
      stage: "research" as const,
      reason: researchResult.reason,
      research: null,
      icp: null,
    };
  }

  const { user, campaign } = await loadCampaign(campaignId);
  await prisma.research.update({
    where: { campaignId },
    data: { approvedById: user.id, approvedAt: new Date() },
  });

  const icpResult = await generateIcp(campaignId);
  if (icpResult.source !== "ai") {
    return {
      ok: false as const,
      stage: "icp" as const,
      reason: icpResult.reason,
      research: researchResult.research,
      icp: null,
    };
  }

  const icp = icpResult.icp;
  const keywords = (icp.keywords as string[]) ?? [];
  const businessTypes = (icp.businessTypes as string[]) ?? [];
  const parsed = campaignStrategySchema.safeParse(campaign.strategy);
  if (parsed.success) {
    const next: CampaignStrategy = {
      ...parsed.data,
      icp: {
        buyer: ((icp.decisionMakerTitles as string[])[0] as string) || icp.name,
        business: businessTypes.join(", ") || parsed.data.icp.business,
        location: campaign.location ?? parsed.data.icp.location,
        size: icp.sizeSignals ?? parsed.data.icp.size,
        triggers: (icp.niceToHave as string[]) ?? parsed.data.icp.triggers,
        disqualifiers: (icp.disqualifiers as string[]) ?? parsed.data.icp.disqualifiers,
      },
      lead_gen: {
        ...parsed.data.lead_gen,
        search_queries:
          keywords.length > 0
            ? keywords.slice(0, 5)
            : businessTypes.length > 0
              ? businessTypes.slice(0, 5)
              : parsed.data.lead_gen.search_queries,
      },
    };
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { strategy: next as unknown as object, strategyVersion: { increment: 1 } },
    });
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return {
    ok: true as const,
    stage: "done" as const,
    reason: undefined,
    research: researchResult.research,
    icp,
  };
}

/** Wizard Step 3: playbook, built around the approved ICP (not a fresh one the model invents). */
export async function generatePlaybook(campaignId: string) {
  const { user, campaign } = await loadCampaign(campaignId);
  const icp = await prisma.icp.findFirst({ where: { campaignId, isActive: true } });
  if (!icp) throw new Error("Generate and approve an ICP first.");

  const approvedIcp: CampaignStrategy["icp"] = {
    buyer: (icp.decisionMakerTitles as string[])[0] || icp.name,
    business: (icp.businessTypes as string[]).join(", "),
    location: campaign.location ?? "unspecified",
    size: icp.sizeSignals ?? "",
    triggers: icp.niceToHave as string[],
    disqualifiers: icp.disqualifiers as string[],
  };

  const generated = await generateCampaignStrategy({
    organizationId: user.organizationId,
    userId: user.id,
    productName: campaign.product.name,
    productType: campaign.product.type,
    productSummary: campaign.product.summary,
    location: campaign.location ?? undefined,
    goal: campaign.goal ?? undefined,
    approvedIcp,
  });

  return generated;
}

export async function approvePlaybook(campaignId: string, strategy: CampaignStrategy) {
  const { user } = await loadCampaign(campaignId);
  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: { strategy: strategy as unknown as object, status: "active", strategyVersion: { increment: 1 } },
  });
  await writeAuditLog({ organizationId: user.organizationId, actorId: user.id, action: "playbook_approved", entityType: "campaign", entityId: campaignId });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return campaign;
}

export async function getWizardState(campaignId: string) {
  const { campaign } = await loadCampaign(campaignId);
  const [research, icp] = await Promise.all([
    prisma.research.findUnique({ where: { campaignId } }),
    prisma.icp.findFirst({ where: { campaignId, isActive: true } }),
  ]);
  return { campaign, research, icp };
}
