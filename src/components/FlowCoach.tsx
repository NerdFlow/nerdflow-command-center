"use client";

import { useState } from "react";
import { confirmFlowCoach } from "@/server/actions/flowCoach";
import { channelLabel, coachPrompt, matchCoachCandidates, type CoachCandidate } from "@/lib/flowCoach";
import { leadShortCode } from "@/lib/todayCards";
import type { CoachDirectoryLead } from "@/lib/shapeCard";

type Logged = Awaited<ReturnType<typeof confirmFlowCoach>>;

export function FlowCoach({
  assistantName,
  leads,
  onClose,
  onLogged,
}: {
  assistantName: string;
  leads: CoachDirectoryLead[];
  onClose: () => void;
  onLogged: (result: Logged) => void;
}) {
  const name = assistantName.trim() && assistantName !== "Sales Pipeline" ? assistantName.trim() : "Flow";
  const [note, setNote] = useState("");
  const [matches, setMatches] = useState<CoachCandidate[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const prompt = matches ? coachPrompt(matches) : null;
  const selected = matches?.find((match) => match.id === selectedId) ?? matches?.[0] ?? null;

  function review() {
    const found = matchCoachCandidates(note, leads.map((lead) => ({ ...lead, shortCode: leadShortCode(lead.id) })));
    setMatches(found);
    setSelectedId(found[0]?.id ?? null);
    setSaved(null);
    setError(null);
  }

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmFlowCoach({ leadId: selected.id, note });
      onLogged(result);
      const who = selected.contactName?.trim().split(/\s+/)[0] || selected.businessName;
      setSaved(`Logged for ${who}. A Reply card is on Today. Nothing was sent. Sheet sync is not connected yet — the note is in the audit log.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log that. Nothing was sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-bg overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-label mb-2">Coach</p>
            <h2 className="page-title m-0">Tell {name} what happened</h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink px-2 py-1">
            Close
          </button>
        </div>

        <div className="bg-panel border border-rule rounded-2xl px-4 py-3">
          <p className="text-xs text-dim mb-1">You</p>
          {matches ? (
            <p className="text-sm m-0 whitespace-pre-wrap">{note}</p>
          ) : (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tony messaged me on LinkedIn — interested in a demo next week."
              className="w-full border-0 bg-transparent text-sm resize-none min-h-[88px] focus:outline-none"
            />
          )}
        </div>

        {!matches && (
          <button
            type="button"
            onClick={review}
            disabled={!note.trim()}
            className="bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-sm disabled:opacity-40"
          >
            Tell {name}
          </button>
        )}

        {prompt && (
          <div className="bg-cold-soft border border-accent/15 rounded-2xl px-4 py-4 space-y-3">
            <p className="section-label mb-0 text-accent">{name}</p>
            <p className="text-lg font-semibold m-0">{prompt.title}</p>
            <p className="text-sm text-muted m-0">{prompt.body}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {matches?.map((match) => {
                const on = selected?.id === match.id;
                return (
                  <button
                    type="button"
                    key={match.id}
                    onClick={() => setSelectedId(match.id)}
                    className={
                      "text-left rounded-xl border px-3 py-3 bg-panel " + (on ? "border-accent" : "border-rule")
                    }
                  >
                    <p className="text-sm font-medium m-0">
                      {match.contactName?.trim() || "Unknown"} · {match.businessName}
                    </p>
                    <p className="text-xs text-dim mt-1 mb-0">
                      {match.shortCode} · {channelLabel(match.channel)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {matches && !saved && (
          <div className="flex flex-wrap gap-2">
            {selected && (
              <button type="button" disabled={busy} onClick={() => void confirm()} className="bg-accent text-on-accent font-semibold px-4 py-2.5 rounded-xl text-sm disabled:opacity-40">
                {busy ? "Logging…" : `Confirm ${selected.businessName}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMatches(null);
                setError(null);
              }}
              className="border border-rule bg-panel font-semibold px-4 py-2.5 rounded-xl text-sm"
            >
              Neither
            </button>
          </div>
        )}

        {saved && <p className="text-sm text-ink m-0">{saved}</p>}
        {error && <p className="text-sm text-stop m-0">{error}</p>}
        <p className="text-xs text-dim m-0">After confirm → log reply + create Reply card on Today. Never auto-sends.</p>
      </div>
    </div>
  );
}
