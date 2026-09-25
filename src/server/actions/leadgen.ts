"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { computeDedupeKey, ruleScore } from "@/server/leads";
import { discoverBusinessesWithGemini, estimatePreCallCostUsd, AiUnavailableError } from "@/server/ai/client";
import { extractSiteContact } from "@/server/leadgen/extract";
import { scoreLead } from "@/server/leadgen/score";
import { campaignStrategySchema } from "@/server/strategy";

const MAX_LEADS_PER_RUN = 25;

const runInputSchema = z.object({
  location: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  maxLeads: z.number().int().min(1).max(MAX_LEADS_PER_RUN),
});

async function loadCampaignForRun(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId: user.organizationId } });
  if (!campaign) throw new Error("Campaign not found");
  if (user.role === "rep" && campaign.ownerId !== user.id) throw new Error("Not your campaign");
  return { user, campaign };
}

function queriesFor(strategy: unknown, keywordsOverride: string[]) {
  if (keywordsOverride.length > 0) return keywordsOverride;
  const parsed = campaignStrategySchema.safeParse(strategy);
  return parsed.success && parsed.data.lead_gen.search_queries.length > 0
    ? parsed.data.lead_gen.search_queries
    : [];
}

/** Rough estimate: one discovery call plus one fit-check call per candidate lead. Null when AI is unavailable. */
export async function estimateLeadGenRunCostUsd(campaignId: string, maxLeads: number) {
  const { campaign } = await loadCampaignForRun(campaignId);
  const queries = queriesFor(campaign.strategy, []);
  const discoveryPromptChars = 300 + queries.join("; ").length;
  const discoveryCost = estimatePreCallCostUsd(discoveryPromptChars, 800);
  if (discoveryCost === null) return null;
  const perLeadFitCheckCost = estimatePreCallCostUsd(1200, 300) ?? 0;
  return discoveryCost + perLeadFitCheckCost * maxLeads;
}

/**
 * Runs synchronously (no background worker is wired up yet — see
 * docs/CLAUDE_CODE_PHASES.md) and writes progress to the LeadSourceRun row as
 * it goes, so a future polling UI can show it live. Every candidate lands as
 * status "inbox" regardless of score — nothing here can queue or approve a
 * lead; that stays a human action in the Lead Inbox (CLAUDE.md rule 3).
 */
export async function startLeadGenRun(campaignId: string, rawInput: z.infer<typeof runInputSchema>) {
  const input = runInputSchema.parse(rawInput);
  const { user, campaign } = await loadCampaignForRun(campaignId);
  const queries = queriesFor(campaign.strategy, input.keywords);
  const strategy = campaignStrategySchema.safeParse(campaign.strategy);
  const icp = strategy.success ? strategy.data.icp : null;

  const run = await prisma.leadSourceRun.create({
    data: {
      organizationId: user.organizationId,
      campaignId,
      source: "ai_search",
      status: "running",
      locations: [input.location],
      keywords: queries,
      maxLeads: input.maxLeads,
      startedAt: new Date(),
      narration: "Searching Google for matching businesses…",
    },
  });

  try {
    const discovered = await discoverBusinessesWithGemini({
      organizationId: user.organizationId,
      userId: user.id,
      queries: queries.length > 0 ? queries : [campaign.name],
      location: input.location,
      maxResults: input.maxLeads,
    });

    await prisma.leadSourceRun.update({
      where: { id: run.id },
      data: { found: discovered.length, narration: `Found ${discovered.length} candidates — checking each website…` },
    });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    let created = 0;
    let duplicates = 0;
    let rejected = 0;

    for (const business of discovered) {
      await prisma.leadSourceRun.update({ where: { id: run.id }, data: { currentLocation: input.location, currentKeyword: business.name } });

      const dedupeKey = computeDedupeKey({ business_name: business.name, website: business.website, city: input.location });
      const existing = await prisma.lead.findFirst({
        where: {
          organizationId: user.organizationId,
          dedupeKey,
          OR: [{ createdAt: { gte: cutoff } }, { status: "do_not_contact" }, { deals: { some: { stage: { notIn: ["won", "lost"] } } } }],
        },
      });
      if (existing) {
        duplicates += 1;
        await prisma.leadSourceRun.update({ where: { id: run.id }, data: { duplicates } });
        continue;
      }

      const site = await extractSiteContact(business.website);
      const rule = ruleScore({
        business_name: business.name,
        website: business.website,
        email: site?.email ?? undefined,
        phone: site?.phone ?? undefined,
        instagram_url: site?.instagramUrl ?? undefined,
        linkedin_url: site?.linkedinUrl ?? undefined,
      });

      const result = icp
        ? await scoreLead({
            organizationId: user.organizationId,
            userId: user.id,
            ruleScore: rule,
            icp,
            lead: { name: business.name, website: business.website, extractedText: site?.textSample ?? "" },
          })
        : { score: rule, reasons: [], flags: ["No ICP set for this campaign yet — rule score only"], disqualified: false, source: "rules_only" as const };

      if (result.disqualified) {
        rejected += 1;
        await prisma.leadSourceRun.update({ where: { id: run.id }, data: { rejectedAuto: rejected } });
        continue;
      }

      await prisma.lead.create({
        data: {
          organizationId: user.organizationId,
          campaignId,
          ownerId: campaign.ownerId,
          businessName: site?.title || business.name,
          city: input.location,
          website: business.website,
          email: site?.email ?? null,
          phone: site?.phone ?? null,
          instagramUrl: site?.instagramUrl ?? null,
          linkedinUrl: site?.linkedinUrl ?? null,
          source: "ai_search",
          sourceUrl: business.sourceUrl,
          sourceRunId: run.id,
          fitScore: result.score,
          fitReasons: result.reasons,
          fitFlags: result.flags,
          dedupeKey,
          status: "inbox",
        },
      });
      created += 1;
      await prisma.leadSourceRun.update({ where: { id: run.id }, data: { new: created, enriched: created, matchedIcp: created } });
    }

    const costAgg = await prisma.aiUsage.aggregate({
      where: { organizationId: user.organizationId, createdAt: { gte: run.startedAt }, feature: { in: ["lead_discovery", "scoring"] } },
      _sum: { costUsd: true },
    });

    await prisma.leadSourceRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        narration: `Done — ${created} new, ${duplicates} duplicates, ${rejected} rejected.`,
        costUsd: costAgg._sum.costUsd ?? 0,
      },
    });

    await writeAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "lead_gen_run_completed",
      entityType: "campaign",
      entityId: campaignId,
      after: { found: discovered.length, new: created, duplicates, rejected, costUsd: Number(costAgg._sum.costUsd ?? 0) },
    });
  } catch (err) {
    const message = err instanceof AiUnavailableError ? err.message : err instanceof Error ? err.message : "unexpected error";
    await prisma.leadSourceRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: message, narration: `Failed: ${message}` },
    });
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/lead-generation");
  revalidatePath("/leads");
  return getLeadGenRun(run.id);
}

export async function getLeadGenRun(runId: string) {
  const user = await requireUser();
  const run = await prisma.leadSourceRun.findFirst({ where: { id: runId, organizationId: user.organizationId } });
  if (!run) throw new Error("Run not found");
  return run;
}
