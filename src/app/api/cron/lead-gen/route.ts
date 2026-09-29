import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { isUnderAiBudget } from "@/server/ai/client";
import { executeLeadDiscoveryRun } from "@/server/leadgen/run";
import { googlePlacesSource } from "@/server/leadgen/sources/googlePlaces";
import type { LeadStatus } from "@prisma/client";

const READY_STATUSES: LeadStatus[] = ["inbox", "queued", "in_cadence"];
const READY_THRESHOLD = 50;
const AUTO_RUN_SIZE = 50;

/**
 * Hourly auto-run (Step 4): a cron job hits this with a bearer token and it
 * starts a Places run for any live campaign with fewer than 50 leads ready.
 * Max one auto-run per campaign per day, gated on the org's AI budget
 * before spending anything (not just left to fail mid-run), tagged
 * schedule "daily" so it's distinguishable from a manual "Run now".
 *
 * This process has no system crontab access, so nothing schedules this on
 * its own — add a line like the following to the VPS's crontab:
 *   0 * * * * curl -s -X POST https://<host>/api/cron/lead-gen \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 501 });
  if (req.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const campaigns = await prisma.campaign.findMany({ where: { status: "active" } });
  const results: { campaignId: string; campaignName: string; action: string }[] = [];

  for (const campaign of campaigns) {
    if (!googlePlacesSource.isConfigured()) {
      results.push({ campaignId: campaign.id, campaignName: campaign.name, action: "skipped: Places not configured" });
      continue;
    }

    const alreadyRanToday = await prisma.leadSourceRun.findFirst({
      where: { campaignId: campaign.id, schedule: "daily", startedAt: { gte: todayStart } },
    });
    if (alreadyRanToday) {
      results.push({ campaignId: campaign.id, campaignName: campaign.name, action: "skipped: already auto-ran today" });
      continue;
    }

    const readyCount = await prisma.lead.count({ where: { campaignId: campaign.id, status: { in: READY_STATUSES } } });
    if (readyCount >= READY_THRESHOLD) {
      results.push({ campaignId: campaign.id, campaignName: campaign.name, action: `skipped: ${readyCount} already ready` });
      continue;
    }

    if (!(await isUnderAiBudget(campaign.organizationId))) {
      results.push({ campaignId: campaign.id, campaignName: campaign.name, action: "skipped: AI budget reached" });
      continue;
    }

    if (!campaign.location) {
      results.push({ campaignId: campaign.id, campaignName: campaign.name, action: "skipped: no location set on campaign" });
      continue;
    }

    // Not awaited: a full discovery run (Places pagination + per-lead AI
    // scoring) can take minutes, well past the reverse proxy's request
    // timeout. This process is a persistent systemd service (not
    // serverless), so the detached run keeps executing after the response
    // is sent - same pattern as backgroundEnrichImportedLeads.
    const location = campaign.location;
    executeLeadDiscoveryRun({
      organizationId: campaign.organizationId,
      actorUserId: null,
      campaign,
      location,
      maxLeads: AUTO_RUN_SIZE,
      schedule: "daily",
    }).catch((err) => {
      console.error(`[cron/lead-gen] campaign ${campaign.id} failed:`, err instanceof Error ? err.message : err);
    });
    results.push({ campaignId: campaign.id, campaignName: campaign.name, action: "started" });
  }

  return NextResponse.json({ checked: campaigns.length, results });
}
