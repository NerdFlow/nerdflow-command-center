import { resolveLeadChannel } from "@/server/cadence";
import type { CampaignStrategy } from "@/server/strategy";
import type { Channel } from "@prisma/client";

export type FocusQueueCard = {
  lead: {
    phone: string | null;
    cadenceStep: number;
    nextChannelOverride: Channel | null;
  };
  campaign: { strategy: CampaignStrategy | null | undefined };
};

/** A lead can be dialed when the phone field has a real number. */
export function leadHasPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7;
}

export function cadenceChannel(card: FocusQueueCard): Channel {
  return resolveLeadChannel({
    strategy: card.campaign.strategy,
    cadenceStep: card.lead.cadenceStep,
    nextChannelOverride: card.lead.nextChannelOverride,
  });
}

/**
 * Call mode is phone-first: every lead with a phone, whatever the cadence step says.
 * LinkedIn mode is the whole Focus queue (profile or people search), not the cadence step.
 * Email stays on the cadence-resolved channel.
 */
export function matchesFocusFilter(
  card: FocusQueueCard,
  filter: Channel | "all",
  options?: { inBusinessHours?: boolean },
): boolean {
  if (filter === "call") {
    if (!leadHasPhone(card.lead.phone)) return false;
    if (options?.inBusinessHours === false) return false;
    return true;
  }
  if (filter === "linkedin") return true;
  if (filter === "all") {
    if (options?.inBusinessHours === false && cadenceChannel(card) === "call") return false;
    return true;
  }
  return cadenceChannel(card) === filter;
}

/** Channel the card should present. Call mode dials even on an email step. */
export function focusWorkingChannel(card: FocusQueueCard, filter: Channel | "all"): Channel {
  if (filter === "call" || filter === "email" || filter === "linkedin" || filter === "instagram") return filter;
  return cadenceChannel(card);
}

/**
 * Call counts phones. Email and Instagram stay on the cadence step.
 * LinkedIn counts every lead in the queue, even when the cadence step is email.
 */
export function tallyFocusChannels(
  items: Array<{ phone: string | null; cadence: Channel }>,
): Partial<Record<Channel, number>> {
  const counts: Partial<Record<Channel, number>> = {};
  for (const item of items) {
    if (leadHasPhone(item.phone)) counts.call = (counts.call ?? 0) + 1;
    if (item.cadence === "email" || item.cadence === "instagram") {
      counts[item.cadence] = (counts[item.cadence] ?? 0) + 1;
    }
    counts.linkedin = (counts.linkedin ?? 0) + 1;
  }
  return counts;
}

/**
 * A rep's queue includes cadence cards they work, plus every phone lead when
 * they work calls — Day-0 email cadence must not hide those leads.
 */
export function cardInRepQueue(card: FocusQueueCard, allowedChannels: Channel[]): boolean {
  if (allowedChannels.includes("call") && leadHasPhone(card.lead.phone)) return true;
  return allowedChannels.includes(cadenceChannel(card));
}
