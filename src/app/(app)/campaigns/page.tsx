import Link from "next/link";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel, Chip, Btn } from "@/components/ui";
import { CampaignStatus } from "@prisma/client";

const GROUPS: { status: CampaignStatus; label: string }[] = [
  { status: "pending_approval", label: "Pending approval" },
  { status: "active", label: "Active" },
  { status: "paused", label: "Paused" },
  { status: "archived", label: "Archived" },
];

export default async function CampaignsPage() {
  const user = await requireUser();
  const isManager = user.role !== "rep";

  const campaigns = await prisma.campaign.findMany({
    where: {
      organizationId: user.organizationId,
      ...(isManager ? {} : { ownerId: user.id }),
      status: { not: "draft" },
    },
    include: {
      product: true,
      owner: true,
      _count: { select: { leads: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-[28px] tracking-tight mb-1.5">Campaigns</h1>
          <p className="text-muted m-0">Every outreach effort, grouped by status.</p>
        </div>
        <Link href="/campaigns/new">
          <Btn variant="primary">New campaign</Btn>
        </Link>
      </div>

      {GROUPS.map((group) => {
        const items = campaigns.filter((c) => c.status === group.status);
        if (items.length === 0) return null;
        return (
          <div key={group.status} className="mb-7">
            <h2 className="text-[17px] font-medium mb-3">
              {group.label} <span className="text-muted font-normal">({items.length})</span>
            </h2>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
              {items.map((c) => (
                <Link key={c.id} href={`/campaigns/${c.id}`}>
                  <Panel className="hover:border-accent h-full">
                    <div className="flex justify-between items-start mb-1.5">
                      <h3 className="text-[15px] font-medium m-0">{c.name}</h3>
                      <Chip tone="acc">{c.product.name}</Chip>
                    </div>
                    <p className="text-xs text-muted mb-2">Owner: {c.owner.fullName}</p>
                    <p className="text-sm text-muted">{c._count.leads} leads</p>
                    {c.pausedReason && <p className="text-xs text-stop mt-1.5">{c.pausedReason}</p>}
                  </Panel>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {campaigns.length === 0 && (
        <Panel>
          <p className="text-muted">No campaigns yet. Create one to start generating a playbook and a lead queue.</p>
        </Panel>
      )}
    </div>
  );
}
