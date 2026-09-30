"use client";

import { useState } from "react";
import { Btn, SectionLabel } from "@/components/ui";
import { closeOutDay } from "@/server/actions/closeout";

export function EndOfDayCard({ alreadyClosedOut, existingSummary }: { alreadyClosedOut: boolean; existingSummary: string | null }) {
  const [done, setDone] = useState(alreadyClosedOut);
  const [summary, setSummary] = useState(existingSummary);
  const [blocker, setBlocker] = useState("");
  const [learning, setLearning] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (done) {
    return (
      <div className="rounded-card border border-accent/25 bg-accent-soft px-5 py-4">
        <p className="text-sm font-medium m-0">Day closed.</p>
        {summary && <p className="text-sm text-muted mt-1 mb-0">{summary}</p>}
      </div>
    );
  }

  return (
    <div className="border-t border-rule pt-8 mt-10">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-left group">
        <div>
          <SectionLabel className="mb-1">End of day</SectionLabel>
          <p className="text-base font-medium m-0 text-ink group-hover:text-accent transition-colors">Close out when you&apos;re done</p>
          <p className="text-sm text-muted m-0 mt-0.5">Two minutes — even on a slow day.</p>
        </div>
        <span className="text-dim text-sm">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3 max-w-md animate-fade-up">
          <textarea
            className="w-full border border-rule rounded-xl px-3 py-2.5 bg-panel text-sm focus:border-accent/40 focus:outline-none"
            placeholder="Anything blocking you? (optional)"
            value={blocker}
            onChange={(e) => setBlocker(e.target.value)}
            rows={2}
          />
          <textarea
            className="w-full border border-rule rounded-xl px-3 py-2.5 bg-panel text-sm focus:border-accent/40 focus:outline-none"
            placeholder="One thing you learned today (optional)"
            value={learning}
            onChange={(e) => setLearning(e.target.value)}
            rows={2}
          />
          {error && <p className="text-sm text-stop m-0">{error}</p>}
          <Btn
            variant="default"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const res = await closeOutDay({ blocker, learning });
                setSummary(res.aiSummary);
                setDone(true);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't close out — try again.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Closing out…" : "Close out today"}
          </Btn>
        </div>
      )}
    </div>
  );
}
