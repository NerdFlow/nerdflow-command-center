"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Btn, Chip, SectionLabel } from "@/components/ui";
import { previewLeadImport, commitBulkImport } from "@/server/actions/leads";
import { ColumnMapper, autoMapFields, applyMapping, type FieldMapping } from "@/components/ColumnMapper";
import { defaultAssigneeIds } from "@/lib/importMap";
import { useToast } from "@/components/Toast";

type PreviewResult = Awaited<ReturnType<typeof previewLeadImport>>;
type Step = "upload" | "campaign" | "map" | "confirm" | "done";

function mappingLooksComplete(mapping: FieldMapping): boolean {
  return Boolean(mapping.business_name);
}

const fieldClass =
  "w-full border border-rule rounded-xl px-3.5 py-2.5 bg-panel2 text-sm text-ink focus:outline-none focus:border-accent/50 transition-colors";

function segmentBtn(on: boolean) {
  return (
    "text-sm px-3.5 py-2 rounded-xl border transition-colors " +
    (on ? "border-accent bg-accent-soft text-accent font-semibold" : "border-rule text-muted hover:text-ink")
  );
}

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "campaign", label: "Campaign" },
  { key: "map", label: "Columns" },
  { key: "confirm", label: "Confirm" },
  { key: "done", label: "Done" },
];

function stepIndex(step: Step) {
  return STEPS.findIndex((s) => s.key === step);
}

