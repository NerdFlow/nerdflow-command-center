"use client";

import { useEffect, useRef, useState } from "react";
import type { Channel, ReplyLabel } from "@prisma/client";
import { Btn } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { REPLY_LABEL_TEXT, REPLY_LABELS } from "@/lib/replyLog";
import {
  beginLoggedReply,
  confirmLoggedReply,
  discardLoggedReply,
  searchMyLeads,
  type LoggedReplySuggestion,
} from "@/server/actions/replies";

const CHANNEL_LABEL: Record<Channel, string> = {
  call: "Call",
  email: "Email",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export function LogReplyDialog({
  leadId: initialLeadId,
  leadName: initialLeadName,
  channel: initialChannel,
  onClose,
  onConfirmed,
}: {
  leadId?: string | null;
  leadName?: string | null;
  channel?: Channel | null;
  onClose: () => void;
  onConfirmed: (leadId: string) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; businessName: string; city: string | null }[]>([]);
  const [leadId, setLeadId] = useState<string | null>(initialLeadId ?? null);
  const [leadName, setLeadName] = useState(initialLeadName ?? "");
  const [channel, setChannel] = useState<Channel>(initialChannel ?? "email");
  const [text, setText] = useState("");
  const [replyId, setReplyId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<LoggedReplySuggestion | null>(null);
  const [label, setLabel] = useState<ReplyLabel | null>(null);
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingNote, setMeetingNote] = useState("");
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmed = useRef(false);
  const replyIdRef = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const id = replyIdRef.current;
      if (!confirmed.current && id) void discardLoggedReply(id);
    };
  }, []);

  useEffect(() => {
    if (leadId || !query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchMyLeads(query).then(setResults);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, leadId]);

  function close() {
    onClose();
  }

  async function readReply() {
    if (!leadId || !text.trim()) return;
    setBusy("read");
    setError(null);
    try {
      const result = await beginLoggedReply({ leadId, channel, text: text.trim() });
      if (!mounted.current) {
        void discardLoggedReply(result.replyId);
        return;
      }
      replyIdRef.current = result.replyId;
      setReplyId(result.replyId);
      setSuggestion(result.suggestion);
      setLabel(result.suggestion?.label ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that reply.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!replyId || !label || !leadId) return;
    setBusy("save");
    setError(null);
    try {
      const meeting = label === "interested" && meetingAt ? new Date(meetingAt).toISOString() : undefined;
      await confirmLoggedReply({
        replyId,
        label,
        meetingAt: meeting,
        meetingNote: meetingNote.trim() || undefined,
      });
      confirmed.current = true;
      toast("Reply logged. Nothing was sent.");
      onConfirmed(leadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that label.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={close}>
      <div className="bg-panel border border-rule rounded-card p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-medium mb-1">Log a reply</h2>
        <p className="text-xs text-dim m-0 mb-3">Paste what they wrote. Confirm the label before it updates the lead. Nothing sends from here.</p>

        {!leadId ? (
          <div>
            <input
              className="w-full border border-rule rounded-lg px-3 py-2 bg-bg text-sm mb-2"
              placeholder="Search leads by business name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                className="block w-full text-left text-sm px-3 py-2 rounded hover:bg-panel2"
                onClick={() => {
                  setLeadId(r.id);
                  setLeadName(r.businessName);
                }}
              >
                {r.businessName} {r.city && <span className="text-muted">— {r.city}</span>}
              </button>
            ))}
          </div>
        ) : !replyId ? (
          <div className="space-y-2.5">
            <p className="text-sm m-0">
              For <b>{leadName || "this lead"}</b>
              {!initialLeadId && (
                <button type="button" className="text-xs text-accent ml-2" onClick={() => setLeadId(null)}>
                  change
                </button>
              )}
            </p>
            <select className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {(["email", "linkedin", "instagram", "call"] as Channel[]).map((item) => (
                <option key={item} value={item}>
                  {CHANNEL_LABEL[item]}
                </option>
              ))}
            </select>
            <textarea
              className="w-full border border-rule rounded-lg px-3 py-2 bg-bg text-sm min-h-[100px]"
              placeholder="Paste what they said…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-stop m-0">{error}</p>}
            <div className="flex gap-2">
              <Btn variant="primary" disabled={!text.trim()} loading={busy === "read"} onClick={() => void readReply()}>
                {busy === "read" ? "Reading…" : "Read reply"}
              </Btn>
              <Btn variant="ghost" onClick={close}>
                Cancel
              </Btn>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm m-0">
              For <b>{leadName || "this lead"}</b>
            </p>
            <p className="text-sm whitespace-pre-wrap m-0 bg-bg border border-rule rounded-lg px-3 py-2">{text}</p>
            {suggestion ? (
              <p className="text-sm text-muted m-0">Flow read this as {REPLY_LABEL_TEXT[suggestion.label]}. {suggestion.why}</p>
            ) : (
              <p className="text-sm text-muted m-0">Flow couldn&apos;t label this. Pick the label yourself.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {REPLY_LABELS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLabel(item)}
                  className={
                    "px-2.5 py-1.5 rounded-lg border text-xs font-medium " +
                    (label === item ? "border-accent bg-accent-soft text-accent" : "border-rule bg-panel2 text-muted")
                  }
                >
                  {REPLY_LABEL_TEXT[item]}
                </button>
              ))}
            </div>
            {label === "interested" && (
              <div className="space-y-2 border border-rule rounded-xl p-3">
                <p className="text-xs text-muted m-0">Leave the time empty to open a deal. Add a time to book the meeting.</p>
                <input
                  type="datetime-local"
                  className="w-full border border-rule rounded-lg px-2 py-1.5 bg-bg text-sm"
                  value={meetingAt}
                  onChange={(e) => setMeetingAt(e.target.value)}
                />
                <input
                  className="w-full border border-rule rounded-lg px-2 py-1.5 bg-bg text-sm"
                  placeholder="Meeting note (optional)"
                  value={meetingNote}
                  onChange={(e) => setMeetingNote(e.target.value)}
                />
              </div>
            )}
            {suggestion?.draft && (
              <div className="bg-panel2 border border-rule rounded-xl px-3 py-2">
                <p className="text-xs text-dim m-0 mb-1">Draft if you reply yourself</p>
                <p className="text-sm whitespace-pre-wrap m-0">{suggestion.draft}</p>
              </div>
            )}
            {error && <p className="text-sm text-stop m-0">{error}</p>}
            <div className="flex gap-2">
              <Btn variant="primary" disabled={!label} loading={busy === "save"} onClick={() => void save()}>
                {busy === "save" ? "Saving…" : meetingAt && label === "interested" ? "Book meeting" : "Confirm label"}
              </Btn>
              <Btn variant="ghost" onClick={close}>
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
