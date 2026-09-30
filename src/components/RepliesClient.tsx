"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Chip, Panel } from "@/components/ui";
import { useToast } from "@/components/Toast";
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
  getRepliesOverview,
} from "@/server/actions/replies";
import type { Channel, ReplyLabel, LostReason } from "@prisma/client";

type Overview = Awaited<ReturnType<typeof getRepliesOverview>>;
type ReplyRow = Overview["openReplies"][number];
type WaitingRow = Overview["waitingForReply"][number];
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

function channelLink(channel: "gmail" | "instagram" | "linkedin", value: string) {
  if (channel === "gmail") return `https://mail.google.com/mail/?authuser=${encodeURIComponent(value)}`;
  if (channel === "instagram") return `https://instagram.com/${value.replace(/^@/, "")}`;
  return value.startsWith("http") ? value : `https://${value}`;
}

export function RepliesClient({ overview }: { overview: Overview }) {
  const router = useRouter();
  const [openReplies, setOpenReplies] = useState(overview.openReplies);
  const [waiting, setWaiting] = useState(overview.waitingForReply);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReplyDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [prefillLead, setPrefillLead] = useState<{ id: string; name: string; channel: Channel } | null>(null);

  useEffect(() => {
    if (!expandedId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    getReplyDetail(expandedId)
      .then(setDetail)
      .finally(() => setLoadingDetail(false));
  }, [expandedId]);

  function removeFromWaitingOnYou(id: string) {
    setOpenReplies((prev) => prev.filter((r) => r.id !== id));
    setExpandedId((cur) => (cur === id ? null : cur));
    router.refresh();
  }

  const { gmail, instagram, linkedin } = overview.channelAccounts;
  const oldestHours =
    openReplies.length > 0
      ? (Date.now() - new Date(openReplies[0]!.receivedAt).getTime()) / (1000 * 60 * 60)
      : 0;

  return (
    <div className="max-w-cockpit animate-fade-up">
      <div className="mb-8">
        <h1 className="page-title m-0 mb-1">Replies</h1>
        <p className="text-muted text-sm m-0">People waiting on you — answer the oldest first.</p>
      </div>

      <div className="flex flex-wrap gap-8 mb-8">
        <div>
          <p className="stat-number m-0">{openReplies.length}</p>
          <p className="text-xs text-dim m-0 mt-1">Need your reply</p>
        </div>
        <div>
          <p className="stat-number m-0">{overview.summary.repliedThisWeek}</p>
          <p className="text-xs text-dim m-0 mt-1">Replied this week</p>
        </div>
        <div>
          <p className="stat-number m-0">{overview.summary.messagedThisWeek}</p>
          <p className="text-xs text-dim m-0 mt-1">You messaged</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {gmail && (
          <a href={channelLink("gmail", gmail)} target="_blank" rel="noreferrer">
            <Btn size="sm" variant="ghost">
              Open Gmail
            </Btn>
          </a>
        )}
        {instagram && (
          <a href={channelLink("instagram", instagram)} target="_blank" rel="noreferrer">
            <Btn size="sm" variant="ghost">
              Open Instagram
            </Btn>
          </a>
        )}
        {linkedin && (
          <a href={channelLink("linkedin", linkedin)} target="_blank" rel="noreferrer">
            <Btn size="sm" variant="ghost">
              Open LinkedIn
            </Btn>
          </a>
        )}
        {!gmail && !instagram && !linkedin && (
          <p className="text-xs text-dim m-0">Add your inboxes in Profile for quick-open links.</p>
        )}
      </div>

      <div className="flex justify-between items-center mb-3">
        <h2 className="text-base font-semibold m-0">
          Waiting on you
          {openReplies.length > 0 && oldestHours >= 24 && (
            <span className="ml-2 text-stop font-medium text-sm">· oldest is {Math.floor(oldestHours / 24)}d late</span>
          )}
        </h2>
        <Btn
          size="sm"
          variant="ghost"
          onClick={() => {
            setPrefillLead(null);
            setLogOpen(true);
          }}
        >
          + Log a reply
        </Btn>
      </div>

      {openReplies.length === 0 && (
        <p className="text-sm text-muted mb-8 py-6 border border-dashed border-rule rounded-card text-center">Nobody&apos;s waiting on you. Nice.</p>
      )}

      <div className="space-y-2 mb-10">
        {openReplies.map((r) => {
          const ageH = (Date.now() - new Date(r.receivedAt).getTime()) / (1000 * 60 * 60);
          const late = ageH >= 24;
          const isOpen = expandedId === r.id;
          return (
            <div key={r.id}>
              <button
                type="button"
                onClick={() => setExpandedId((cur) => (cur === r.id ? null : r.id))}
                className={
                  "block w-full text-left px-4 py-3.5 rounded-card border transition-colors " +
                  (isOpen
                    ? "border-accent bg-panel"
                    : late
                      ? "border-stop/35 bg-stop-soft/40 hover:border-stop/50"
                      : "border-rule bg-panel hover:border-accent/40")
                }
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-semibold text-sm">{r.businessName}</span>
                  <span className={"text-xs shrink-0 font-medium " + (late ? "text-stop" : "text-dim")}>
                    {late ? `${Math.floor(ageH / 24)}d waiting` : timeAgo(r.receivedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 mb-1">
                  <span className="text-xs text-dim">{CHANNEL_LABEL[r.channel]}</span>
                  {r.label && <Chip tone={LABEL_TONE[r.label]}>{LABEL_TEXT[r.label]}</Chip>}
                </div>
                {!isOpen && <p className="text-xs text-muted m-0 truncate">{r.text}</p>}
              </button>

              {isOpen && (
                <div className="mt-2 space-y-3 animate-fade-up">
                  {loadingDetail && <p className="text-muted text-sm px-1">Loading…</p>}
                  {!loadingDetail && detail && (
                    <>
                      <ReplyDetailPanel detail={detail} compact />
                      <DraftPanel
                        key={r.id}
                        replyId={r.id}
                        initialLabel={detail.reply.label}
                        initialDraft={detail.reply.responseDraft}
                        gmail={gmail}
                        onHandled={() => removeFromWaitingOnYou(r.id)}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="text-base font-semibold mb-3">Did they reply? ({waiting.length})</h2>
      {waiting.length === 0 ? (
        <p className="text-sm text-muted">Nothing recent still waiting on a response.</p>
      ) : (
        <div className="space-y-2">
          {waiting.map((w) => (
            <div key={w.touchId} className="flex justify-between items-center gap-3 px-4 py-3 rounded-card border border-rule bg-panel">
              <div>
                <p className="text-sm font-medium m-0">{w.businessName}</p>
                <p className="text-xs text-dim m-0">
                  {CHANNEL_LABEL[w.channel]} · sent {timeAgo(w.occurredAt)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Btn
                  size="sm"
                  variant="go"
                  onClick={() => {
                    setPrefillLead({ id: w.leadId, name: w.businessName, channel: w.channel });
                    setLogOpen(true);
                  }}
                >
                  Replied
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => setWaiting((prev) => prev.filter((x) => x.touchId !== w.touchId))}>
                  Not yet
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {logOpen && <LogReplyModal prefillLead={prefillLead} onClose={() => setLogOpen(false)} onLogged={() => router.refresh()} />}
    </div>
  );
}

function ReplyDetailPanel({ detail, compact }: { detail: ReplyDetail; compact?: boolean }) {
  return (
    <div className={"rounded-card border border-rule bg-panel px-4 py-3 " + (compact ? "" : "")}>
      <p className="section-label mb-2">They wrote</p>
      <p className="text-sm whitespace-pre-wrap m-0 leading-relaxed">{detail.reply.text}</p>
      <div className="flex justify-between text-xs text-dim mt-3">
        <span>
          {detail.lead.contactName ?? "Unknown"}
          {detail.lead.email ? ` · ${detail.lead.email}` : ""}
        </span>
        <span>{timeAgo(detail.reply.receivedAt as unknown as string)}</span>
      </div>
      {detail.history.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-accent cursor-pointer">Earlier ({detail.history.length})</summary>
          <ul className="list-none m-0 p-0 mt-2 space-y-1">
            {detail.history.map((h, i) => (
              <li key={i} className="text-xs flex justify-between gap-2">
                <span>
                  {CHANNEL_LABEL[h.channel]} · {h.label === "sent" ? "Sent" : h.label === "replied" ? "Replied" : h.label.replace("_", " ")}
                </span>
                <span className="text-dim shrink-0">{timeAgo(h.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DraftPanel({
  replyId,
  initialLabel,
  initialDraft,
  gmail,
  onHandled,
}: {
  replyId: string;
  initialLabel: ReplyLabel | null;
  initialDraft: string | null;
  gmail?: string | null;
  onHandled: () => void;
}) {
  const toast = useToast();
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

  async function run(key: string, fn: () => Promise<unknown>, successMessage: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      toast(successMessage);
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
      <div className="rounded-card border border-stop/30 bg-stop-soft px-4 py-4">
        <p className="text-sm mb-3 m-0">They asked to stop being contacted.</p>
        {error && <p className="text-sm text-stop mb-2">{error}</p>}
        <Btn variant="stop" loading={busy === "unsub"} onClick={() => run("unsub", () => applyUnsubscribe(replyId), "Marked do-not-contact.")}>
          {busy === "unsub" ? "Applying…" : "Set do-not-contact"}
        </Btn>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-accent/30 bg-accent-soft/30 px-4 py-4 space-y-4">
      <div>
        <p className="section-label mb-1 text-accent">Your next step</p>
        <p className="text-sm font-medium m-0">Copy → send in your inbox → mark sent</p>
      </div>

      {classifying ? (
        <p className="text-sm text-muted m-0">Reading their reply…</p>
      ) : draft ? (
        <>
          <textarea
            className="w-full border border-rule rounded-xl px-3 py-3 bg-panel text-base leading-relaxed min-h-[140px] focus:outline-none focus:border-accent/40"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" size="lg" onClick={copy}>
              {copied ? "Copied!" : "1. Copy reply"}
            </Btn>
            {gmail && (
              <a href={channelLink("gmail", gmail)} target="_blank" rel="noreferrer">
                <Btn size="lg" variant="default">
                  2. Open Gmail
                </Btn>
              </a>
            )}
            <Btn
              size="lg"
              variant="go"
              disabled={busy !== null && busy !== "sent"}
              loading={busy === "sent"}
              onClick={() => run("sent", () => markReplySent(replyId), "Marked as sent.")}
            >
              {busy === "sent" ? "Marking…" : "3. Mark as sent"}
            </Btn>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
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

      {error && <p className="text-sm text-stop m-0">{error}</p>}

      <div className="border-t border-rule/60 pt-3 flex flex-wrap gap-2">
        <Btn variant="ghost" size="sm" disabled={busy !== null} onClick={() => setShowMeeting((s) => !s)}>
          Book meeting
        </Btn>
        <Btn
          variant="ghost"
          size="sm"
          disabled={busy !== null && busy !== "snooze"}
          loading={busy === "snooze"}
          onClick={() => run("snooze", () => snoozeReply(replyId), "Snoozed.")}
        >
          {busy === "snooze" ? "Snoozing…" : "Snooze"}
        </Btn>
        <Btn variant="ghost" size="sm" disabled={busy !== null} onClick={() => setShowClose((s) => !s)} className="text-stop">
          Close lead
        </Btn>
      </div>

      {showMeeting && (
        <div className="border border-rule rounded-xl p-3 space-y-2">
          <input
            type="datetime-local"
            className="w-full border border-rule rounded-lg px-2 py-1.5 bg-bg text-sm"
            value={meetingAt}
            onChange={(e) => setMeetingAt(e.target.value)}
          />
          <input
            className="w-full border border-rule rounded-lg px-2 py-1.5 bg-bg text-sm"
            placeholder="Note (optional)"
            value={meetingNote}
            onChange={(e) => setMeetingNote(e.target.value)}
          />
          <Btn
            size="sm"
            variant="primary"
            disabled={!meetingAt}
            loading={busy === "meeting"}
            onClick={() => run("meeting", () => bookMeetingFromReply(replyId, new Date(meetingAt).toISOString(), meetingNote), "Meeting booked.")}
          >
            {busy === "meeting" ? "Booking…" : "Confirm meeting"}
          </Btn>
        </div>
      )}

      {showClose && (
        <div className="border border-rule rounded-xl p-3 space-y-2">
          <p className="text-xs text-muted m-0">Why close this lead?</p>
          <div className="flex flex-wrap gap-2">
            {CLOSE_REASONS.map((r) => (
              <Btn
                key={r.value}
                size="sm"
                variant="stop"
                disabled={busy !== null}
                loading={busy === r.value}
                onClick={() => run(r.value, () => closeLeadFromReply(replyId, r.value), "Lead closed.")}
              >
                {r.label}
              </Btn>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LogReplyModal({
  prefillLead,
  onClose,
  onLogged,
}: {
  prefillLead: { id: string; name: string; channel: Channel } | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; businessName: string; city: string | null }[]>([]);
  const [leadId, setLeadId] = useState<string | null>(prefillLead?.id ?? null);
  const [leadName, setLeadName] = useState(prefillLead?.name ?? "");
  const [channel, setChannel] = useState<Channel>(prefillLead?.channel ?? "email");
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
      toast("Reply logged.");
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
              {!prefillLead && (
                <button className="text-xs text-accent" onClick={() => setLeadId(null)}>
                  change
                </button>
              )}
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
              <Btn variant="primary" disabled={!text.trim()} loading={busy} onClick={submit}>
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
