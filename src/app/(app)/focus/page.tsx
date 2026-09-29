import { requireUser } from "@/server/auth";
import { getQueueForUser } from "@/server/queue";
import { FocusClient } from "@/components/FocusClient";
import type { CampaignStrategy } from "@/server/strategy";
import type { Channel } from "@prisma/client";

export default async function FocusPage() {
  const user = await requireUser();
  const queue = await getQueueForUser(user.id, 50);
  const allowedChannels = ((user.channelsWorked as string[] | null) ?? ["call", "email", "instagram", "linkedin"]) as Channel[];

  const cards = queue.map(({ lead, campaign, label }) => ({
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
      signals: lead.signals as Record<string, unknown>,
      phone: lead.phone,
      email: lead.email,
      instagramUrl: lead.instagramUrl,
      linkedinUrl: lead.linkedinUrl,
      website: lead.website,
      sourceUrl: lead.sourceUrl,
      fitScore: lead.fitScore,
      fitReasons: (lead.fitReasons as string[] | null) ?? [],
      fitFlags: (lead.fitFlags as string[] | null) ?? [],
    },
    campaign: {
      id: campaign.id,
      name: campaign.name,
      productName: campaign.product.name,
      strategy: campaign.strategy as unknown as CampaignStrategy,
    },
    label,
  }));

  return <FocusClient initialCards={cards} me={user.fullName} repTimezone={user.timezone} allowedChannels={allowedChannels} />;
}
