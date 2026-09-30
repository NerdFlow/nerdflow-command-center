import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";
import { NewCampaignForm } from "@/components/NewCampaignForm";

export default async function NewCampaignPage() {
  const user = await requireUser();
  const [products, settings, reps] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, status: "active" },
      orderBy: { name: "asc" },
    }),
    getOrgSettings(),
    user.role === "lead"
      ? prisma.user.findMany({
          where: { organizationId: user.organizationId, status: { not: "deactivated" } },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([] as { id: string; fullName: string }[]),
  ]);

  return (
    <div className="animate-fade-up max-w-cockpit">
      <div className="mb-8">
        <h1 className="page-title m-0 mb-1">New campaign</h1>
        <p className="text-muted text-sm m-0">
          One form. Optionally let {settings.assistantName} research the market, then leads start coming in — straight
          to Focus.
        </p>
      </div>
      <NewCampaignForm
        products={products.map((p) => ({ id: p.id, name: p.name, type: p.type, summary: p.summary }))}
        reps={reps}
        isLead={user.role === "lead"}
        assistantName={settings.assistantName}
      />
    </div>
  );
}
