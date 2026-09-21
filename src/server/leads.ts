export type LeadRowInput = {
  business_name: string;
  contact_name?: string;
  contact_role?: string;
  city?: string;
  region?: string;
  country?: string;
  website?: string;
  phone?: string;
  email?: string;
  instagram_url?: string;
  linkedin_url?: string;
};

export function computeDedupeKey(row: LeadRowInput): string {
  if (row.website) {
    try {
      const url = new URL(row.website.startsWith("http") ? row.website : `https://${row.website}`);
      return `domain:${url.hostname.replace(/^www\./, "").toLowerCase()}`;
    } catch {
      // fall through to other keys
    }
  }
  if (row.phone) {
    const digits = row.phone.replace(/\D/g, "");
    if (digits.length >= 7) return `phone:${digits}`;
  }
  return `name:${row.business_name.trim().toLowerCase()}|${(row.city ?? "").trim().toLowerCase()}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Simple rule score used for manual/CSV-imported leads (no AI fit check yet — that's the Phase 4 lead engine). */
export function ruleScore(row: LeadRowInput): number {
  let score = 30;
  if (row.contact_name) score += 20;
  if (row.email && EMAIL_RE.test(row.email)) score += 20;
  if (row.phone) score += 15;
  if (row.website) score += 10;
  if (row.instagram_url || row.linkedin_url) score += 5;
  return Math.min(100, score);
}

export const LEAD_REJECT_REASONS = [
  "Wrong location",
  "Too small",
  "No decision-maker",
  "Chain or franchise",
  "Bad contact data",
  "Already a customer",
  "Other",
] as const;
