"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FlowPanel } from "@/components/FlowPanel";
import { BrandMark, BrandWordmark } from "@/components/BrandLogo";
import { useNavPending } from "@/components/NavigationProgress";

export type ShellExtrasData = {
  dueNowCount: number;
  openReplies: number;
  repliesUrgent: boolean;
  streak: number;
  assistantName: string;
};

const ShellExtrasContext = createContext<(data: ShellExtrasData) => void>(() => {});

export function useReportShellExtras() {
  return useContext(ShellExtrasContext);
}

export type NavItem = {
  href: string;
  label: string;
  badge?: number;
  badgeTone?: "accent" | "stop" | "warm";
  group: "work" | "pipeline" | "admin";
};

const GROUP_LABEL: Record<NavItem["group"], string> = {
  work: "Your day",
  pipeline: "Pipeline",
  admin: "Team",
};

function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "manager" || role === "lead") return "Manager";
  return "Rep";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)).toUpperCase();
}

export function AppShell({
  user,
  navItems,
  extras,
  children,
}: {
  user: { fullName: string; email: string; role: string };
  navItems: NavItem[];
  extras?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { pendingHref } = useNavPending();
  const isFocusMode = pathname.startsWith("/focus");
  const [menuOpen, setMenuOpen] = useState(false);
  const [shellExtras, setShellExtras] = useState<ShellExtrasData | null>(null);
  const reportExtras = useCallback((next: ShellExtrasData) => {
    setShellExtras((prev) => {
      if (
        prev &&
        prev.dueNowCount === next.dueNowCount &&
        prev.openReplies === next.openReplies &&
        prev.repliesUrgent === next.repliesUrgent &&
        prev.streak === next.streak &&
        prev.assistantName === next.assistantName
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const streak = shellExtras?.streak ?? 0;
  const assistantName = shellExtras?.assistantName ?? "Flow";
  const liveNav = navItems.map((item) => {
    if (!shellExtras) return item;
    if (item.href === "/focus") return { ...item, badge: shellExtras.dueNowCount };
    if (item.href === "/replies") {
      return {
        ...item,
        badge: shellExtras.openReplies,
        badgeTone: shellExtras.repliesUrgent ? ("stop" as const) : shellExtras.openReplies > 0 ? ("warm" as const) : ("accent" as const),
      };
    }
    return item;
  });

  if (isFocusMode) {
    return (
      <ShellExtrasContext.Provider value={reportExtras}>
        {extras}
        <div className="min-h-screen app-atmosphere flex flex-col">
        <div className="flex items-center justify-between px-4 md:px-8 py-3 border-b border-rule bg-panel/80 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark className="h-5 w-auto shrink-0" size={20} />
            <span className="text-sm text-dim truncate">
              <span className="text-ink font-medium">Focus</span>
            </span>
          </div>
          <Link
            href="/today"
            className={
              "text-sm transition-colors inline-flex items-center gap-1.5 " +
              (pendingHref === "/today" ? "text-accent" : "text-muted hover:text-ink")
            }
          >
            {pendingHref === "/today" && (
              <span className="btn-spinner inline-block w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full" />
            )}
            Exit Focus
          </Link>
        </div>
        <main className="w-full flex-1 flex flex-col min-h-0">
          {children}
        </main>
        </div>
      </ShellExtrasContext.Provider>
    );
  }

  const groups: NavItem["group"][] = ["work", "pipeline", "admin"];
  const grouped = groups
    .map((g) => ({ group: g, items: liveNav.filter((i) => i.group === g) }))
    .filter((g) => g.items.length > 0);

  return (
    <ShellExtrasContext.Provider value={reportExtras}>
      {extras}
      <div className="grid grid-cols-1 md:grid-cols-[232px_1fr] min-h-screen app-atmosphere">
      <nav className="border-b md:border-b-0 md:border-r border-rule bg-panel/90 backdrop-blur-sm md:bg-panel sticky top-0 z-20 md:h-screen md:flex md:flex-col">
        <div className="flex md:flex-col gap-1 p-3 md:p-4 overflow-x-auto md:overflow-y-auto md:flex-1">
          <div className="hidden md:block px-1 pb-5 pt-1">
            <Link href="/today" className="inline-flex">
              <BrandWordmark className="h-7 w-auto max-w-[168px]" />
            </Link>
            <div className="text-[10px] text-dim mt-2 px-0.5 tracking-wide uppercase">Sales cockpit</div>
          </div>
          <div className="md:hidden flex items-center gap-2 px-1 mr-2 shrink-0">
            <BrandMark className="h-6 w-auto" size={24} />
          </div>

          {grouped.map(({ group, items }) => (
            <div key={group} className="contents md:block md:mb-4">
              <p className="hidden md:block section-label px-2.5 mb-1.5">{GROUP_LABEL[group]}</p>
              {items.map((item) => {
                const on = pathname === item.href || (item.href !== "/today" && pathname.startsWith(item.href));
                const pending =
                  pendingHref === item.href ||
                  (pendingHref != null && item.href !== "/today" && pendingHref.startsWith(item.href));
                const badgeTone =
                  item.badgeTone === "stop"
                    ? "bg-stop text-on-accent"
                    : item.badgeTone === "warm"
                      ? "bg-warm text-on-accent"
                      : "bg-accent text-on-accent";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    aria-busy={pending || undefined}
                    className={
                      "flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-sm whitespace-nowrap transition-all duration-150 active:scale-[0.98] " +
                      (pending
                        ? "bg-accent-soft text-ink font-semibold ring-1 ring-accent/35"
                        : on
                          ? "bg-accent-soft text-ink font-semibold md:shadow-[inset_3px_0_0_var(--accent)]"
                          : "text-muted hover:bg-bg hover:text-ink")
                    }
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      {pending && (
                        <span
                          className="btn-spinner inline-block w-3 h-3 shrink-0 border-2 border-accent/25 border-t-accent rounded-full"
                          aria-hidden
                        />
                      )}
                      {item.label}
                    </span>
                    {!!item.badge && item.badge > 0 && (
                      <span className={"text-[11px] rounded-full px-1.5 min-w-[1.25rem] text-center font-semibold " + badgeTone}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden md:block p-3 border-t border-rule space-y-2">
          {streak > 0 && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
              <span className="text-warm font-semibold tabular-nums">{streak}</span>
              <span className="text-dim text-xs">day streak</span>
            </div>
          )}

          <div className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex-1 flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-bg transition-colors active:scale-[0.98] text-left min-w-0"
            >
              <span className="w-8 h-8 rounded-full bg-accent-soft border border-accent/25 flex items-center justify-center text-[11px] font-bold text-accent shrink-0">
                {initials(user.fullName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{user.fullName.split(" ")[0]}</span>
                <span className="block text-[11px] text-dim">{roleLabel(user.role)}</span>
              </span>
            </button>
            <ThemeToggle compact />

            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
                <div className="absolute bottom-full left-0 right-0 mb-1 z-40 bg-panel border border-rule rounded-xl shadow-lift p-1.5 animate-fade-up">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm px-3 py-2 rounded-lg text-muted hover:text-ink hover:bg-bg"
                  >
                    Profile
                  </Link>
                  <Link
                    href="/account"
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm px-3 py-2 rounded-lg text-muted hover:text-ink hover:bg-bg"
                  >
                    Change password
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg text-muted hover:text-ink hover:bg-bg"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="min-w-0 flex flex-col min-h-screen">
        <main className="px-4 md:px-10 py-6 md:py-9 pb-24 md:pb-28 max-w-cockpit lg:max-w-wide w-full flex-1">
          {children}
        </main>
        <FlowPanel assistantName={assistantName} />
      </div>
      </div>
    </ShellExtrasContext.Provider>
  );
}
