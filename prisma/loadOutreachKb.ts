import { PrismaClient } from "@prisma/client";
import { seedOutreachKb } from "./seedOutreachKb";
import { chooseOutreachKbOrg, databaseUrlForKbLoad, formatOutreachKbLoadLine } from "../src/server/kb/syncOutreachKb";

/**
 * Deploy entrypoint. Loads outreach KB rows for the existing NerdFlow org.
 * Does not create users, leads, or organizations.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. The deploy script should source the app .env first.");
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrlForKbLoad(databaseUrl) } },
  });
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    const choice = chooseOutreachKbOrg(orgs);
    if (!choice.ok) throw new Error(choice.reason);
    const result = await seedOutreachKb(prisma, choice.org.id);
    console.log(formatOutreachKbLoadLine(choice.org, result));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ERROR: Outreach KB load failed: ${message}`);
  process.exitCode = 1;
});
