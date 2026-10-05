import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parseOutreachKbFiles } from "../src/server/kb/parseOutreachKb";

/** Replace imported KB rows for this org. Re-running seed refreshes the import and the product-truth locks. */
export async function seedOutreachKb(prisma: PrismaClient, organizationId: string) {
  const dir = path.join(process.cwd(), "outreach-kb");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({
      path: `outreach-kb/${name}`,
      markdown: readFileSync(path.join(dir, name), "utf8"),
    }));
  const entries = parseOutreachKbFiles(files);
  await prisma.outreachKbEntry.deleteMany({
    where: { organizationId, sourcePath: { startsWith: "outreach-kb/" } },
  });
  await prisma.outreachKbEntry.createMany({
    data: entries.map((entry) => ({
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
  return entries.length;
}
