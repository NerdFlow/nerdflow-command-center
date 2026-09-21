import { requireRole } from "@/server/auth";
import { AdminTabs } from "@/components/AdminTabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin"]);
  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Admin</h1>
      <p className="text-muted mb-5">Org-wide monitoring, users and settings.</p>
      <AdminTabs />
      <div className="mt-5">{children}</div>
    </div>
  );
}
