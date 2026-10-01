import { prisma } from "@/server/db";
import { getQueueForUser } from "@/server/queue";
import { resolveLeadChannel } from "@/server/cadence";
import { formatLastTouch } from "@/lib/focusCallCard";
import type { CampaignStrategy } from "@/server/strategy";
import type { CoachDirectoryLead, ShapeCard, ShapeReply } from "@/lib/shapeCard";
import type { LeadSource } from "@prisma/client";

function asStrategy(value: unknown): CampaignStrategy {
  return value as CampaignStrategy;
}

function asSignals(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function loadFocusBoard(ownerId: string, organizationId: string) {
  const queue = await getQueueForUser(ownerId, 50);
  const queueIds = queue.map((item) => item.lead.id);

  const [sentRows, replies, directory] = await Promise.all([
    queueIds.length === 0
      ? Promise.resolve([] as { leadId: string }[])
      : prisma.touch.findMany({
          where: { leadId: { in: queueIds }, organizationId, channel: "linkedin", outcome: "sent" },
          select: { leadId: true },
          distinct: ["leadId"],
        }),
    prisma.reply.findMany({
      where: { status: "open", organizationId, lead: { ownerId } },
      include: { lead: { include: { campaign: { include: { product: true } } } } },
      orderBy: { receivedAt: "asc" },
      take: 40,
    }),
    prisma.lead.findMany({
      where: { ownerId, organizationId, status: { in: ["queued", "in_cadence", "replied", "deal"] } },
      select: {
        id: true,
        contactName: true,
        businessName: true,
        cadenceStep: true,
        nextChannelOverride: true,
        campaign: { select: { strategy: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const linkedinSent = new Set(sentRows.map((row) => row.leadId));
  const repliesByLead = new Map<string, ShapeReply[]>();
  for (const reply of replies) {
    const list = repliesByLead.get(reply.leadId) ?? [];
    list.push({
      id: reply.id,
      channel: reply.channel,
      text: reply.text,
      responseDraft: reply.responseDraft,
    });
    repliesByLead.set(reply.leadId, list);
  }

  const cards: ShapeCard[] = queue.map(({ lead, campaign, label }) => ({
    lead: {
      id: lead.id,
      businessName: lead.businessName,
      contactName: lead.contactName,
      contactRole: lead.contactRole,
      city: lead.city,
      region: lead.region,
      country: lead.country,
      cadenceStep: lead.cadenceStep,
      nextChannelOverride: lead.nextChannelOverride,
      signals: asSignals(lead.signals),
      phone: lead.phone,
      email: lead.email,
      instagramUrl: lead.instagramUrl,
      linkedinUrl: lead.linkedinUrl,
      website: lead.website,
      sourceUrl: lead.sourceUrl,
      fitScore: lead.fitScore,
      fitReasons: (lead.fitReasons as string[] | null) ?? [],
      fitFlags: (lead.fitFlags as string[] | null) ?? [],
      source: lead.source,
      lastTouchLabel: formatLastTouch(lead.touches[0] ?? null),
    },
    campaign: {
      id: campaign.id,
      name: campaign.name,
      productName: campaign.product.name,
      strategy: asStrategy(campaign.strategy),
    },
    label,
    linkedinRequestSent: linkedinSent.has(lead.id),
    openReplies: repliesByLead.get(lead.id) ?? [],
  }));

  const queued = new Set(queueIds);
  for (const reply of replies) {
    if (queued.has(reply.leadId)) continue;
    queued.add(reply.leadId);
    const lead = reply.lead;
    cards.push({
      lead: {
        id: lead.id,
        businessName: lead.businessName,
        contactName: lead.contactName,
        contactRole: lead.contactRole,
        city: lead.city,
        region: lead.region,
        country: lead.country,
        cadenceStep: lead.cadenceStep,
        nextChannelOverride: lead.nextChannelOverride,
        signals: asSignals(lead.signals),
        phone: lead.phone,
        email: lead.email,
        instagramUrl: lead.instagramUrl,
        linkedinUrl: lead.linkedinUrl,
        website: lead.website,
        sourceUrl: lead.sourceUrl,
        fitScore: lead.fitScore,
        fitReasons: (lead.fitReasons as string[] | null) ?? [],
        fitFlags: (lead.fitFlags as string[] | null) ?? [],
        source: lead.source as LeadSource,
        lastTouchLabel: null,
      },
      campaign: {
        id: lead.campaign.id,
        name: lead.campaign.name,
        productName: lead.campaign.product.name,
        strategy: asStrategy(lead.campaign.strategy),
      },
      label: "Reply",
      linkedinRequestSent: true,
      replyOnly: true,
      openReplies: repliesByLead.get(lead.id) ?? [],
    });
  }

  const coachLeads: CoachDirectoryLead[] = directory.map((lead) => ({
    id: lead.id,
    contactName: lead.contactName,
    businessName: lead.businessName,
    channel: resolveLeadChannel({
      strategy: asStrategy(lead.campaign.strategy),
      cadenceStep: lead.cadenceStep,
      nextChannelOverride: lead.nextChannelOverride,
    }),
  }));

  return { cards, coachLeads };
}
