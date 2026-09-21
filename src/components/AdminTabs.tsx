"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/pipeline", label: "Pipeline" },
  { href: "/admin/lead-engine", label: "Lead engine" },
  { href: "/admin/ai", label: "AI" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/audit-log", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-rule overflow-x-auto">
      {SECTIONS.map((s) => {
        const on = pathname === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={
              "px-3 py-2.5 text-sm whitespace-nowrap border-b-2 " +
              (on ? "border-accent text-ink font-semibold" : "border-transparent text-muted")
            }
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
