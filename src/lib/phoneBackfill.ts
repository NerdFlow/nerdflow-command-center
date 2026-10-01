import { computeDedupeKey, type LeadRowInput } from "@/server/leads";
import { leadHasPhone } from "@/lib/focusQueue";
import { usablePhone } from "@/lib/importMap";

export type StoredLeadContact = {
  id: string;
  businessName: string;
  city: string | null;
  website: string | null;
  phone: string | null;
  dedupeKey: string;
};

export type ImportPlanItem =
  | { action: "insert"; row: LeadRowInput; dedupeKey: string }
  | { action: "backfill_phone"; leadId: string; phone: string; row: LeadRowInput; dedupeKey: string }
  | { action: "skip"; leadId: string | null; row: LeadRowInput; dedupeKey: string };

export function businessMatchKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowWithoutPhone(row: LeadRowInput): LeadRowInput {
  const { phone: _phone, ...rest } = row;
  return rest;
}

/**
 * Match a re-uploaded row to a lead that was saved without a phone.
 * The first import's dedupe key is often name|city (no phone was stored), while
 * the same file with Phone mapped now dedupes as phone:digits. Name match still finds the row.
 */
export function planImportMerge(existing: StoredLeadContact[], incoming: LeadRowInput[]): ImportPlanItem[] {
  const byDedupe = new Map<string, StoredLeadContact[]>();
  const byName = new Map<string, StoredLeadContact[]>();
  for (const lead of existing) {
    const dedupeHits = byDedupe.get(lead.dedupeKey) ?? [];
    dedupeHits.push(lead);
    byDedupe.set(lead.dedupeKey, dedupeHits);
    const name = businessMatchKey(lead.businessName);
    if (name) {
      const nameHits = byName.get(name) ?? [];
      nameHits.push(lead);
      byName.set(name, nameHits);
    }
  }

  const used = new Set<string>();

  function take(candidates: StoredLeadContact[] | undefined): StoredLeadContact | undefined {
    if (!candidates) return undefined;
    return candidates.find((lead) => !used.has(lead.id));
  }

  return incoming.map((row) => {
    const phone = usablePhone(row.phone);
    const normalized: LeadRowInput = phone ? { ...row, phone } : { ...rowWithoutPhone(row) };
    const dedupeKey = computeDedupeKey(normalized);
    const keys = [dedupeKey];
    if (phone) keys.push(computeDedupeKey(rowWithoutPhone(normalized)));

    let match: StoredLeadContact | undefined;
    for (const key of keys) {
      match = take(byDedupe.get(key));
      if (match) break;
    }
    if (!match) {
      const named = byName.get(businessMatchKey(normalized.business_name)) ?? [];
      const unused = named.filter((lead) => !used.has(lead.id));
      if (unused.length === 1) match = unused[0];
    }

    if (!match) return { action: "insert", row: normalized, dedupeKey };
    used.add(match.id);
    if (phone && !leadHasPhone(match.phone)) {
      return { action: "backfill_phone", leadId: match.id, phone, row: normalized, dedupeKey };
    }
    return { action: "skip", leadId: match.id, row: normalized, dedupeKey };
  });
}
