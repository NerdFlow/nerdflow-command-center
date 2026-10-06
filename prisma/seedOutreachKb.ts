import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parseOutreachKbFiles } from "../src/server/kb/parseOutreachKb";
import { outreachKbLoadResult, planOutreachKbSync, type OutreachKbLoadResult } from "../src/server/kb/syncOutreachKb";

/**
 * Insert outreach KB rows whose key is not already stored.
 * Never updates or deletes. The app is the source of truth after import.
 */
export async function seedOutreachKb(prisma: PrismaClient, organizationId: string): Promise<OutreachKbLoadResult> {
  const dir = path.join(process.cwd(), "outreach-kb");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({
      path: `outreach-kb/${name}`,
      markdown: readFileSync(path.join(dir, name), "utf8"),
    }));
  const entries = parseOutreachKbFiles(files);
  const existing = await prisma.outreachKbEntry.findMany({
    where: { organizationId },
    select: { key: true },
  });
  const plan = planOutreachKbSync(existing, entries);

  if (plan.create.length > 0) {
    await prisma.outreachKbEntry.createMany({
      skipDuplicates: true,
      data: plan.create.map((entry) => ({
        organizationId,
        layer: entry.layer,
        kind: entry.kind,
        icp: entry.icp,
        scope: entry.scope,
        status: entry.status,
        key: entry.key,
        title: entry.title,
        body: entry.body,
        payload: entry.payload as Prisma.InputJsonValue,
        sourcePath: entry.sourcePath,
        sourceLink: entry.sourceLink,
        version: entry.version,
      })),
    });
  }

  return outreachKbLoadResult(plan);
}
