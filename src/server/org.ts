import { cache } from "react";
import { prisma } from "@/server/db";

/**
 * This build is single-tenant (one company running its own instance), even
 * though every table carries organization_id for a future multi-org split.
 * `cache()` de-dupes the lookup within one request/render pass.
 */
export const getDefaultOrg = cache(async () => {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    throw new Error("No organization found — run `npm run seed` first.");
  }
  return org;
});

export const getDefaultOrgId = cache(async () => (await getDefaultOrg()).id);
