import type { LeadSource } from "@prisma/client";

export type DiscoveredBusiness = {
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  sourceUrl: string;
};

export type DiscoverInput = {
  query: string;
  location: string;
  maxResults: number;
};

/**
 * Every lead-discovery backend (Google Places, and previously Gemini search
 * grounding for business listings) implements this so the rest of the
 * pipeline — extract, score, dedupe, stage — never has to know which one
 * is running. Swapping sources means writing a new file here, nothing else.
 */
export interface LeadDiscoverySource {
  readonly id: LeadSource;
  isConfigured(): boolean;
  discover(input: DiscoverInput): Promise<DiscoveredBusiness[]>;
}
