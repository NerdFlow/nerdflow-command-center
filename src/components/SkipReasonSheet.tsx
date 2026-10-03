"use client";

import { useState } from "react";
import { pktDateStamp } from "@/lib/pipelineToday";
import { SKIP_REASON_LABEL, SKIP_REASONS, addDaysToStamp, defaultSkipReturnStamp, validSkipReturnStamp, type SkipReason } from "@/lib/skipReason";

export type SkipDetail = {
  reason: SkipReason;
  note: string | null;
  returnsOn: string | null;
};

export function SkipReasonSheet({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (detail: SkipDetail) => void }) {
  const today = pktDateStamp();
  const [note, setNote] = useState("");
  const [returnsOn, setReturnsOn] = useState(() => defaultSkipReturnStamp(today));
  const [error, setError] = useState<string | null>(null);

  function choose(reason: SkipReason) {
    if (reason === "not_now" && !validSkipReturnStamp(returnsOn, today)) {
      setError("Pick a later date. Not now brings the card back.");
      return;
    }
    onConfirm({
      reason,
      note: note.trim() || null,
      returnsOn: reason === "not_now" ? returnsOn : null,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="bg-panel border border-rule rounded-card p-5 w-full max-w-md space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <p className="section-label mb-1">Skip</p>
          <h2 className="text-[17px] font-medium m-0">Why?</h2>
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note (optional)"
          maxLength={500}
          rows={2}
          className="w-full border border-rule rounded-xl px-3 py-2 bg-bg text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {SKIP_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => choose(reason)}
              className="border border-rule bg-panel2 font-medium px-3 py-2 rounded-xl text-sm hover:border-accent/40"
            >
              {SKIP_REASON_LABEL[reason]}
            </button>
          ))}
        </div>
        <label className="block text-xs text-muted">
          Not now brings it back
          <input
            type="date"
            value={returnsOn}
            min={addDaysToStamp(today, 1)}
            onChange={(event) => setReturnsOn(event.target.value)}
            className="mt-1 w-full border border-rule rounded-xl px-3 py-2 bg-bg text-sm"
          />
        </label>
        {error && <p className="text-sm text-stop m-0">{error}</p>}
        <button type="button" onClick={onCancel} className="text-xs text-dim hover:text-ink px-1 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}
