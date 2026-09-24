"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

type NavItem = { href: string; label: string; badge?: number };

export function AppShell({
  user,
  navItems,
  children,
}: {
  user: { fullName: string; email: string; role: string };
  navItems: NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] min-h-screen">
      <nav className="border-b md:border-b-0 md:border-r border-rule p-3.5 md:p-5 flex md:flex-col gap-1 bg-panel overflow-x-auto md:overflow-visible sticky top-0 md:relative z-10">
        <div className="hidden md:block px-2.5 pb-5">
          <div className="font-semibold tracking-tight">NerdFlow</div>
          <div className="text-xs text-muted mt-1">Sales Command Center</div>
        </div>
        {navItems.map((item) => {
          const on = pathname === item.href || (item.href !== "/today" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm whitespace-nowrap " +
                (on ? "bg-accent-soft text-ink font-semibold shadow-[inset_3px_0_0_var(--accent)]" : "text-muted hover:bg-bg hover:text-ink")
              }
            >
              {item.label}
              {!!item.badge && (
                <span className="text-[11px] bg-accent text-on-accent rounded-full px-2 font-semibold">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
        <div className="hidden md:block mt-auto pt-3.5 border-t border-rule">
          <div className="text-sm font-medium">{user.fullName}</div>
          <div className="text-xs text-muted mb-2">{user.role}</div>
          <ThemeToggle />
          <Link
            href="/account"
            className="text-xs text-muted hover:text-ink block w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-bg"
          >
            Change password
          </Link>
          <Link
            href="/onboarding"
            className="text-xs text-muted hover:text-ink block w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-bg"
          >
            Replay onboarding tour
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-xs text-muted hover:text-ink w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-bg"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="px-4 md:px-10 py-6 md:py-8 pb-28 max-w-[1060px] w-full">{children}</main>
    </div>
  );
}
