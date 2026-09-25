import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { CampaignDetail } from "@/components/CampaignDetail";
import type { CampaignStrategy } from "@/server/strategy";

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      product: true,
      owner: true,
      notes: { orderBy: { createdAt: "desc" }, include: { author: true } },
      sourceRuns: { orderBy: { startedAt: "desc" }, take: 10 },
      knowledgeDocs: true,
      leads: { select: { id: true, status: true } },
    },
  });
  if (!campaign) notFound();

  const touchesByChannel = await prisma.touch.groupBy({
    by: ["channel", "outcome"],
    where: { organizationId: user.organizationId, lead: { campaignId: campaign.id } },
    _count: true,
  });

  const canManage = user.role === "lead" || campaign.ownerId === user.id;

  return (
    <CampaignDetail
      campaign={{
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        goal: campaign.goal,
        location: campaign.location,
        productName: campaign.product.name,
        ownerName: campaign.owner.fullName,
        strategy: campaign.strategy as unknown as CampaignStrategy,
        strategyVersion: campaign.strategyVersion,
        leadDailyCap: campaign.leadDailyCap,
        pausedReason: campaign.pausedReason,
        leadCountByStatus: campaign.leads.reduce<Record<string, number>>((acc, l) => {
          acc[l.status] = (acc[l.status] ?? 0) + 1;
          return acc;
        }, {}),
      }}
      notes={campaign.notes.map((n) => ({
        id: n.id,
        body: n.body,
        kind: n.kind,
        authorName: n.author?.fullName ?? null,
        createdAt: n.createdAt.toISOString(),
      }))}
      sourceRuns={campaign.sourceRuns.map((r) => ({
        id: r.id,
        source: r.source,
        found: r.found,
        new: r.new,
        duplicates: r.duplicates,
        startedAt: r.startedAt.toISOString(),
      }))}
      knowledgeDocs={campaign.knowledgeDocs.map((d) => ({ id: d.id, title: d.title, source: d.source }))}
      touchStats={touchesByChannel.map((t) => ({ channel: t.channel, outcome: t.outcome, count: t._count }))}
      canManage={canManage}
    />
  );
}
