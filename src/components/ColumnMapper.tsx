"use client";

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

export function autoMapFields(headers: string[]): FieldMapping {
  const auto: FieldMapping = {};
  for (const f of IMPORT_FIELDS) {
    const match = headers.find((h) => h.toLowerCase().replace(/\s+/g, "_") === f.key);
    if (match) auto[f.key] = match;
  }
  return auto;
}

export function applyMapping(rows: Record<string, string>[], mapping: FieldMapping): LeadRowInput[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const f of IMPORT_FIELDS) {
      const header = mapping[f.key];
      if (header && row[header]) out[f.key] = String(row[header]).trim();
    }
    return out as LeadRowInput;
  });
}

export function ColumnMapper({ headers, mapping, onChange }: { headers: string[]; mapping: FieldMapping; onChange: (m: FieldMapping) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {IMPORT_FIELDS.map((f) => (
        <label key={f.key} className="text-sm">
          {f.label}
          {f.required && " *"}
          <select
            className="w-full border border-rule rounded-lg px-2 py-1.5 bg-bg mt-1"
            value={mapping[f.key] ?? ""}
            onChange={(e) => onChange({ ...mapping, [f.key]: e.target.value || undefined })}
          >
            <option value="">— none —</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
