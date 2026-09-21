"use client";

import { useState } from "react";
import { Bar, Btn, Panel } from "@/components/ui";
import { closeOutDay } from "@/server/actions/closeout";

export function CloseOutClient({
  perMetric,
  overallPct,
  alreadyClosedOut,
  existingSummary,
  existingBlocker,
  existingLearning,
}: {
  perMetric: { metric: string; label: string; count: number; target: number; pct: number }[];
  overallPct: number;
  alreadyClosedOut: boolean;
  existingSummary: string | null;
  existingBlocker: string;
  existingLearning: string;
}) {
  const [blocker, setBlocker] = useState(existingBlocker);
  const [learning, setLearning] = useState(existingLearning);
  const [done, setDone] = useState(alreadyClosedOut);
  const [summary, setSummary] = useState(existingSummary);
  const [streak, setStreak] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <div className="max-w-lg space-y-4">
      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Today vs targets</h2>
        {perMetric.map((m) => (
          <div key={m.metric} className="mb-2.5">
            <div className="flex justify-between text-sm">
              <span>{m.label}</span>
              <span className="text-muted">
                {m.count} / {m.target}
              </span>
            </div>
            <Bar pct={m.pct} tone={m.pct >= 100 ? "go" : "accent"} />
          </div>
        ))}
        <p className="text-sm font-medium mt-2">Overall: {overallPct}%</p>
      </Panel>

      {done ? (
        <Panel>
          <p className="text-sm font-medium mb-1">Closed out for today.</p>
          {summary && <p className="text-sm text-muted mb-1">{summary}</p>}
          {streak !== null && <p className="text-sm text-muted">Streak: {streak} day{streak === 1 ? "" : "s"}</p>}
        </Panel>
      ) : (
        <Panel>
          <label className="block text-sm mb-3">
            Anything blocking you?
            <textarea className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={blocker} onChange={(e) => setBlocker(e.target.value)} />
          </label>
          <label className="block text-sm mb-3">
            One thing you learned today
            <textarea className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={learning} onChange={(e) => setLearning(e.target.value)} />
          </label>
          <Btn
            variant="primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const res = await closeOutDay({ blocker, learning });
              setSummary(res.aiSummary);
              setStreak(res.streakAfter);
              setDone(true);
              setSaving(false);
            }}
          >
            {saving ? "Closing out…" : "Close out today"}
          </Btn>
        </Panel>
      )}
    </div>
  );
}
