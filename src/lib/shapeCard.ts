import type { PipelineCardView } from "@/lib/pipelineToday";
import type { CampaignStrategy } from "@/server/strategy";
import type { Channel, LeadSource } from "@prisma/client";

export type ShapeReply = {
  id: string;
  channel: Channel;
  text: string;
  responseDraft: string | null;
};

/** One lead in Focus. Shape A expands it into one card per Today action. */
export type ShapeCard = {
  lead: {
    id: string;
    businessName: string;
    contactName: string | null;
    contactRole: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    cadenceStep: number;
    nextChannelOverride: Channel | null;
    signals: Record<string, unknown>;
    phone: string | null;
    email: string | null;
    instagramUrl: string | null;
    linkedinUrl: string | null;
    website: string | null;
    sourceUrl: string | null;
    fitScore: number;
    fitReasons: string[];
    fitFlags: string[];
    source: LeadSource;
    lastTouchLabel: string | null;
  };
  campaign: { id: string; name: string; productName: string; strategy: CampaignStrategy };
  label: string;
  linkedinRequestSent: boolean;
  openReplies: ShapeReply[];
  replyOnly?: boolean;
  /** Set when this card is one Sales Pipeline Today row. Skips cadence expansion. */
  pipeline?: PipelineCardView;
  /** The one cadence step that is due. Absent on pipeline and reply cards. */
  dueChannel?: Channel;
};

export type CoachDirectoryLead = {
  id: string;
  contactName: string | null;
  businessName: string;
  channel: Channel;
};
