import type { LeadDiscoverySource, DiscoverInput, DiscoveredBusiness } from "./types";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
export const PLACES_PAGE_SIZE = 20;
const MAX_PAGES = 3; // 3 x 20 = 60 results per query, per spec

/**
 * Rough planning estimate only (Google's published "Pro" SKU rate for Text
 * Search with the fields we request — address, phone, website go beyond the
 * free "Essentials" field set). Confirm against your actual Places billing
 * if this ever needs to be exact; it's for the pre-run estimate shown to
 * the user, not for billing reconciliation.
 */
export const PLACES_COST_PER_REQUEST_USD = 0.032;

// Request only the fields we actually use — Places API (New) bills per
// field mask, so a narrower mask is directly a cost control, not just tidiness.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

type PlacesResponse = {
  places?: {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
  }[];
  nextPageToken?: string;
};

async function searchPage(apiKey: string, textQuery: string, pageToken?: string): Promise<PlacesResponse> {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, pageSize: PLACES_PAGE_SIZE, ...(pageToken ? { pageToken } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Places API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export const googlePlacesSource: LeadDiscoverySource = {
  id: "google_places",

  isConfigured() {
    return Boolean(process.env.GOOGLE_PLACES_API_KEY);
  },

  async discover(input: DiscoverInput): Promise<DiscoveredBusiness[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not configured");

    const textQuery = `${input.query} in ${input.location}`;
    const results: DiscoveredBusiness[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES && results.length < input.maxResults; page++) {
      // Google's next_page_token needs a short delay before it's valid.
      if (pageToken) await new Promise((r) => setTimeout(r, 2000));
      const data = await searchPage(apiKey, textQuery, pageToken);
      for (const place of data.places ?? []) {
        if (seen.has(place.id)) continue;
        seen.add(place.id);
        results.push({
          name: place.displayName?.text ?? "Unknown business",
          website: place.websiteUri ?? null,
          phone: place.internationalPhoneNumber ?? null,
          address: place.formattedAddress ?? null,
          sourceUrl: place.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        });
        if (results.length >= input.maxResults) break;
      }
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    return results;
  },
};
