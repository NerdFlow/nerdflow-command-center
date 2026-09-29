"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Chip, Panel } from "@/components/ui";
import {
  getReplyDetail,
  classifyReply,
  rewriteReplyDraft,
  markReplySent,
  bookMeetingFromReply,
  snoozeReply,
  closeLeadFromReply,
  applyUnsubscribe,
  searchMyLeads,
  logManualReply,
} from "@/server/actions/replies";
import type { Channel, ReplyLabel, LostReason } from "@prisma/client";

type ReplyRow = { id: string; businessName: string; channel: Channel; label: ReplyLabel | null; text: string; receivedAt: string };
type ReplyDetail = Awaited<ReturnType<typeof getReplyDetail>>;

const CHANNEL_LABEL: Record<Channel, string> = { call: "Call", email: "Email", instagram: "Instagram", linkedin: "LinkedIn" };
const LABEL_TONE: Record<ReplyLabel, "go" | "acc" | "stop" | "default"> = {
  interested: "go",
  question: "acc",
  objection: "stop",
  not_now: "default",
  unsubscribe: "stop",
  out_of_office: "default",
  wrong_person: "default",
};
const LABEL_TEXT: Record<ReplyLabel, string> = {
  interested: "Interested",
  question: "Asked a question",
  objection: "Objection",
  not_now: "Not now",
  unsubscribe: "Unsubscribe",
  out_of_office: "Out of office",
  wrong_person: "Wrong person",
};
const CLOSE_REASONS: { value: LostReason; label: string }[] = [
  { value: "not_fit", label: "Not a fit" },
  { value: "timing", label: "Wrong timing" },
  { value: "competitor", label: "Has a competitor tool" },
  { value: "price", label: "No budget" },
  { value: "went_silent", label: "Ghost — no response" },
];

