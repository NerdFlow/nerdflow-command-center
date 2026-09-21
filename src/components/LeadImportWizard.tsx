"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Btn, Panel } from "@/components/ui";
import { previewLeadImport, commitLeadImport } from "@/server/actions/leads";
import type { LeadRowInput } from "@/server/leads";

const FIELDS: { key: keyof LeadRowInput; label: string; required?: boolean }[] = [
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

type PreviewResult = Awaited<ReturnType<typeof previewLeadImport>>;

export function LeadImportWizard({ campaigns }: { campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<keyof LeadRowInput, string>>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; total: number } | null>(null);

  function handleFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setHeaders(res.meta.fields ?? []);
        setCsvRows(res.data);
        const auto: Partial<Record<keyof LeadRowInput, string>> = {};
        for (const f of FIELDS) {
          const match = (res.meta.fields ?? []).find((h) => h.toLowerCase().replace(/\s+/g, "_") === f.key);
          if (match) auto[f.key] = match;
        }
        setMapping(auto);
        setStep(2);
      },
    });
  }

  function mappedRows(): LeadRowInput[] {
    return csvRows.map((row) => {
      const out: Record<string, string> = {};
      for (const f of FIELDS) {
        const header = mapping[f.key];
        if (header && row[header]) out[f.key] = row[header].trim();
      }
      return out as LeadRowInput;
    });
  }

  async function runPreview() {
    setWorking(true);
    const rows = mappedRows().filter((r) => r.business_name);
    const res = await previewLeadImport(campaignId, rows);
    setPreview(res);
    setWorking(false);
    setStep(3);
  }

  async function commit() {
    setWorking(true);
    const rows = mappedRows().filter((r) => r.business_name);
    const res = await commitLeadImport(campaignId, rows);
    setResult(res);
    setWorking(false);
    router.refresh();
  }

  function reset() {
    setOpen(false);
    setStep(1);
    setHeaders([]);
    setCsvRows([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  if (!open) {
    return (
      <Btn variant="primary" onClick={() => setOpen(true)} disabled={campaigns.length === 0}>
        {campaigns.length === 0 ? "Create a campaign first" : "Import CSV"}
      </Btn>
    );
  }

  return (
    <Panel>
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-[17px] font-medium m-0">Import leads from CSV</h2>
        <button onClick={reset} className="text-sm text-muted hover:text-ink">
          Close
        </button>
      </div>

      {result ? (
        <div>
          <p className="text-sm mb-3">
            Imported {result.imported} of {result.total} rows. Skipped {result.duplicates} duplicate
            {result.duplicates === 1 ? "" : "s"}.
          </p>
          <Btn variant="primary" onClick={reset}>
            Done
          </Btn>
        </div>
      ) : (
        <>
          {step === 1 && (
            <div className="space-y-3">
              <label className="block text-sm">
                Campaign
                <select
                  className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                CSV file
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv"
                  className="block mt-1 text-sm"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-sm text-muted mb-3">Match your CSV columns to lead fields. {csvRows.length} rows found.</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {FIELDS.map((f) => (
                  <label key={f.key} className="text-sm">
                    {f.label}
                    {f.required && " *"}
                    <select
                      className="w-full border border-rule rounded-lg px-2 py-1.5 bg-bg mt-1"
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
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
              <Btn variant="primary" disabled={!mapping.business_name || working} onClick={runPreview}>
                {working ? "Checking…" : "Preview and check duplicates"}
              </Btn>
            </div>
          )}

          {step === 3 && preview && (
            <div>
              <p className="text-sm mb-3">
                {preview.total} rows — {preview.total - preview.duplicates} new, {preview.duplicates} likely
                duplicate{preview.duplicates === 1 ? "" : "s"} (skipped automatically).
              </p>
              <div className="max-h-64 overflow-y-auto border border-rule rounded-lg mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-panel2">
                      <th className="text-left p-2">Business</th>
                      <th className="text-left p-2">Contact</th>
                      <th className="text-left p-2">Score</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-rule">
                        <td className="p-2">{r.row.business_name}</td>
                        <td className="p-2">{r.row.contact_name ?? "—"}</td>
                        <td className="p-2">{r.score}</td>
                        <td className="p-2">{r.isDuplicate ? "Duplicate" : "New"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Btn variant="primary" disabled={working} onClick={commit}>
                {working ? "Importing…" : `Import ${preview.total - preview.duplicates} leads`}
              </Btn>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
