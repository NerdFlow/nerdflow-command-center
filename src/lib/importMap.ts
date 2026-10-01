import type { LeadRowInput } from "@/server/leads";

export const IMPORT_FIELDS: { key: keyof LeadRowInput; label: string; required?: boolean }[] = [
  { key: "business_name", label: "Business name", required: true },
  { key: "contact_name", label: "Contact name" },
  { key: "contact_role", label: "Contact role" },
  { key: "city", label: "City" },
  { key: "region", label: "Region" },
  { key: "country", label: "Country" },
  { key: "website", label: "Website" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "instagram_url", label: "Instagram URL" },
  { key: "linkedin_url", label: "LinkedIn URL" },
];

export type FieldMapping = Partial<Record<keyof LeadRowInput, string>> & {
  /** Used when the primary email cell is blank (Generic Email under Corporate Email). */
  email_fallback?: string;
};

const ALIASES: Record<keyof LeadRowInput, string[]> = {
  business_name: ["business_name", "businessname", "company_name", "companyname", "company", "account_name", "account", "organization", "organisation"],
  contact_name: ["contact_name", "contactname", "full_name", "fullname", "owner_name", "owner", "contact_person", "contact"],
  contact_role: ["contact_role", "job_title", "title", "role"],
  city: ["city", "town"],
  region: ["region", "state", "province", "state_province"],
  country: ["country"],
  website: ["website", "website_url", "company_website", "url", "site", "web"],
  phone: ["phone", "phone_number", "phonenumber", "telephone", "business_phone", "company_phone", "mobile", "cell", "tel"],
  email: ["email", "email_address", "emailaddress", "e_mail", "work_email", "primary_email"],
  instagram_url: ["instagram_url", "instagram", "ig", "ig_url"],
  linkedin_url: ["linkedin_url", "linkedin", "linkedin_profile"],
};

const CORPORATE_EMAIL = ["corporate_email", "corporateemail", "company_email"];
const GENERIC_EMAIL = ["generic_email", "genericemail"];

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findHeader(headers: string[], aliases: string[], used: Set<string>): string | undefined {
  const ranked = headers.map((raw) => ({ raw, key: normalizeHeader(raw) }));
  for (const alias of aliases) {
    const hit = ranked.find((h) => h.key === alias && !used.has(h.raw));
    if (hit) return hit.raw;
  }
  for (const alias of aliases) {
    if (alias.length < 6) continue;
    const hit = ranked.find((h) => !used.has(h.raw) && h.key.includes(alias));
    if (hit) return hit.raw;
  }
  return undefined;
}

export function autoMapFields(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  const used = new Set<string>();

  const corporate = findHeader(headers, CORPORATE_EMAIL, used);
  const generic = findHeader(headers, GENERIC_EMAIL, used);
  if (corporate) {
    mapping.email = corporate;
    used.add(corporate);
  }
  if (generic) {
    if (mapping.email) mapping.email_fallback = generic;
    else mapping.email = generic;
    used.add(generic);
  }

  for (const field of IMPORT_FIELDS) {
    if (field.key === "email" && mapping.email) continue;
    const header = findHeader(headers, ALIASES[field.key], used);
    if (!header) continue;
    mapping[field.key] = header;
    used.add(header);
  }

  if (generic && mapping.email && mapping.email !== generic && !mapping.email_fallback) {
    mapping.email_fallback = generic;
  }
  if (mapping.email && !mapping.email_fallback) {
    const extra = findHeader(headers, ALIASES.email, used);
    if (extra) {
      mapping.email_fallback = extra;
      used.add(extra);
    }
  }

  return mapping;
}

function cell(row: Record<string, string>, header: string | undefined): string {
  if (!header) return "";
  const value = row[header];
  return value == null ? "" : String(value).trim();
}

export function applyMapping(rows: Record<string, string>[], mapping: FieldMapping): LeadRowInput[] {
  return rows.map((row) => {
    const out: Partial<LeadRowInput> = {};
    for (const field of IMPORT_FIELDS) {
      if (field.key === "email") continue;
      const value = cell(row, mapping[field.key]);
      if (value) out[field.key] = value;
    }
    const email = cell(row, mapping.email) || cell(row, mapping.email_fallback);
    if (email) out.email = email;
    return out as LeadRowInput;
  });
}

/** Default the import to the person who will open Focus, when they are a valid assignee. */
export function defaultAssigneeIds(currentUserId: string, repIds: string[]): string[] {
  if (repIds.includes(currentUserId)) return [currentUserId];
  const first = repIds[0];
  if (first) return [first];
  return [currentUserId];
}
