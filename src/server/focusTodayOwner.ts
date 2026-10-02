import { prisma } from "@/server/db";
import { focusTodayOwnerCandidates, pickFocusTodayOwner } from "@/lib/pipelineToday";

export async function resolveFocusTodayOwner(organizationId: string) {
  const settings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  const domain = settings?.allowedEmailDomain || process.env.ALLOWED_EMAIL_DOMAIN || "nerdflow.tech";
  const candidates = focusTodayOwnerCandidates(domain, process.env.FOCUS_TODAY_OWNER_EMAIL);
  const users = await prisma.user.findMany({
    where: { organizationId, status: { not: "deactivated" } },
    select: { id: true, email: true, fullName: true, role: true, organizationId: true },
  });
  return pickFocusTodayOwner(users, candidates);
}
