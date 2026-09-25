import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.profileCompletedAt) {
    redirect("/profile?setup=1");
  }

  const [dueNowCount, openReplies, runsInProgress, awaitingReview, settings, latestStat] = await Promise.all([
    prisma.lead.count({
      where: {
        ownerId: user.id,
        organizationId: user.organizationId,
        OR: [{ status: "queued" }, { status: "in_cadence", nextTouchAt: { lte: new Date() } }],
      },
    }),
    prisma.reply.count({ where: { status: "open", lead: { ownerId: user.id, organizationId: user.organizationId } } }),
    prisma.leadSourceRun.count({ where: { organizationId: user.organizationId, status: "running" } }),
    prisma.lead.count({ where: { organizationId: user.organizationId, status: "inbox" } }),
    getOrgSettings(),
    prisma.dailyStat.findFirst({ where: { userId: user.id, closedOutAt: { not: null } }, orderBy: { date: "desc" } }),
  ]);

  const navItems = [
    { href: "/today", label: "Today" },
    { href: "/focus", label: "Focus", badge: dueNowCount },
    { href: "/replies", label: "Replies", badge: openReplies },
    { href: "/campaigns", label: "Campaigns" },
    { href: "/lead-generation", label: "Lead Gen", badge: runsInProgress + awaitingReview },
    { href: "/deals", label: "Deals" },
    ...(user.role === "lead" ? [{ href: "/team", label: "Team" }, { href: "/settings", label: "Settings" }] : []),
  ];

  return (
    <AppShell
      user={{ fullName: user.fullName, email: user.email, role: user.role }}
      navItems={navItems}
      streak={latestStat?.streakAfter ?? 0}
      assistantName={settings.assistantName}
    >
      {children}
    </AppShell>
  );
}
