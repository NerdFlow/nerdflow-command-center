import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { computeHealth, computeFlags } from "@/server/deals";
import { DealDetail } from "@/components/DealDetail";

export default async function DealPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: { lead: true, people: true, product: true, owner: true },
  });
  if (!deal) notFound();

  const [touches, conversations] = await Promise.all([
    prisma.touch.findMany({ where: { dealId: deal.id }, orderBy: { occurredAt: "desc" } }),
    prisma.conversation.findMany({ where: { dealId: deal.id }, orderBy: { occurredAt: "desc" }, include: { review: true } }),
  ]);

  const flags = computeFlags({
    stage: deal.stage,
    lastActivityAt: deal.updatedAt,
    nextStepAt: deal.nextStepAt,
    people: deal.people,
  });
  const health = computeHealth(deal.stage, (deal.checklist as Record<string, boolean>) ?? {}, flags.length);

  const canEdit = user.role !== "rep" || deal.ownerId === user.id;

  return (
    <DealDetail
      deal={{
        id: deal.id,
        businessName: deal.lead.businessName,
        productName: deal.product.name,
        ownerName: deal.owner.fullName,
        stage: deal.stage,
        checklist: (deal.checklist as Record<string, boolean>) ?? {},
        nextStepText: deal.nextStepText,
        nextStepAt: deal.nextStepAt ? deal.nextStepAt.toISOString() : null,
        valueMonthlyUsd: deal.valueMonthlyUsd ? Number(deal.valueMonthlyUsd) : null,
        signals: deal.signals as { intent?: string; urgency?: string; mood?: string; note?: string },
        nextBestAction: deal.nextBestAction,
        people: deal.people.map((p) => ({ id: p.id, name: p.name, role: p.role, isDecisionMaker: p.isDecisionMaker, met: p.met })),
      }}
      health={health}
      flags={flags}
      canEdit={canEdit}
      timeline={[
        ...touches.map((t) => ({
          id: t.id,
          kind: "touch" as const,
          title: `${t.channel} — ${t.outcome.replace("_", " ")}`,
          occurredAt: t.occurredAt.toISOString(),
          body: null as string | null,
          review: null,
        })),
        ...conversations.map((c) => ({
          id: c.id,
          kind: "conversation" as const,
          title: c.title,
          occurredAt: c.occurredAt.toISOString(),
          body: c.body,
          review: c.review
            ? { score: c.review.score, verdict: c.review.verdict, wentWell: c.review.wentWell, missed: c.review.missed }
            : null,
        })),
      ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())}
    />
  );
}