export function RepliesClient({ replies: initialReplies }: { replies: ReplyRow[] }) {
  const router = useRouter();
  const [replies, setReplies] = useState(initialReplies);
  const [filter, setFilter] = useState<ReplyLabel | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialReplies[0]?.id ?? null);
  const [detail, setDetail] = useState<ReplyDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const counts = replies.reduce<Partial<Record<ReplyLabel, number>>>((acc, r) => {
    if (r.label) acc[r.label] = (acc[r.label] ?? 0) + 1;
    return acc;
  }, {});
  const visible = filter === "all" ? replies : replies.filter((r) => r.label === filter);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    getReplyDetail(selectedId)
      .then(setDetail)
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  function removeFromList(id: string) {
    setReplies((prev) => prev.filter((r) => r.id !== id));
    setSelectedId((cur) => (cur === id ? (replies.find((r) => r.id !== id)?.id ?? null) : cur));
    router.refresh();
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "320px 1fr 360px" }}>
      <div>
        <div className="flex justify-between items-start mb-1">
          <div>
            <h1 className="text-[22px] tracking-tight mb-0.5">Replies</h1>
            <p className="text-sm text-muted m-0">{replies.length} waiting on you</p>
          </div>
          <Btn size="sm" onClick={() => setLogOpen(true)}>
            + Log a reply
          </Btn>
        </div>

        <div className="flex flex-wrap gap-1.5 my-3">
          <button
            onClick={() => setFilter("all")}
            className={"text-xs px-2.5 py-1 rounded-full border " + (filter === "all" ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted")}
          >
            All {replies.length}
          </button>
          {(Object.keys(LABEL_TEXT) as ReplyLabel[])
            .filter((l) => counts[l])
            .map((l) => (
              <button
                key={l}
                onClick={() => setFilter(l)}
                className={"text-xs px-2.5 py-1 rounded-full border " + (filter === l ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted")}
              >
                {LABEL_TEXT[l]} {counts[l]}
              </button>
            ))}
        </div>

        <div className="space-y-0.5">
          {visible.length === 0 && <p className="text-sm text-muted py-4">Nobody&apos;s waiting on you.</p>}
          {visible.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={"block w-full text-left px-3 py-2.5 rounded-lg border-l-2 " + (selectedId === r.id ? "border-accent bg-panel2" : "border-transparent hover:bg-panel2")}
            >
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-medium text-sm truncate">{r.businessName}</span>
                <span className="text-xs text-muted shrink-0">{timeAgo(r.receivedAt)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 mb-1">
                <span className="text-xs text-muted">{CHANNEL_LABEL[r.channel]}</span>
                {r.label && <Chip tone={LABEL_TONE[r.label]}>{LABEL_TEXT[r.label]}</Chip>}
              </div>
              <p className="text-xs text-muted m-0 truncate">{r.text}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        {!selectedId && (
          <Panel>
            <p className="text-muted">Pick a reply from the list.</p>
          </Panel>
        )}
        {selectedId && loadingDetail && (
          <Panel>
            <p className="text-muted">Loading…</p>
          </Panel>
        )}
        {selectedId && !loadingDetail && detail && <ReplyDetailPanel detail={detail} />}
      </div>

      <div>
        {selectedId && detail && (
          <DraftPanel
            key={selectedId}
            replyId={selectedId}
            initialLabel={detail.reply.label}
            initialDraft={detail.reply.responseDraft}
            onHandled={() => removeFromList(selectedId)}
          />
        )}
      </div>

      {logOpen && <LogReplyModal onClose={() => setLogOpen(false)} onLogged={() => router.refresh()} />}
    </div>
  );
}

function ReplyDetailPanel({ detail }: { detail: ReplyDetail }) {
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="text-[17px] font-medium m-0">{detail.lead.businessName}</h2>
            <p className="text-sm text-muted m-0">{detail.lead.contactName ?? "Contact unknown"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted m-0">{CHANNEL_LABEL[detail.reply.channel]}</p>
            {detail.reply.label && <Chip tone={LABEL_TONE[detail.reply.label]}>{LABEL_TEXT[detail.reply.label]}</Chip>}
          </div>
        </div>

        <p className="text-xs text-muted uppercase tracking-wide mb-1">Their reply</p>
        <p className="text-sm whitespace-pre-wrap bg-panel2 rounded-lg p-3 mb-3">{detail.reply.text}</p>
        <p className="text-xs text-muted m-0">{timeAgo(detail.reply.receivedAt as unknown as string)}</p>
      </Panel>

      <Panel>
        <p className="text-xs text-muted uppercase tracking-wide mb-2">Contact info</p>
        {detail.lead.email && <p className="text-sm m-0 mb-1">✉ {detail.lead.email}</p>}
        {detail.lead.phone && <p className="text-sm m-0">☎ {detail.lead.phone}</p>}
        {!detail.lead.email && !detail.lead.phone && <p className="text-sm text-muted m-0">No contact info on file.</p>}
      </Panel>

      <Panel>
        <p className="text-xs text-muted uppercase tracking-wide mb-2">History</p>
        {detail.history.length === 0 ? (
          <p className="text-sm text-muted m-0">Nothing logged yet.</p>
        ) : (
          <ul className="list-none m-0 p-0 space-y-1.5">
            {detail.history.map((h, i) => (
              <li key={i} className="text-sm flex justify-between">
                <span>
                  {CHANNEL_LABEL[h.channel]} · {h.label === "sent" ? "Sent" : h.label === "replied" ? "Replied" : h.label.replace("_", " ")}
                </span>
                <span className="text-muted">{timeAgo(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function DraftPanel({
  replyId,
  initialLabel,
  initialDraft,
  onHandled,
}: {
  replyId: string;
  initialLabel: ReplyLabel | null;
  initialDraft: string | null;
  onHandled: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [draft, setDraft] = useState(initialDraft);
  const [classifying, setClassifying] = useState(false);
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingNote, setMeetingNote] = useState("");
  const [showClose, setShowClose] = useState(false);

  useEffect(() => {
    if (!initialLabel) void classify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyId]);

  async function classify() {
    setClassifying(true);
    setError(null);
    try {
      const result = await classifyReply(replyId);
      if (result.source === "ai") {
        setLabel(result.class);
        setDraft(result.draft_reply);
      } else {
        setError(`AI unavailable (${result.reason}) — classify manually or write your own reply below.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't classify this reply.");
    } finally {
      setClassifying(false);
    }
  }

  async function rewrite(instruction: "shorter" | "casual" | "new_angle") {
    setRewriting(instruction);
    setError(null);
    try {
      const newDraft = await rewriteReplyDraft(replyId, instruction);
      setDraft(newDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rewrite that.");
    } finally {
      setRewriting(null);
    }
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onHandled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function copy() {
    if (!draft) return;
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (label === "unsubscribe") {
    return (
      <Panel>
        <p className="text-sm mb-3">This reply asked to stop being contacted.</p>
        {error && <p className="text-sm text-stop mb-2">{error}</p>}
        <Btn variant="stop" disabled={busy === "unsub"} onClick={() => run("unsub", () => applyUnsubscribe(replyId))}>
          {busy === "unsub" ? "Applying…" : "Set do-not-contact"}
        </Btn>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <p className="text-sm font-medium mb-2">Here&apos;s what I&apos;d send</p>
        {classifying ? (
          <p className="text-sm text-muted">Reading the reply…</p>
        ) : draft ? (
          <>
            <textarea
              className="w-full border border-rule rounded-lg px-3 py-2 bg-bg text-sm min-h-[160px] mb-2"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Btn size="sm" onClick={copy}>
                {copied ? "Copied!" : "Copy"}
              </Btn>
              <Btn size="sm" variant="ghost" disabled={rewriting !== null} onClick={() => rewrite("shorter")}>
                {rewriting === "shorter" ? "…" : "Shorter"}
              </Btn>
              <Btn size="sm" variant="ghost" disabled={rewriting !== null} onClick={() => rewrite("casual")}>
                {rewriting === "casual" ? "…" : "Casual"}
              </Btn>
              <Btn size="sm" variant="ghost" disabled={rewriting !== null} onClick={() => rewrite("new_angle")}>
                {rewriting === "new_angle" ? "…" : "New angle"}
              </Btn>
            </div>
          </>
        ) : (
          <Btn size="sm" disabled={classifying} onClick={classify}>
            Draft a response with Flow
          </Btn>
        )}
      </Panel>

      {error && <p className="text-sm text-stop">{error}</p>}

      <Panel>
        <p className="text-xs text-muted uppercase tracking-wide mb-2">Actions</p>
        <div className="space-y-2">
          <Btn variant="go" className="w-full justify-center" disabled={busy !== null} onClick={() => run("sent", () => markReplySent(replyId))}>
            {busy === "sent" ? "Marking…" : "Mark as sent"}
          </Btn>

          {!showMeeting ? (
            <Btn variant="ghost" className="w-full justify-center" disabled={busy !== null} onClick={() => setShowMeeting(true)}>
              Book meeting
            </Btn>
          ) : (
            <div className="border border-rule rounded-lg p-2.5 space-y-2">
              <input
                type="datetime-local"
                className="w-full border border-rule rounded px-2 py-1.5 bg-bg text-sm"
                value={meetingAt}
                onChange={(e) => setMeetingAt(e.target.value)}
              />
              <input
                className="w-full border border-rule rounded px-2 py-1.5 bg-bg text-sm"
                placeholder="Note (optional)"
                value={meetingNote}
                onChange={(e) => setMeetingNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Btn
                  size="sm"
                  variant="primary"
                  disabled={!meetingAt || busy !== null}
                  onClick={() => run("meeting", () => bookMeetingFromReply(replyId, new Date(meetingAt).toISOString(), meetingNote))}
                >
                  {busy === "meeting" ? "Booking…" : "Confirm"}
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => setShowMeeting(false)}>
                  Cancel
                </Btn>
              </div>
            </div>
          )}

          <Btn variant="ghost" className="w-full justify-center" disabled={busy !== null} onClick={() => run("snooze", () => snoozeReply(replyId))}>
            {busy === "snooze" ? "Snoozing…" : "Snooze"}
          </Btn>

          {!showClose ? (
            <button className="w-full text-left text-sm text-stop px-1 py-1" onClick={() => setShowClose(true)}>
              Close lead — choose reason
            </button>
          ) : (
            <div className="border border-rule rounded-lg p-2.5 space-y-1.5">
              {CLOSE_REASONS.map((r) => (
                <button
                  key={r.value}
                  disabled={busy !== null}
                  className="block w-full text-left text-sm px-2 py-1.5 rounded hover:bg-panel2"
                  onClick={() => run("close", () => closeLeadFromReply(replyId, r.value))}
                >
                  {r.label}
                </button>
              ))}
              <button className="text-xs text-muted px-2" onClick={() => setShowClose(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function LogReplyModal({ onClose, onLogged }: { onClose: () => void; onLogged: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; businessName: string; city: string | null }[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadName, setLeadName] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function submit() {
    if (!leadId || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await logManualReply(leadId, channel, text);
      onLogged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log that reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-panel border border-rule rounded-card p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-medium mb-3">Log a reply</h2>

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
        ) : (
          <div className="space-y-2.5">
            <p className="text-sm">
              For <b>{leadName}</b>{" "}
              <button className="text-xs text-accent" onClick={() => setLeadId(null)}>
                change
              </button>
            </p>
            <select className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {(["email", "call", "instagram", "linkedin"] as Channel[]).map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
            <textarea
              className="w-full border border-rule rounded-lg px-3 py-2 bg-bg text-sm min-h-[100px]"
              placeholder="Paste what they said…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {error && <p className="text-sm text-stop">{error}</p>}
            <div className="flex gap-2">
              <Btn variant="primary" disabled={!text.trim() || busy} onClick={submit}>
                {busy ? "Logging…" : "Log reply"}
              </Btn>
              <Btn variant="ghost" onClick={onClose}>
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