export function BulkImportWizard({
  campaigns,
  reps,
  currentUserId,
  open: controlledOpen,
  onOpenChange,
}: {
  campaigns: { id: string; name: string; hasIcp: boolean }[];
  reps: { id: string; fullName: string }[];
  /** Defaults assignment to this user when there's only one rep (or for solo use). */
  currentUserId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (controlledOpen === undefined) setInternalOpen(v);
  };

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [assignMode, setAssignMode] = useState<"single" | "split">("single");
  const [selectedReps, setSelectedReps] = useState<string[]>(() => defaultAssigneeIds(currentUserId, reps.map((r) => r.id)));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [missingContact, setMissingContact] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
    phonesBackfilled?: number;
    total: number;
    missingContact: number;
  } | null>(null);

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const multiRep = reps.length > 1;
  const activeIdx = stepIndex(step);

  function focusDestination() {
    const ids = multiRep ? selectedReps : [currentUserId];
    if (multiRep && assignMode === "split" && ids.length > 1) return `split across ${ids.length} Focus queues`;
    const id = ids[0];
    const name = reps.find((r) => r.id === id)?.fullName;
    if (!name || id === currentUserId) return "your Focus queue";
    return `${name}'s Focus queue`;
  }

  function afterFileParsed(cols: string[], data: Record<string, string>[]) {
    setHeaders(cols);
    setRows(data);
    const auto = autoMapFields(cols);
    setMapping(auto);
    setStep("campaign");
  }

  function handleFile(file: File) {
    setFileName(file.name);
    const isXlsx = /\.xlsx?$/i.test(file.name);
    if (isXlsx) {
      Promise.all([file.arrayBuffer(), import("xlsx")]).then(([buf, XLSX]) => {
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]!];
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet!, { defval: "" });
        const cols = data.length > 0 ? Object.keys(data[0]!) : [];
        afterFileParsed(cols, data);
      });
    } else {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          afterFileParsed(res.meta.fields ?? [], res.data);
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
      if (!res) throw new Error("Preview failed — try reloading the page and importing again.");
      setPreview(res);
      setMissingContact(res.rows.filter((r) => !r.isDuplicate && !r.row.email && !r.row.phone).length);
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check that file.");
    } finally {
      setWorking(false);
    }
  }

  async function continueFromCampaign() {
    if (!campaignId) {
      setError("Pick a campaign.");
      return;
    }
    if (multiRep) {
      if (assignMode === "single" && selectedReps.length !== 1) {
        setError("Pick one rep.");
        return;
      }
      if (assignMode === "split" && selectedReps.length < 1) {
        setError("Pick at least one rep.");
        return;
      }
    }
    if (!mappingLooksComplete(mapping)) {
      setStep("map");
      return;
    }
    await runPreview();
  }

  async function commit() {
    setWorking(true);
    setError(null);
    try {
      const mapped = applyMapping(rows, mapping).filter((r) => r.business_name);
      const repIds = multiRep ? selectedReps : [currentUserId];
      const res = await commitBulkImport({
        campaignId,
        rawRows: mapped,
        fileName,
        assignment: { mode: multiRep && assignMode === "split" ? "split" : "single", repIds },
        sendToReviewFirst: false,
      });
      if (!res) throw new Error("Import failed — try reloading the page and importing again.");
      setResult(res);
      setStep("done");
      const phones = res.phonesBackfilled ?? 0;
      toast(
        phones > 0
          ? `${res.imported} new · ${phones} existing leads got a phone`
          : `${res.imported} new · ${res.duplicates} duplicates skipped.`,
      );
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
    setSelectedReps(defaultAssigneeIds(currentUserId, reps.map((r) => r.id)));
    setAssignMode("single");
    if (fileInput.current) fileInput.current.value = "";
  }

  if (!open) {
    return (
      <Btn variant="ghost" size="lg" onClick={() => setOpen(true)} disabled={campaigns.length === 0}>
        {campaigns.length === 0 ? "Create a campaign first" : "Import list"}
      </Btn>
    );
  }

  return (
    <div className="rounded-card border border-rule bg-panel shadow-soft px-5 py-5 md:px-6 md:py-6 animate-fade-up">
      <div className="flex justify-between items-start gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight m-0 mb-1">Import a list</h2>
          <p className="text-sm text-muted m-0">Upload → pick campaign → confirm. Leads land in Focus.</p>
        </div>
        <button type="button" onClick={reset} className="text-sm text-dim hover:text-ink transition-colors shrink-0">
          Close
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {STEPS.filter((s) => s.key !== "map" || step === "map" || activeIdx > stepIndex("map")).map((s) => {
          const idx = stepIndex(s.key);
          const done = idx < activeIdx;
          const current = s.key === step;
          return (
            <span
              key={s.key}
              className={
                "text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-lg " +
                (current ? "bg-accent-soft text-accent" : done ? "bg-panel2 text-muted" : "bg-panel2/50 text-dim")
              }
            >
              {s.label}
            </span>
          );
        })}
      </div>

      {error && <p className="text-sm text-stop mb-4 m-0">{error}</p>}

      {step === "upload" && (
        <div className="space-y-4">
          <SectionLabel>File</SectionLabel>
          <label className="flex flex-col items-start gap-3 rounded-card border border-dashed border-rule bg-panel2/50 px-5 py-8 cursor-pointer hover:border-accent/40 transition-colors">
            <span className="text-[15px] font-semibold text-ink">CSV or XLSX</span>
            <span className="text-sm text-muted">Drop a file or click to browse</span>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="block text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:text-on-accent file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {step === "campaign" && (
        <div className="space-y-5">
          <p className="text-sm text-muted m-0">
            <span className="text-ink font-medium">{fileName}</span> — {rows.length} rows
          </p>
          <label className="block">
            <span className="section-label mb-2 block">Campaign</span>
            <select className={fieldClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {multiRep && (
            <div>
              <SectionLabel className="mb-2.5">Assign to</SectionLabel>
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setAssignMode("single")} className={segmentBtn(assignMode === "single")}>
                  One rep
                </button>
                <button type="button" onClick={() => setAssignMode("split")} className={segmentBtn(assignMode === "split")}>
                  Split evenly
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {reps.map((r) => {
                  const active = selectedReps.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => (assignMode === "single" ? setSelectedReps([r.id]) : toggleRep(r.id))}
                      className={segmentBtn(active)}
                    >
                      {r.fullName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs text-dim m-0">
            Leads go straight into {focusDestination()}. Call includes every lead with a phone.
          </p>

          <Btn variant="primary" size="lg" loading={working} onClick={continueFromCampaign}>
            {working ? "Checking…" : mappingLooksComplete(mapping) ? "Preview" : "Next: map columns"}
          </Btn>
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <p className="text-sm text-muted m-0">We couldn’t recognize all columns — match them below.</p>
          <ColumnMapper headers={headers} mapping={mapping} onChange={setMapping} />
          <Btn variant="primary" size="lg" disabled={!mapping.business_name} loading={working} onClick={runPreview}>
            {working ? "Checking…" : "Preview"}
          </Btn>
        </div>
      )}

      {step === "confirm" && preview && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="stat-number text-accent m-0">{preview.total - preview.duplicates}</p>
              <p className="text-xs text-dim mt-1.5 mb-0">new</p>
            </div>
            {(preview.phonesBackfilled ?? 0) > 0 && (
              <div>
                <p className="stat-number text-accent m-0">{preview.phonesBackfilled}</p>
                <p className="text-xs text-dim mt-1.5 mb-0">phones to add</p>
              </div>
            )}
            <div>
              <p className="stat-number m-0">{Math.max(0, preview.duplicates - (preview.phonesBackfilled ?? 0))}</p>
              <p className="text-xs text-dim mt-1.5 mb-0">
                duplicate{preview.duplicates - (preview.phonesBackfilled ?? 0) === 1 ? "" : "s"} skipped
              </p>
            </div>
            <div>
              <p className="stat-number m-0">{missingContact}</p>
              <p className="text-xs text-dim mt-1.5 mb-0">missing phone/email</p>
            </div>
          </div>
          <p className="text-sm text-muted m-0">
            Into <span className="text-ink font-medium">{selectedCampaign?.name}</span>
            {" · "}
            <span className="text-ink font-medium">{focusDestination()}</span>
            .{" "}
            {preview.rows.filter((r) => !r.isDuplicate && r.row.phone).length} new with a phone
            {(preview.phonesBackfilled ?? 0) > 0
              ? ` · ${preview.phonesBackfilled} already in Focus will gain a phone (owner and status stay)`
              : ""}
            . Call counts leads that have a phone.
          </p>
          <div className="max-h-64 overflow-y-auto border border-rule rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-panel2 text-dim text-xs uppercase tracking-wide">
                  <th className="text-left font-semibold p-3">Business</th>
                  <th className="text-left font-semibold p-3">Phone</th>
                  <th className="text-left font-semibold p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-rule">
                    <td className="p-3">{r.row.business_name}</td>
                    <td className="p-3 text-muted">{r.row.phone ?? "—"}</td>
                    <td className="p-3">
                      {r.willBackfillPhone ? (
                        <Chip tone="go">Add phone</Chip>
                      ) : r.isDuplicate ? (
                        <Chip tone="cold">Duplicate</Chip>
                      ) : (
                        <Chip tone="go">New</Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Btn variant="primary" size="lg" loading={working} onClick={commit}>
            {working
              ? "Importing…"
              : (preview.phonesBackfilled ?? 0) > 0 && preview.total - preview.duplicates === 0
                ? `Add phones to ${preview.phonesBackfilled} leads`
                : `Import ${preview.total - preview.duplicates} leads${
                    (preview.phonesBackfilled ?? 0) > 0 ? ` · add ${preview.phonesBackfilled} phones` : ""
                  }`}
          </Btn>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-6">
          <div>
            <SectionLabel className="mb-3">Import complete</SectionLabel>
            <p className="next-action m-0 mb-1">
              {result.imported} new
              {(result.phonesBackfilled ?? 0) > 0 ? ` · ${result.phonesBackfilled} phones added to existing leads` : ""}
              {` · ${Math.max(0, result.duplicates - (result.phonesBackfilled ?? 0))} duplicates skipped`}
            </p>
            {result.missingContact > 0 && (
              <p className="text-sm text-muted m-0 mt-2">
                <Chip tone="stop">{result.missingContact} missing phone/email</Chip>
              </p>
            )}
          </div>
          <div className="space-y-3">
            <Btn variant="primary" size="lg" onClick={() => router.push("/focus")}>
              Open Focus
            </Btn>
            <div>
              <button type="button" onClick={reset} className="quiet-link">
                Done →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
