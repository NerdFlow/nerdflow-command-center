import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parseOutreachKbFiles } from "../src/server/kb/parseOutreachKb";
import {
  outreachKbLoadResult,
  planOutreachKbSync,
  type ExistingKbRow,
  type OutreachKbLoadResult,
} from "../src/server/kb/syncOutreachKb";

/**
 * Refresh imported KB rows for one org.
 * New keys are inserted. Existing keys get new markdown content, and their status stays.
 * Keys that are not in the files (an approval side-path, or a later learning) are not deleted.
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
  const existing = await prisma.outreachKbEntry.findMany({ where: { organizationId } });
  const plan = planOutreachKbSync(existing.map(toExisting), entries);

  if (plan.create.length > 0) {
    await prisma.outreachKbEntry.createMany({
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

  if (plan.update.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const item of plan.update) {
          await tx.outreachKbEntry.update({
            where: { organizationId_key: { organizationId, key: item.key } },
            data: {
              layer: item.entry.layer,
              kind: item.entry.kind,
              icp: item.entry.icp,
              scope: item.entry.scope,
              title: item.entry.title,
              body: item.entry.body,
              payload: item.entry.payload as Prisma.InputJsonValue,
              sourcePath: item.entry.sourcePath,
              sourceLink: item.entry.sourceLink,
              version: item.entry.version,
            },
          });
        }
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  }

  return outreachKbLoadResult(plan);
}

function toExisting(row: {
  key: string;
  status: string;
  updatedById: string | null;
  layer: string;
  kind: string;
  icp: string | null;
  scope: string;
  title: string;
  body: string;
  payload: unknown;
  sourcePath: string;
  sourceLink: string | null;
  version: number;
}): ExistingKbRow {
  return row;
}
