"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Panel } from "@/components/ui";
import { estimateLeadGenRunCostUsd, startLeadGenRun } from "@/server/actions/leadgen";

type RunResult = {
  status: string;
  found: number;
  new: number;
  duplicates: number;
  rejectedAuto: number;
  narration: string | null;
  error: string | null;
  costUsd: unknown;
};

export function LeadGenRunner({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [maxLeads, setMaxLeads] = useState(10);
  const [estimatedCost, setEstimatedCost] = useState<number | null | "loading">(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEstimatedCost("loading");
    const handle = setTimeout(() => {
      estimateLeadGenRunCostUsd(campaignId, maxLeads)
        .then(setEstimatedCost)
        .catch(() => setEstimatedCost(null));
    }, 400);
    return () => clearTimeout(handle);
  }, [campaignId, maxLeads]);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await startLeadGenRun(campaignId, { location, keywords: [], maxLeads });
      setResult(r);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Panel>
      <h2 className="text-[17px] font-medium mb-3">Run lead generation</h2>
      <p className="text-sm text-muted mb-3">
        Searches Google for real businesses matching this campaign&apos;s ICP and search queries, checks each
        website, scores fit, and drops new ones straight into the Lead Inbox for you to approve or reject —
        nothing here queues a lead automatically.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="text-sm">
          Location
          <input
            className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1"
            placeholder="City or region"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={running}
          />
        </label>
        <label className="text-sm">
          Max leads (up to 25)
          <input
            type="number"
            min={1}
            max={25}
            className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1"
            value={maxLeads}
            onChange={(e) => setMaxLeads(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
            disabled={running}
          />
        </label>
      </div>

      <p className="text-xs text-muted mb-3">
        {estimatedCost === "loading" && "Estimating cost…"}
        {estimatedCost === null && "AI unavailable — this feature needs GEMINI_API_KEY configured."}
        {typeof estimatedCost === "number" && `Estimated cost for this run: $${estimatedCost.toFixed(3)}.`}
      </p>

      <Btn variant="primary" disabled={running || !location || typeof estimatedCost !== "number"} onClick={run}>
        {running ? "Running — this can take a minute…" : "Run now"}
      </Btn>

      {error && <p className="text-sm text-stop mt-3">{error}</p>}

      {result && (
        <div className="mt-4 bg-panel2 rounded-card p-3 text-sm">
          {result.status === "failed" ? (
            <p className="text-stop">Run failed: {result.error}</p>
          ) : (
            <>
              <p className="font-medium mb-1">{result.narration}</p>
              <p className="text-muted">
                Found {result.found} · New in inbox {result.new} · Duplicates {result.duplicates} · Rejected {result.rejectedAuto} · Actual
                cost ${Number(result.costUsd).toFixed(3)}
              </p>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
