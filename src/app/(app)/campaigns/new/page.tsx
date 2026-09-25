import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { NewCampaignForm } from "@/components/NewCampaignForm";
import { Panel } from "@/components/ui";

export default async function NewCampaignPage() {
  const user = await requireUser();
  const products = await prisma.product.findMany({
    where: { organizationId: user.organizationId, status: "active" },
    orderBy: { name: "asc" },
  });
  const reps =
    user.role === "lead"
      ? await prisma.user.findMany({
          where: { organizationId: user.organizationId, status: { not: "deactivated" } },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      : [];

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">New campaign</h1>
      <p className="text-muted mb-6">Flow drafts the playbook from your product description — goes live immediately, edit anything after.</p>
      <Panel>
        <NewCampaignForm
          products={products.map((p) => ({ id: p.id, name: p.name, type: p.type, summary: p.summary }))}
          reps={reps}
          isLead={user.role === "lead"}
        />
      </Panel>
    </div>
  );
}
