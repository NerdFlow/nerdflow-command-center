import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { applyPipelineTodaySync } from "@/server/pipelineTodaySync";
import { readPipelineTodayGrid, sheetsConfigStatus } from "@/server/googleSheets";

/**
 * Weekday Today-tab sync, about five minutes after the Sales Pipeline rebuild
 * at 15:26 Asia/Karachi (10:26 UTC). GitHub cron is 10:31 UTC, Monday–Friday:
 *   31 10 * * 1-5
 *
 * Nothing is sent. Cards are routed from each rep's channels. If Sheets
 * credentials are missing the job skips instead of failing.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 501 });
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sheets = sheetsConfigStatus();
  if (!sheets.configured) {
    return NextResponse.json({ ok: true, skipped: true, reason: sheets.reason });
  }

  const read = await readPipelineTodayGrid();
  if (!read.ok) return NextResponse.json({ ok: false, error: read.reason }, { status: 502 });

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const results: { organizationId: string; open?: number; error?: string }[] = [];
  for (const org of orgs) {
    const actor = await prisma.user.findFirst({
      where: { organizationId: org.id, status: { not: "deactivated" }, role: "lead" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!actor) {
      results.push({ organizationId: org.id, error: "No lead to record the sync" });
      continue;
    }
    try {
      const summary = await applyPipelineTodaySync({
        organizationId: org.id,
        actorId: actor.id,
        source: "sheets",
        grid: read.grid,
      });
      results.push({ organizationId: org.id, open: summary.open });
    } catch (err) {
      console.error(`[cron/pipeline-today] org ${org.id} failed`);
      results.push({ organizationId: org.id, error: err instanceof Error ? err.message : "sync failed" });
    }
  }

  const failed = results.some((result) => result.error);
  return NextResponse.json({ ok: !failed, results }, { status: failed ? 500 : 200 });
}
