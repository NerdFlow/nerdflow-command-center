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

export type FieldMapping = Partial<Record<keyof LeadRowInput, string>>;

/** Lowercase, strip punctuation, collapse separators so "Business Name" and "business_name" match. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const FIELD_ALIASES: Record<keyof LeadRowInput, string[]> = {
  business_name: [
    "business name",
    "businessname",
    "company name",
    "companyname",
    "account name",
    "organization name",
    "organisation name",
    "company",
    "business",
    "account",
    "organization",
    "organisation",
  ],
  contact_name: ["contact name", "contactname", "full name", "fullname", "owner name", "decision maker", "contact"],
  contact_role: ["contact role", "job title", "title", "role"],
  city: ["city", "town"],
  region: ["region", "state", "province"],
  country: ["country"],
  website: ["website", "web site", "url", "site"],
  phone: ["phone number", "phonenumber", "mobile phone", "cell phone", "telephone", "phone", "mobile", "cell", "tel"],
  email: ["email address", "emailaddress", "e mail address", "e mail", "email"],
  instagram_url: ["instagram url", "instagram"],
  linkedin_url: ["linkedin url", "linked in url", "linkedin", "linked in"],
};

/** Primary email column. Generic Email is only the empty-cell fallback. */
const CORPORATE_EMAIL_ALIASES = ["corporate email", "corporate e mail", "work email", "work e mail"];
const GENERIC_EMAIL_ALIASES = ["generic email", "generic e mail"];

function findHeader(headers: string[], aliases: string[], used: Set<string>): string | undefined {
  const wanted = new Set(aliases);
  for (const header of headers) {
    if (used.has(header)) continue;
    if (wanted.has(normalizeHeader(header))) return header;
  }
  return undefined;
}

function cell(row: Record<string, string>, header: string | undefined): string {
  if (!header) return "";
  return String(row[header] ?? "").trim();
}

function valueFromAliases(row: Record<string, string>, aliases: string[]): string {
  const wanted = new Set(aliases);
  for (const [header, raw] of Object.entries(row)) {
    if (!wanted.has(normalizeHeader(header))) continue;
    const value = String(raw ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function autoMapFields(headers: string[]): FieldMapping {
  const auto: FieldMapping = {};
  const used = new Set<string>();

  for (const field of IMPORT_FIELDS) {
    if (field.key === "email") {
      const corporate = findHeader(headers, CORPORATE_EMAIL_ALIASES, used);
      const plain = findHeader(headers, FIELD_ALIASES.email, used);
      const generic = findHeader(headers, GENERIC_EMAIL_ALIASES, used);
      const chosen = corporate ?? plain ?? generic;
      if (chosen) {
        auto.email = chosen;
        used.add(chosen);
      }
      continue;
    }

    const match = findHeader(headers, FIELD_ALIASES[field.key], used);
    if (match) {
      auto[field.key] = match;
      used.add(match);
    }
  }

  return auto;
}

export function applyMapping(rows: Record<string, string>[], mapping: FieldMapping): LeadRowInput[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const field of IMPORT_FIELDS) {
      if (field.key === "email") continue;
      const value = cell(row, mapping[field.key]);
      if (value) out[field.key] = value;
    }

    // Corporate Email (or whichever column was mapped) wins. Blank cells fall back to Generic Email.
    const email = cell(row, mapping.email) || valueFromAliases(row, GENERIC_EMAIL_ALIASES);
    if (email) out.email = email;

    return out as LeadRowInput;
  });
}
