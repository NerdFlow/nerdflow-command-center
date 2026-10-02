"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncPipelineToday } from "@/server/actions/pipelineToday";
import type { FocusSyncState } from "@/server/todayBoard";

export function TodaySyncPanel({ sync }: { sync: FocusSyncState }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<"sheets" | "paste" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = sync.ownerName.trim().split(/\s+/)[0] || "Muqeet";

  async function run(source: "sheets" | "paste") {
    setPending(source);
    setError(null);
    setMessage(null);
    try {
      const result = await syncPipelineToday(source === "paste" ? { source, text } : { source });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      setText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sync Today.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="bg-panel border border-rule rounded-xl p-4 space-y-3">
      <div>
        <p className="section-label mb-1">Sync Today</p>
        <p className="text-sm text-muted m-0">
          Pulls the Sales Pipeline Today tab into {first}&apos;s Focus. One row, one card. Call rows are left out. Nothing is sent.
        </p>
      </div>
      <p className="text-xs text-dim m-0">
        {sync.queueDate}
        {sync.openCount > 0 ? ` · ${sync.openCount} open` : ""}
        {sync.lastSummary ? ` · last sync ${sync.lastSummary}` : " · not synced yet"}
      </p>
      {sync.sheetsConfigured ? (
        <button
          type="button"
          onClick={() => void run("sheets")}
          disabled={pending !== null}
          className="bg-accent text-on-accent font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-accent-hover disabled:opacity-40"
        >
          {pending === "sheets" ? "Syncing…" : "Sync from the sheet"}
        </button>
      ) : (
        <p className="text-xs text-muted m-0">
          Google Sheets isn&apos;t connected{sync.sheetsReason ? ` (${sync.sheetsReason})` : ""}. Paste columns A–G below, or add{" "}
          <span className="font-mono">GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON</span>. See docs/PIPELINE_TODAY_SYNC.md.
        </p>
      )}
      <label className="block space-y-1.5">
        <span className="text-xs text-dim">Paste Today (Time, Name, Company, Action, Link, Message, Done)</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder={"Time\tName\tCompany\tAction\tLink\tMessage\tDone"}
          className="w-full border border-rule rounded-xl px-3 py-2 bg-bg text-sm font-mono"
        />
      </label>
      <button
        type="button"
        onClick={() => void run("paste")}
        disabled={pending !== null || text.trim().length === 0}
        className="border border-rule bg-panel font-semibold px-4 py-2.5 rounded-xl text-sm disabled:opacity-40"
      >
        {pending === "paste" ? "Importing…" : "Import paste"}
      </button>
      {message && <p className="text-sm text-accent m-0">{message}</p>}
      {error && <p className="text-sm text-stop m-0">{error}</p>}
    </div>
  );
}
