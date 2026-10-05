import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getSessionActor } from "@/server/auth";
import { AppShell, type NavItem } from "@/components/AppShell";
import { ShellExtras } from "@/components/ShellExtras";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, actor] = await Promise.all([getCurrentUser(), getSessionActor()]);
  if (!user) redirect("/login");

  if (!user.profileCompletedAt) {
    redirect("/profile?setup=1");
  }

  const navItems: NavItem[] = [
    { href: "/today", label: "Today", group: "work" },
    { href: "/focus", label: "Focus", group: "work" },
    { href: "/replies", label: "Replies", group: "work" },
    { href: "/campaigns", label: "Campaigns", group: "pipeline" },
    { href: "/deals", label: "Deals", group: "pipeline" },
    { href: "/whats-working", label: "What's Working", group: "pipeline" },
    { href: "/knowledge", label: "Knowledge", group: "pipeline" },
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
      impersonating={!!actor && actor.id !== user.id}
      extras={
        <Suspense fallback={null}>
          <ShellExtras userId={user.id} organizationId={user.organizationId} />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
