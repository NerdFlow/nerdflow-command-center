"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { estimatePreCallCostUsd } from "@/server/ai/client";
import { executeLeadDiscoveryRun, queriesFor } from "@/server/leadgen/run";
import { googlePlacesSource, PLACES_COST_PER_REQUEST_USD, PLACES_PAGE_SIZE } from "@/server/leadgen/sources/googlePlaces";

const MAX_LEADS_PER_RUN = 1000;

const runInputSchema = z.object({
  location: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  maxLeads: z.number().int().min(1).max(MAX_LEADS_PER_RUN),
});

function failedResult(error: string) {
  return { status: "failed" as const, found: 0, new: 0, duplicates: 0, rejectedAuto: 0, narration: null, error, costUsd: 0 };
}

async function loadCampaignForRun(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId: user.organizationId } });
  if (!campaign) throw new Error("Campaign not found");
  if (user.role === "rep" && campaign.ownerId !== user.id) throw new Error("Not your campaign");
  return { user, campaign };
}

/** Rough estimate: Places Text Search requests (paginated) plus one Flash-Lite fit-check per candidate lead. Null when neither is usable. */
export async function estimateLeadGenRunCostUsd(campaignId: string, maxLeads: number) {
  const { campaign } = await loadCampaignForRun(campaignId);
  const queries = queriesFor(campaign.strategy, []);
  const queryCount = Math.max(queries.length, 1);
  const perQueryLeads = Math.ceil(maxLeads / queryCount);
  const pagesPerQuery = Math.min(3, Math.ceil(perQueryLeads / PLACES_PAGE_SIZE));
  const placesCost = googlePlacesSource.isConfigured() ? queryCount * pagesPerQuery * PLACES_COST_PER_REQUEST_USD : null;

  const perLeadFitCheckCost = estimatePreCallCostUsd(1200, 300, process.env.AI_MODEL_FAST);
  if (placesCost === null && perLeadFitCheckCost === null) return null;
  return (placesCost ?? 0) + (perLeadFitCheckCost ?? 0) * maxLeads;
}

/**
 * Runs synchronously (no background worker is wired up yet) and writes
 * progress to the LeadSourceRun row as it goes, so a future polling UI can
 * show it live. Every candidate lands as status "inbox" regardless of
 * score — nothing here can queue or approve a lead; that stays a human
 * action in the Lead Inbox (CLAUDE.md rule 3).
 *
 * Returns a plain result object for every outcome, including input
 * validation and permission failures, instead of throwing — Next.js
 * redacts thrown Server Action errors in production builds, so throwing
 * here would silently become an unreadable generic message on the client.
 */
export async function startLeadGenRun(campaignId: string, rawInput: z.infer<typeof runInputSchema>) {
  const parsedInput = runInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return failedResult(parsedInput.error.issues[0]?.message ?? "Invalid input.");
  }
  const input = parsedInput.data;

  let user, campaign;
  try {
    ({ user, campaign } = await loadCampaignForRun(campaignId));
  } catch (err) {
    return failedResult(err instanceof Error ? err.message : "Couldn't load this campaign.");
  }

  let run;
  try {
    run = await executeLeadDiscoveryRun({
      organizationId: user.organizationId,
      actorUserId: user.id,
      campaign,
      location: input.location,
      maxLeads: input.maxLeads,
      keywordsOverride: input.keywords,
    });
  } catch (err) {
    return failedResult(err instanceof Error ? err.message : "Couldn't start the run.");
  }

  try {
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/lead-generation");
    revalidatePath("/leads");
  } catch {
    // best-effort — the run itself already completed
  }
  return run;
}

export async function getLeadGenRun(runId: string) {
  const user = await requireUser();
  const run = await prisma.leadSourceRun.findFirst({ where: { id: runId, organizationId: user.organizationId } });
  if (!run) throw new Error("Run not found");
  return run;
}
