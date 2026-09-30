import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";
import { AppShell, type NavItem } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.profileCompletedAt) {
    redirect("/profile?setup=1");
  }

  const [dueNowCount, openReplies, oldestOpenReply, settings, latestStat] = await Promise.all([
    prisma.lead.count({
      where: {
        ownerId: user.id,
        organizationId: user.organizationId,
        OR: [{ status: "queued" }, { status: "in_cadence", nextTouchAt: { lte: new Date() } }],
      },
    }),
    prisma.reply.count({ where: { status: "open", lead: { ownerId: user.id, organizationId: user.organizationId } } }),
    prisma.reply.findFirst({
      where: { status: "open", lead: { ownerId: user.id, organizationId: user.organizationId } },
      orderBy: { receivedAt: "asc" },
      select: { receivedAt: true },
    }),
    getOrgSettings(),
    prisma.dailyStat.findFirst({ where: { userId: user.id, closedOutAt: { not: null } }, orderBy: { date: "desc" } }),
  ]);

  const replyAgeHours = oldestOpenReply
    ? (Date.now() - new Date(oldestOpenReply.receivedAt).getTime()) / (1000 * 60 * 60)
    : 0;
  const repliesUrgent = openReplies > 0 && replyAgeHours >= 24;

  const navItems: NavItem[] = [
    { href: "/today", label: "Today", group: "work" },
    { href: "/focus", label: "Focus", badge: dueNowCount, group: "work" },
    {
      href: "/replies",
      label: "Replies",
      badge: openReplies,
      badgeTone: repliesUrgent ? "stop" : openReplies > 0 ? "warm" : "accent",
      group: "work",
    },
    { href: "/campaigns", label: "Campaigns", group: "pipeline" },
    { href: "/deals", label: "Deals", group: "pipeline" },
    { href: "/whats-working", label: "What's Working", group: "pipeline" },
    ...(user.role === "lead"
      ? ([
          { href: "/team", label: "Team", group: "admin" },
          { href: "/settings", label: "Settings", group: "admin" },
        ] as NavItem[])
      : []),
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
