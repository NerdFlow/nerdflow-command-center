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
    user.role !== "rep"
      ? await prisma.user.findMany({
          where: { organizationId: user.organizationId, status: { not: "deactivated" } },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      : [];

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">New campaign</h1>
      <p className="text-muted mb-6">
        {user.role === "rep"
          ? "This goes to your manager for approval before it goes live."
          : "This goes live immediately since you can approve your own campaigns."}
      </p>
      <Panel>
        <NewCampaignForm
          products={products.map((p) => ({ id: p.id, name: p.name }))}
          reps={reps}
          isManager={user.role !== "rep"}
        />
      </Panel>
    </div>
  );
}
