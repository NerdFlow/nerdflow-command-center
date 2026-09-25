"use client";

import { useState } from "react";
import { Btn, Panel } from "@/components/ui";
import { closeOutDay } from "@/server/actions/closeout";

export function EndOfDayCard({ alreadyClosedOut, existingSummary }: { alreadyClosedOut: boolean; existingSummary: string | null }) {
  const [done, setDone] = useState(alreadyClosedOut);
  const [summary, setSummary] = useState(existingSummary);
  const [blocker, setBlocker] = useState("");
  const [learning, setLearning] = useState("");
  const [saving, setSaving] = useState(false);

  if (done) {
    return (
      <Panel className="mb-6 bg-accent-soft">
        <p className="text-sm font-medium m-0">Closed out for today.</p>
        {summary && <p className="text-sm text-muted mt-1">{summary}</p>}
      </Panel>
    );
  }

  return (
    <Panel className="mb-6">
      <h2 className="text-[17px] font-medium mb-1">Close out your day</h2>
      <p className="text-sm text-muted mb-3">Two minutes, even on a slow day.</p>
      <textarea
        className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mb-2 text-sm"
        placeholder="Anything blocking you? (optional)"
        value={blocker}
        onChange={(e) => setBlocker(e.target.value)}
      />
      <textarea
        className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mb-3 text-sm"
        placeholder="One thing you learned today (optional)"
        value={learning}
        onChange={(e) => setLearning(e.target.value)}
      />
      <Btn
        variant="primary"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const res = await closeOutDay({ blocker, learning });
          setSummary(res.aiSummary);
          setDone(true);
          setSaving(false);
        }}
      >
        {saving ? "Closing out…" : "Close out today"}
      </Btn>
    </Panel>
  );
}
