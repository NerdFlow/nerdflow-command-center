"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Btn, Panel, Chip } from "@/components/ui";
import { previewLeadImport, commitBulkImport } from "@/server/actions/leads";
import { ColumnMapper, autoMapFields, applyMapping, type FieldMapping } from "@/components/ColumnMapper";

type PreviewResult = Awaited<ReturnType<typeof previewLeadImport>>;
type Step = "upload" | "assign" | "map" | "confirm" | "done";

export function BulkImportWizard({
  campaigns,
  reps,
}: {
  campaigns: { id: string; name: string; hasIcp: boolean }[];
  reps: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [assignMode, setAssignMode] = useState<"single" | "split">("single");
  const [selectedReps, setSelectedReps] = useState<string[]>(reps[0] ? [reps[0].id] : []);
  const [sendToReviewFirst, setSendToReviewFirst] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [missingContact, setMissingContact] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; duplicates: number; total: number; missingContact: number } | null>(null);

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);

  function handleFile(file: File) {
    setFileName(file.name);
    const isXlsx = /\.xlsx?$/i.test(file.name);
    if (isXlsx) {
      Promise.all([file.arrayBuffer(), import("xlsx")]).then(([buf, XLSX]) => {
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]!];
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet!, { defval: "" });
        const cols = data.length > 0 ? Object.keys(data[0]!) : [];
        setHeaders(cols);
        setRows(data);
        setMapping(autoMapFields(cols));
        setStep("assign");
      });
    } else {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          setHeaders(res.meta.fields ?? []);
          setRows(res.data);
          setMapping(autoMapFields(res.meta.fields ?? []));
          setStep("assign");
        },
      });
    }
  }

  function toggleRep(id: string) {
    setSelectedReps((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function runPreview() {
    setWorking(true);
    setError(null);
    try {
      const mapped = applyMapping(rows, mapping).filter((r) => r.business_name);
      const res = await previewLeadImport(campaignId, mapped);
      setPreview(res);
      setMissingContact(res.rows.filter((r) => !r.isDuplicate && !r.row.email && !r.row.phone).length);
      setStep("confirm");
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
      const mapped = applyMapping(rows, mapping).filter((r) => r.business_name);
      const res = await commitBulkImport({
        campaignId,
        rawRows: mapped,
        fileName,
        assignment: { mode: assignMode, repIds: assignMode === "single" ? [selectedReps[0]!] : selectedReps },
        sendToReviewFirst,
      });
      setResult(res);
      setStep("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import these leads.");
    } finally {
      setWorking(false);
    }
  }

  function reset() {
    setOpen(false);
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  if (!open) {
    return (
      <div className="flex gap-2">
        <Btn variant="primary" onClick={() => setOpen(true)} disabled={campaigns.length === 0}>
          {campaigns.length === 0 ? "Create a campaign first" : "Import list"}
        </Btn>
      </div>
    );
  }

  const canAssign = assignMode === "single" ? selectedReps.length === 1 : selectedReps.length >= 1;

  return (
    <Panel>
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-[17px] font-medium m-0">Import a list</h2>
        <button onClick={reset} className="text-sm text-muted hover:text-ink">
          Close
        </button>
      </div>

      {error && <p className="text-sm text-stop mb-3">{error}</p>}

      {step === "upload" && (
        <label className="block text-sm">
          CSV or XLSX file
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="block mt-1 text-sm"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      )}

      {step === "assign" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">{fileName} — {rows.length} rows found.</p>
          <label className="block text-sm">
            Campaign
            <select className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.hasIcp ? "" : " (no ICP set yet)"}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-sm font-medium mb-1.5">Assign to</p>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setAssignMode("single")}
                className={"text-xs px-2.5 py-1 rounded-full border " + (assignMode === "single" ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted")}
              >
                One rep
              </button>
              <button
                onClick={() => setAssignMode("split")}
                className={"text-xs px-2.5 py-1 rounded-full border " + (assignMode === "split" ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted")}
              >
                Split evenly
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {reps.map((r) => {
                const active = selectedReps.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => (assignMode === "single" ? setSelectedReps([r.id]) : toggleRep(r.id))}
                    className={"text-xs px-2.5 py-1 rounded-full border " + (active ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted")}
                  >
                    {r.fullName}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendToReviewFirst} onChange={(e) => setSendToReviewFirst(e.target.checked)} />
            Send to Lead review first (default: skip straight to Focus queue)
          </label>

          <Btn variant="primary" disabled={!canAssign} onClick={() => setStep("map")}>
            Next: map columns
          </Btn>
        </div>
      )}

      {step === "map" && (
        <div>
          <p className="text-sm text-muted mb-3">Match your file&apos;s columns to lead fields.</p>
          <div className="mb-4">
            <ColumnMapper headers={headers} mapping={mapping} onChange={setMapping} />
          </div>
          <Btn variant="primary" disabled={!mapping.business_name || working} onClick={runPreview}>
            {working ? "Checking…" : "Preview and check duplicates"}
          </Btn>
        </div>
      )}

      {step === "confirm" && preview && (
        <div>
          <p className="text-sm mb-1">
            <b>{preview.total - preview.duplicates}</b> new · <b>{preview.duplicates}</b> duplicate{preview.duplicates === 1 ? "" : "s"} skipped ·{" "}
            <b>{missingContact}</b> missing phone/email
          </p>
          <p className="text-sm text-muted mb-3">
            Assigned to {assignMode === "single" ? reps.find((r) => r.id === selectedReps[0])?.fullName : `${selectedReps.length} reps, split evenly`} ·{" "}
            {sendToReviewFirst ? "sent to Lead review first" : "goes straight to Focus queue"}. Fit scores start rule-based and improve in the
            background via AI (never blocks this import) if {selectedCampaign?.hasIcp ? "the campaign's ICP" : "an ICP is set later"}.
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

      {step === "done" && result && (
        <div>
          <p className="text-sm mb-3">
            Imported <b>{result.imported}</b> of {result.total} rows. Skipped {result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"}.{" "}
            {result.missingContact > 0 && <Chip tone="stop">{result.missingContact} missing phone/email</Chip>}
          </p>
          <Btn variant="primary" onClick={reset}>
            Done
          </Btn>
        </div>
      )}
    </Panel>
  );
}
