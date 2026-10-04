import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { computeDedupeKey, ruleScore } from "@/server/leads";
import { AiUnavailableError } from "@/server/ai/client";
import { leadBusinessName } from "@/lib/leadNames";
import { pktDateStamp, queueDateAsUtc } from "@/lib/pipelineToday";
import { extractSiteContact } from "@/server/leadgen/extract";
import { scoreLead } from "@/server/leadgen/score";
import { campaignStrategySchema } from "@/server/strategy";
import { googlePlacesSource, PLACES_COST_PER_REQUEST_USD, PLACES_PAGE_SIZE } from "@/server/leadgen/sources/googlePlaces";
import type { Campaign, LeadSourceRunSchedule } from "@prisma/client";

export function queriesFor(strategy: unknown, keywordsOverride: string[]) {
  if (keywordsOverride.length > 0) return keywordsOverride;
  const parsed = campaignStrategySchema.safeParse(strategy);
  return parsed.success && parsed.data.lead_gen.search_queries.length > 0 ? parsed.data.lead_gen.search_queries : [];
}

/**
 * The actual Discover -> Extract -> Score -> Dedupe -> Stage pipeline,
 * independent of how it was triggered — a logged-in user clicking "Run now"
 * (src/server/actions/leadgen.ts) and the hourly auto-run cron
 * (src/app/api/cron/lead-gen/route.ts) both call this. Neither has to know
 * the other exists; this is the one place the pipeline itself lives.
 */
export async function executeLeadDiscoveryRun(params: {
  organizationId: string;
  actorUserId: string | null;
  campaign: Campaign;
  location: string;
  maxLeads: number;
  keywordsOverride?: string[];
  schedule?: LeadSourceRunSchedule;
}) {
  const queries = queriesFor(params.campaign.strategy, params.keywordsOverride ?? []);
  const strategy = campaignStrategySchema.safeParse(params.campaign.strategy);
  const icp = strategy.success ? strategy.data.icp : null;

  if (!googlePlacesSource.isConfigured()) {
    throw new Error("Google Places isn't configured — set GOOGLE_PLACES_API_KEY to run lead discovery.");
  }

  const run = await prisma.leadSourceRun.create({
    data: {
      organizationId: params.organizationId,
      campaignId: params.campaign.id,
      source: "google_places",
      status: "running",
      schedule: params.schedule ?? "once",
      locations: [params.location],
      keywords: queries,
      maxLeads: params.maxLeads,
      startedAt: new Date(),
      narration: params.schedule === "daily" ? "Auto-run: searching Google Places…" : "Searching Google Places for matching businesses…",
    },
  });

  let placesRequestCount = 0;
  try {
    const keywordQueries = queries.length > 0 ? queries : [params.campaign.name];
    const perQueryCap = Math.ceil(params.maxLeads / keywordQueries.length);
    const discovered: { name: string; website: string | null; phone: string | null; address: string | null; sourceUrl: string }[] = [];
    for (const query of keywordQueries) {
      if (discovered.length >= params.maxLeads) break;
      await prisma.leadSourceRun.update({ where: { id: run.id }, data: { currentKeyword: query } });
      const batch = await googlePlacesSource.discover({ query, location: params.location, maxResults: Math.min(perQueryCap, params.maxLeads - discovered.length) });
      placesRequestCount += Math.max(1, Math.ceil(batch.length / PLACES_PAGE_SIZE));
      discovered.push(...batch);
    }

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
      await prisma.leadSourceRun.update({ where: { id: run.id }, data: { currentLocation: params.location, currentKeyword: business.name } });

      const dedupeKey = computeDedupeKey({ business_name: business.name, website: business.website ?? undefined, phone: business.phone ?? undefined, city: params.location });
      const existing = await prisma.lead.findFirst({
        where: {
          organizationId: params.organizationId,
          dedupeKey,
          OR: [{ createdAt: { gte: cutoff } }, { status: "do_not_contact" }, { deals: { some: { stage: { notIn: ["won", "lost"] } } } }],
        },
      });
      if (existing) {
        duplicates += 1;
        await prisma.leadSourceRun.update({ where: { id: run.id }, data: { duplicates } });
        continue;
      }

      const site = business.website ? await extractSiteContact(business.website) : null;
      const rule = ruleScore({
        business_name: business.name,
        website: business.website ?? undefined,
        email: site?.email ?? undefined,
        phone: business.phone ?? site?.phone ?? undefined,
        instagram_url: site?.instagramUrl ?? undefined,
        linkedin_url: site?.linkedinUrl ?? undefined,
      });

      const result = icp
        ? await scoreLead({
            organizationId: params.organizationId,
            userId: params.actorUserId,
            ruleScore: rule,
            icp,
            lead: { name: business.name, website: business.website ?? "", extractedText: site?.textSample ?? "" },
          })
        : { score: rule, reasons: [], flags: ["No ICP set for this campaign yet — rule score only"], disqualified: false, source: "rules_only" as const };

      if (result.disqualified) {
        rejected += 1;
        await prisma.leadSourceRun.update({ where: { id: run.id }, data: { rejectedAuto: rejected } });
        continue;
      }

      await prisma.lead.create({
        data: {
          organizationId: params.organizationId,
          campaignId: params.campaign.id,
          ownerId: params.campaign.ownerId,
          businessName: leadBusinessName({ placesName: business.name, pageTitle: site?.title ?? null }),
          city: params.location,
          website: business.website,
          email: site?.email ?? null,
          phone: business.phone ?? site?.phone ?? null,
          instagramUrl: site?.instagramUrl ?? null,
          linkedinUrl: site?.linkedinUrl ?? null,
          source: "google_places",
          sourceUrl: business.sourceUrl,
          sourceRunId: run.id,
          fitScore: result.score,
          fitReasons: result.reasons,
          fitFlags: result.flags,
          dedupeKey,
          // Owner's queue (Focus) — no separate Lead Inbox approval step.
          status: "queued",
          nextTouchAt: new Date(),
          cadenceStartedOn: queueDateAsUtc(pktDateStamp()),
        },
      });
      created += 1;
      await prisma.leadSourceRun.update({ where: { id: run.id }, data: { new: created, enriched: created, matchedIcp: created } });
    }

    const costAgg = await prisma.aiUsage.aggregate({
      where: { organizationId: params.organizationId, createdAt: { gte: run.startedAt }, feature: "scoring" },
      _sum: { costUsd: true },
    });
    const totalCost = Number(costAgg._sum.costUsd ?? 0) + placesRequestCount * PLACES_COST_PER_REQUEST_USD;

    await prisma.leadSourceRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        narration: `${params.schedule === "daily" ? "Auto-run done" : "Done"} — ${created} new, ${duplicates} duplicates, ${rejected} rejected.`,
        costUsd: totalCost,
      },
    });

    await writeAuditLog({
      organizationId: params.organizationId,
      actorId: params.actorUserId,
      action: "lead_gen_run_completed",
      entityType: "campaign",
      entityId: params.campaign.id,
      after: { found: discovered.length, new: created, duplicates, rejected, costUsd: totalCost, placesRequestCount, auto: params.schedule === "daily" },
    });
  } catch (err) {
    const message = err instanceof AiUnavailableError ? err.message : err instanceof Error ? err.message : "unexpected error";
    await prisma.leadSourceRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: message, narration: `Failed: ${message}` },
    });
  }

  return prisma.leadSourceRun.findUniqueOrThrow({ where: { id: run.id } });
}
