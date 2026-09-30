"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Btn, Panel } from "@/components/ui";
import { previewLeadImport, commitLeadImport } from "@/server/actions/leads";
import { ColumnMapper, autoMapFields, applyMapping, type FieldMapping } from "@/components/ColumnMapper";
import { useToast } from "@/components/Toast";

type PreviewResult = Awaited<ReturnType<typeof previewLeadImport>>;

export function LeadImportWizard({ campaigns }: { campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setHeaders(res.meta.fields ?? []);
        setCsvRows(res.data);
        setMapping(autoMapFields(res.meta.fields ?? []));
        setStep(2);
      },
    });
  }

  async function runPreview() {
    setWorking(true);
    setError(null);
    try {
      const rows = applyMapping(csvRows, mapping).filter((r) => r.business_name);
      const res = await previewLeadImport(campaignId, rows);
      if (!res) throw new Error("Preview failed — try reloading the page and importing again.");
      setPreview(res);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check that file.");
    } finally {
      setWorking(false);
    }
  }

  async function commit() {
    setWorking(true);
    setError(null);
    try {
      const rows = applyMapping(csvRows, mapping).filter((r) => r.business_name);
      const res = await commitLeadImport(campaignId, rows);
      if (!res) throw new Error("Import failed — try reloading the page and importing again.");
      setResult(res);
      toast(`${res.imported} lead${res.imported === 1 ? "" : "s"} imported.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import these leads.");
    } finally {
      setWorking(false);
    }
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
          {error && <p className="text-sm text-stop mb-3">{error}</p>}
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
              <div className="mb-4">
                <ColumnMapper headers={headers} mapping={mapping} onChange={setMapping} />
              </div>
              <Btn variant="primary" disabled={!mapping.business_name} loading={working} onClick={runPreview}>
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
              <Btn variant="primary" loading={working} onClick={commit}>
                {working ? "Importing…" : `Import ${preview.total - preview.duplicates} leads`}
              </Btn>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
