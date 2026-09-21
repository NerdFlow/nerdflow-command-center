import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const [inboxCount, pendingApprovals] = await Promise.all([
    prisma.lead.count({ where: { ownerId: user.id, status: "inbox" } }),
    user.role === "rep"
      ? Promise.resolve(0)
      : prisma.campaign.count({ where: { organizationId: user.organizationId, status: "pending_approval" } }),
  ]);

  const navItems = [
    { href: "/today", label: "Today" },
    { href: "/focus", label: "Focus" },
    { href: "/leads", label: "Lead Inbox", badge: inboxCount },
    { href: "/campaigns", label: "Campaigns", badge: pendingApprovals },
    { href: "/deals", label: "Deals" },
    { href: "/close-out", label: "Close out" },
    ...(user.role !== "rep" ? [{ href: "/scoreboard", label: "Scoreboard" }] : []),
    ...(user.role === "manager" ? [{ href: "/team", label: "Team" }] : []),
    ...(user.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <AppShell user={{ fullName: user.fullName, email: user.email, role: user.role }} navItems={navItems}>
      {children}
    </AppShell>
  );
}
