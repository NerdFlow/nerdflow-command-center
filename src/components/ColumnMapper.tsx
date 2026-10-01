"use client";

import type { LeadRowInput } from "@/server/leads";
import { applyMapping, autoMapFields, IMPORT_FIELDS, type FieldMapping } from "@/server/importMap";

export { applyMapping, autoMapFields, IMPORT_FIELDS };
export type { FieldMapping };

export function ColumnMapper({
  headers,
  mapping,
  onChange,
}: {
  headers: string[];
  mapping: FieldMapping;
  onChange: (m: FieldMapping) => void;
}) {
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

export type { LeadRowInput };
