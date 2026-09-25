"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Btn, Chip } from "@/components/ui";
import { approveLead, rejectLead, bulkApproveAboveScore, bulkRejectNoChannel } from "@/server/actions/leads";
import { LEAD_REJECT_REASONS } from "@/server/leads";

type LeadRow = {
  id: string;
  businessName: string;
  contactName: string | null;
  city: string | null;
  fitScore: number;
  fitReasons: string[];
  fitFlags: string[];
  campaignName: string;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
  signals: Record<string, unknown>;
};

function scoreTone(score: number): "go" | "default" | "stop" {
  if (score >= 70) return "go";
  if (score >= 40) return "default";
  return "stop";
}

export function LeadInboxTable({ leads }: { leads: LeadRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState<(typeof LEAD_REJECT_REASONS)[number]>(LEAD_REJECT_REASONS[0]);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = pending || busyId !== null;

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function run(id: string, fn: () => Promise<unknown>, onDone?: () => void) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      onDone?.();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && <p className="text-sm text-stop mb-2">{error}</p>}
      <div className="flex gap-2 mb-3">
        <Btn
          size="sm"
          onClick={() =>
            run("bulk-approve", async () => {
              const n = await bulkApproveAboveScore(70);
              alert(`Approved ${n} lead${n === 1 ? "" : "s"} with fit score 70+.`);
            })
          }
          disabled={busy}
        >
          {busyId === "bulk-approve" ? "Approving…" : "Bulk approve ≥ 70"}
        </Btn>
        <Btn
          size="sm"
          variant="stop"
          onClick={() =>
            run("bulk-reject", async () => {
              const n = await bulkRejectNoChannel();
              alert(`Rejected ${n} lead${n === 1 ? "" : "s"} with no reachable channel.`);
            })
          }
          disabled={busy}
        >
          {busyId === "bulk-reject" ? "Rejecting…" : "Reject: no reachable channel"}
        </Btn>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left font-medium text-muted py-1.5 px-2 border-b border-rule">Fit</th>
              <th className="text-left font-medium text-muted py-1.5 px-2 border-b border-rule">Lead</th>
              <th className="text-left font-medium text-muted py-1.5 px-2 border-b border-rule">Campaign</th>
              <th className="text-left font-medium text-muted py-1.5 px-2 border-b border-rule">Source</th>
              <th className="text-left font-medium text-muted py-1.5 px-2 border-b border-rule">Found</th>
              <th className="text-left font-medium text-muted py-1.5 px-2 border-b border-rule">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td className="py-2.5 px-2 border-b border-rule align-top">
                  <Chip tone={scoreTone(lead.fitScore)}>{lead.fitScore}</Chip>
                </td>
                <td className="py-2.5 px-2 border-b border-rule align-top">
                  <div className="font-medium">{lead.businessName}</div>
                  <div className="text-xs text-muted">
                    {[lead.contactName, lead.city].filter(Boolean).join(" · ")}
                  </div>
                  <div>
                    {Object.entries(lead.signals)
                      .filter(([, v]) => v === true)
                      .slice(0, 3)
                      .map(([k]) => (
                        <Chip key={k} tone="acc">
                          {k.replace(/_/g, " ")}
                        </Chip>
                      ))}
                    {lead.fitFlags.map((f) => (
                      <Chip key={f} tone="stop">
                        {f}
                      </Chip>
                    ))}
                  </div>
                </td>
                <td className="py-2.5 px-2 border-b border-rule align-top">{lead.campaignName}</td>
                <td className="py-2.5 px-2 border-b border-rule align-top">
                  {lead.sourceUrl ? (
                    <a href={lead.sourceUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                      {lead.source}
                    </a>
                  ) : (
                    lead.source
                  )}
                </td>
                <td className="py-2.5 px-2 border-b border-rule align-top text-muted">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </td>
                <td className="py-2.5 px-2 border-b border-rule align-top">
                  {rejecting === lead.id ? (
                    <div className="flex flex-col gap-1.5 min-w-[180px]">
                      <select
                        className="border border-rule rounded px-1.5 py-1 bg-panel text-xs"
                        value={reason}
                        onChange={(e) => setReason(e.target.value as (typeof LEAD_REJECT_REASONS)[number])}
                      >
                        {LEAD_REJECT_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {reason === "Other" && (
                        <input
                          className="border border-rule rounded px-1.5 py-1 bg-panel text-xs"
                          placeholder="Note"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      )}
                      <div className="flex gap-1.5">
                        <Btn
                          size="sm"
                          variant="stop"
                          disabled={busyId === lead.id}
                          onClick={() => run(lead.id, () => rejectLead(lead.id, reason, note || undefined), () => setRejecting(null))}
                        >
                          {busyId === lead.id ? "Rejecting…" : "Confirm"}
                        </Btn>
                        <Btn size="sm" variant="ghost" disabled={busyId === lead.id} onClick={() => setRejecting(null)}>
                          Cancel
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <Btn size="sm" variant="primary" disabled={busyId === lead.id} onClick={() => run(lead.id, () => approveLead(lead.id))}>
                        {busyId === lead.id ? "Approving…" : "Approve"}
                      </Btn>
                      <Btn size="sm" variant="stop" disabled={busy} onClick={() => setRejecting(lead.id)}>
                        Reject
                      </Btn>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
