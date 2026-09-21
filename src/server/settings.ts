import { cache } from "react";
import { prisma } from "@/server/db";
import { getDefaultOrgId } from "@/server/org";

export const getOrgSettings = cache(async () => {
  const organizationId = await getDefaultOrgId();
  let settings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  if (!settings) {
    settings = await prisma.orgSettings.create({
      data: {
        organizationId,
        allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN || "example.com",
      },
    });
  }
  return settings;
});
