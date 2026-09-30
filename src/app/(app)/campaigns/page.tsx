import Link from "next/link";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { Chip, Btn, SectionLabel } from "@/components/ui";
import { campaignStrategySchema } from "@/server/strategy";
import { CampaignStatus } from "@prisma/client";
import { CampaignsImportSlot } from "@/components/CampaignsImportSlot";

const GROUPS: { status: CampaignStatus; label: string }[] = [
  { status: "active", label: "Live" },
  { status: "paused", label: "Paused" },
  { status: "archived", label: "Archived" },
];

function looksLikeTest(name: string, isDemo: boolean) {
  if (isDemo) return true;
  return /\b(test|demo|sandbox|gemini|scratch)\b/i.test(name);
}

export default async function CampaignsPage() {
  const user = await requireUser();
  const isManager = user.role !== "rep";

  const [campaigns, importCampaigns, reps] = await Promise.all([
    prisma.campaign.findMany({
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
    }),
    prisma.campaign.findMany({
      where: {
        organizationId: user.organizationId,
        ...(isManager ? {} : { ownerId: user.id }),
        status: { in: ["active", "draft", "paused"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, strategy: true },
    }),
    prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        status: { not: "deactivated" },
        ...(isManager ? {} : { id: user.id }),
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  return (
    <div className="animate-fade-up max-w-wide">
      <CampaignsImportSlot
        campaigns={importCampaigns.map((c) => ({
          id: c.id,
          name: c.name,
          hasIcp: campaignStrategySchema.safeParse(c.strategy).success,
        }))}
        reps={reps}
        currentUserId={user.id}
        title={
          <div>
            <h1 className="page-title m-0 mb-1">Campaigns</h1>
            <p className="text-muted text-sm m-0">Create a campaign to find leads, or import a list into one.</p>
          </div>
        }
        primaryAction={
          <Link href="/campaigns/new">
            <Btn variant="primary" size="lg">
              New campaign
            </Btn>
          </Link>
        }
      />

      {GROUPS.map((group) => {
        const items = campaigns.filter((c) => c.status === group.status);
        if (items.length === 0) return null;
        return (
          <section key={group.status} className="mb-10">
            <SectionLabel>
              {group.label} · {items.length}
            </SectionLabel>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {items.map((c) => {
                const isTest = looksLikeTest(c.name, c.isDemo);
                return (
                  <Link key={c.id} href={`/campaigns/${c.id}`} className="group">
                    <div
                      className={
                        "h-full rounded-card border px-4 py-4 transition-colors " +
                        (isTest
                          ? "border-rule/70 bg-panel/60 opacity-80 hover:opacity-100 hover:border-rule"
                          : "border-rule bg-panel hover:border-accent/40 shadow-soft")
                      }
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h3
                          className={
                            "text-[15px] font-semibold m-0 leading-snug " +
                            (isTest ? "text-muted" : "text-ink group-hover:text-accent")
                          }
                        >
                          {c.name}
                        </h3>
                        {isTest ? <Chip tone="cold">Test</Chip> : <Chip tone="acc">{c.product.name}</Chip>}
                      </div>
                      <p className="stat-number !text-2xl m-0 mb-1">{c._count.leads}</p>
                      <p className="text-xs text-dim m-0">leads · {c.owner.fullName.split(" ")[0]}</p>
                      {c.pausedReason && <p className="text-xs text-stop mt-2 mb-0">{c.pausedReason}</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {campaigns.length === 0 && (
        <div className="rounded-card border border-dashed border-rule px-6 py-12 text-center">
          <p className="text-muted m-0 mb-4">No campaigns yet. Create one, or import a list.</p>
          <Link href="/campaigns/new">
            <Btn variant="primary">New campaign</Btn>
          </Link>
        </div>
      )}
    </div>
  );
}
