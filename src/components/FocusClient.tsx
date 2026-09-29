"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui";
import { logTouchOutcome } from "@/server/actions/touches";
import { getObjectionResponses, recordObjectionFeedback } from "@/server/actions/objections";
import { renderMessage, type CampaignStrategy } from "@/server/strategy";
import { leadLocalTimeStatus } from "@/server/leadTimezone";
import type { Channel, TouchOutcome } from "@prisma/client";

type Card = {
  lead: {
    id: string;
    businessName: string;
    contactName: string | null;
    contactRole: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    cadenceStep: number;
    nextChannelOverride: Channel | null;
    signals: Record<string, unknown>;
    phone: string | null;
    email: string | null;
    instagramUrl: string | null;
    linkedinUrl: string | null;
    website: string | null;
    sourceUrl: string | null;
    fitScore: number;
    fitReasons: string[];
    fitFlags: string[];
  };
  campaign: { id: string; name: string; productName: string; strategy: CampaignStrategy };
  label: string;
};

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  call: "Call",
  instagram: "Instagram DM",
  linkedin: "LinkedIn DM",
};

type OutcomeDef = { outcome: TouchOutcome; label: string; key: string; variant: "default" | "go" | "stop" };

const CALL_OUTCOMES: OutcomeDef[] = [
  { outcome: "no_answer", label: "No answer", key: "1", variant: "default" },
  { outcome: "voicemail", label: "Voicemail", key: "2", variant: "default" },
  { outcome: "not_fit", label: "Not interested", key: "3", variant: "stop" },
  { outcome: "talked_not_now", label: "Follow-up", key: "4", variant: "default" },
  { outcome: "interested", label: "Interested", key: "5", variant: "go" },
  { outcome: "meeting_booked", label: "Meeting booked", key: "6", variant: "go" },
  { outcome: "wrong_number", label: "Wrong number", key: "7", variant: "stop" },
];

const OTHER_OUTCOMES: OutcomeDef[] = [
  { outcome: "sent", label: "Sent", key: "1", variant: "default" },
  { outcome: "replied", label: "They replied", key: "2", variant: "default" },
  { outcome: "interested", label: "Interested", key: "3", variant: "go" },
  { outcome: "meeting_booked", label: "Meeting booked", key: "4", variant: "go" },
  { outcome: "not_fit", label: "Not a fit", key: "5", variant: "stop" },
];

function outcomesFor(channel: Channel): OutcomeDef[] {
  return channel === "call" ? CALL_OUTCOMES : OTHER_OUTCOMES;
}

const FOLLOW_UP_ELIGIBLE: TouchOutcome[] = ["no_answer", "voicemail", "talked_not_now", "sent"];

function cardChannel(card: Card): Channel {
  if (card.lead.nextChannelOverride) return card.lead.nextChannelOverride;
  const step = card.campaign.strategy?.cadence?.[card.lead.cadenceStep];
  return step?.channel ?? card.campaign.strategy?.channels?.[0]?.channel ?? "email";
}

function firstNameOf(contactName: string | null): string {
  if (!contactName) return "there";
  return contactName.trim().split(/\s+/)[0] ?? "there";
}

const CHANNEL_FILTERS: Channel[] = ["call", "email", "instagram", "linkedin"];

const SESSION_LENGTHS: { label: string; seconds: number | null }[] = [
  { label: "30 min", seconds: 1800 },
  { label: "1 hr", seconds: 3600 },
  { label: "2 hr", seconds: 7200 },
  { label: "Until empty", seconds: null },
];

export function FocusClient({
  initialCards,
  me,
  repTimezone,
  allowedChannels,
}: {
  initialCards: Card[];
  me: string;
  repTimezone: string;
  allowedChannels: Channel[];
}) {
  const router = useRouter();
  // Reps only work the channels assigned to them (Settings/Profile "channels worked") -
  // a lead whose next touch is on a channel this rep doesn't work never enters their queue.
  const [cards, setCards] = useState(() => initialCards.filter((c) => allowedChannels.includes(cardChannel(c))));
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [draft, setDraft] = useState("");
  const [pastedOutcome, setPastedOutcome] = useState<TouchOutcome | null>(null);
  const [pastedMessage, setPastedMessage] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingNote, setMeetingNote] = useState("");
  const [followUpChannel, setFollowUpChannel] = useState<Channel | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objections, setObjections] = useState<Awaited<ReturnType<typeof getObjectionResponses>>>([]);
  const [activeObjectionId, setActiveObjectionId] = useState<string | null>(null);
  const [objectionFeedback, setObjectionFeedback] = useState<Record<string, "kept_talking" | "lost">>({});

  // Session setup gate — matches the product doc's "pick a channel + length, then go full-screen" flow.
  const [started, setStarted] = useState(false);
  const [sessionLengthSeconds, setSessionLengthSeconds] = useState<number | null>(3600);
  const [secondsLeft, setSecondsLeft] = useState(3600);
  const [touchesLogged, setTouchesLogged] = useState(0);
  const [conversations, setConversations] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  // Off by default — calls are allowed anytime; this is an opt-in filter for
  // reps who specifically want to only see leads in their local business hours.
  const [businessHoursOnly, setBusinessHoursOnly] = useState(false);

  const countByChannel = useMemo(() => {
    const counts: Partial<Record<Channel, number>> = {};
    for (const c of cards) {
      const ch = cardChannel(c);
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
    return counts;
  }, [cards]);

  const callable = useMemo(() => {
    if (!businessHoursOnly) return cards;
    return cards.filter((c) => {
      if (cardChannel(c) !== "call") return true;
      return leadLocalTimeStatus(c.lead, repTimezone).inBusinessHours;
    });
  }, [cards, repTimezone, businessHoursOnly]);

  const visibleCards = useMemo(() => {
    const pool = channelFilter === "all" ? callable : callable.filter((c) => cardChannel(c) === channelFilter);
    return pool;
  }, [callable, channelFilter]);

  const current = visibleCards[0];
  const outOfHoursCallCount = cards.length - callable.length;

  const step = current?.campaign.strategy?.cadence?.[current.lead.cadenceStep];
  const channel: Channel = current ? cardChannel(current) : "email";
  const outcomes = useMemo(() => outcomesFor(channel), [channel]);
  const localTime = current ? leadLocalTimeStatus(current.lead, repTimezone) : null;

  useEffect(() => {
    if (!current) return;
    const variant = current.lead.cadenceStep === 0 ? "first" : "follow";
    const text = renderMessage(current.campaign.strategy, channel, variant, {
      name: firstNameOf(current.lead.contactName),
      biz: current.lead.businessName,
      city: current.lead.city || "",
      me,
      product: current.campaign.productName,
    });
    setDraft(text);
    setFollowUpChannel(null);
    setMeetingAt("");
    setMeetingNote("");
    setNotes("");
    setObjectionFeedback({});
    setActiveObjectionId(null);
  }, [current, channel, me]);

  useEffect(() => {
    if (!current) return;
    getObjectionResponses(current.campaign.id)
      .then((rows) => setObjections(rows))
      .catch(() => setObjections([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.campaign.id]);

  useEffect(() => {
    if (!started || sessionLengthSeconds === null) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [started, sessionLengthSeconds]);

  async function giveObjectionFeedback(id: string, outcome: "kept_talking" | "lost") {
    setObjectionFeedback((f) => ({ ...f, [id]: outcome }));
    try {
      await recordObjectionFeedback(id, outcome);
    } catch {
      setObjectionFeedback((f) => {
        const next = { ...f };
        delete next[id];
        return next;
      });
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!started || !current || pastedOutcome) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const match = outcomes.find((o) => o.key === e.key);
      if (match) void handleOutcome(match.outcome);
      if (e.key.toLowerCase() === "s") skip();
      if (e.key.toLowerCase() === "c") copy();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, current, outcomes, pastedOutcome, draft]);

  function startSession(ch: Channel | "all") {
    if (ch !== "all") setChannelFilter(ch);
    const pool = ch === "all" ? callable : callable.filter((c) => cardChannel(c) === ch);
    setSessionTotal(pool.length);
    setTouchesLogged(0);
    setConversations(0);
    setSecondsLeft(sessionLengthSeconds ?? 0);
    setStarted(true);
  }

  function skip() {
    if (!current) return;
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.lead.id === current.lead.id);
      if (idx === -1) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      if (item) copy.push(item);
      return copy;
    });
  }

  function copy() {
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleOutcome(outcome: TouchOutcome, message?: string) {
    if (!current) return;
    if ((outcome === "interested" || outcome === "replied") && message === undefined) {
      setPastedOutcome(outcome);
      return;
    }
    if (outcome === "meeting_booked" && !meetingAt) {
      setPastedOutcome(outcome);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await logTouchOutcome({
        leadId: current.lead.id,
        channel,
        outcome,
        pastedMessage: message ?? (notes || undefined),
        followUpChannel: FOLLOW_UP_ELIGIBLE.includes(outcome) && followUpChannel ? followUpChannel : undefined,
        meetingAt: outcome === "meeting_booked" ? new Date(meetingAt).toISOString() : undefined,
        meetingNote: outcome === "meeting_booked" ? meetingNote : undefined,
      });
      setPastedOutcome(null);
      setPastedMessage("");
      const doneLeadId = current.lead.id;
      setCards((prev) => prev.filter((c) => c.lead.id !== doneLeadId));
      setTouchesLogged((n) => n + 1);
      if (outcome === "replied" || outcome === "interested" || outcome === "meeting_booked") {
        setConversations((n) => n + 1);
      }
      if ((outcome === "interested" || outcome === "meeting_booked") && res.dealId) {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log that outcome — try again.");
    } finally {
      setBusy(false);
    }
  }

  function endSession() {
    setStarted(false);
    router.push("/today");
  }

  // ─── Session setup ──────────────────────────────────────────────────────
  if (!started) {
    const channelTiles: { channel: Channel | "all"; label: string; count: number }[] = (
      [
        { channel: "call" as const, label: "Call", count: countByChannel.call ?? 0 },
        { channel: "email" as const, label: "Email", count: countByChannel.email ?? 0 },
        { channel: "instagram" as const, label: "Instagram DM", count: countByChannel.instagram ?? 0 },
        { channel: "linkedin" as const, label: "LinkedIn DM", count: countByChannel.linkedin ?? 0 },
      ]
    ).filter((t) => allowedChannels.includes(t.channel));
    const [setupChannel, setSetupChannel] = [channelFilter, setChannelFilter];

    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg bg-panel border border-rule rounded-card p-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Start a Focus session</h2>
            <p className="text-sm text-muted mt-1">FLOW guides you through every lead, one at a time.</p>
          </div>
          <div className="space-y-3">
            <p className="text-[11px] text-muted uppercase tracking-widest">Channel</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSetupChannel("all")}
                className={
                  "flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all " +
                  (setupChannel === "all" ? "border-accent bg-accent-soft" : "border-rule bg-panel2 text-muted hover:text-ink")
                }
              >
                <span>All</span>
                <span className="font-bold text-accent">{cards.length}</span>
              </button>
              {channelTiles.map(({ channel: ch, label, count }) => (
                <button
                  key={ch}
                  onClick={() => setSetupChannel(ch as Channel)}
                  disabled={count === 0}
                  className={
                    "flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 " +
                    (setupChannel === ch ? "border-accent bg-accent-soft" : "border-rule bg-panel2 text-muted hover:text-ink")
                  }
                >
                  <span>{label}</span>
                  <span className="font-bold text-accent">{count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[11px] text-muted uppercase tracking-widest">Session length</p>
            <div className="flex gap-2">
              {SESSION_LENGTHS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => {
                    setSessionLengthSeconds(opt.seconds);
                    setSecondsLeft(opt.seconds ?? 0);
                  }}
                  className={
                    "flex-1 py-2 rounded-xl border text-sm font-medium transition-all " +
                    (sessionLengthSeconds === opt.seconds ? "border-accent bg-accent-soft text-accent" : "border-rule bg-panel2 text-muted hover:text-ink")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={businessHoursOnly}
              onChange={(e) => setBusinessHoursOnly(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            <span className="text-sm text-body">Only show call leads in their local business hours</span>
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => startSession(setupChannel)}
              disabled={(setupChannel === "all" ? cards.length : countByChannel[setupChannel as Channel] ?? 0) === 0}
              className="flex-1 bg-accent text-on-accent font-semibold py-3 rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-40"
            >
              Start session
            </button>
            <button onClick={() => router.push("/today")} className="px-5 py-3 border border-rule text-muted rounded-xl hover:text-ink transition-colors text-sm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mins = sessionLengthSeconds === null ? null : Math.floor(secondsLeft / 60);
  const secs = sessionLengthSeconds === null ? null : String(secondsLeft % 60).padStart(2, "0");

  const topBar = (
    <div className="flex items-center justify-between px-5 py-3 bg-panel border-b border-rule shrink-0 z-10">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold">{channelFilter === "all" ? "Mixed" : CHANNEL_LABEL[channelFilter]} session</span>
        {mins !== null && <span className="text-xs font-mono text-muted bg-panel2 px-2 py-1 rounded-md">{mins}:{secs}</span>}
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={businessHoursOnly} onChange={(e) => setBusinessHoursOnly(e.target.checked)} className="accent-[var(--accent)]" />
          <span className="text-xs text-muted">Business hours only</span>
        </label>
        <span className="text-sm text-muted">
          <span className="font-semibold text-ink">{touchesLogged}</span> / {sessionTotal} {channelFilter === "call" || channelFilter === "all" ? "calls" : "touches"}
        </span>
        <span className="text-sm text-muted">
          <span className="text-accent font-semibold">{conversations}</span> conversations
        </span>
        <button onClick={endSession} className="text-xs text-muted hover:text-ink border border-rule rounded-lg px-3 py-1.5 transition-colors">
          End session
        </button>
      </div>
    </div>
  );

  if (!current) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {topBar}
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted text-center max-w-sm">
            {outOfHoursCallCount > 0
              ? `Nothing left right now — ${outOfHoursCallCount} call${outOfHoursCallCount === 1 ? "" : "s"} waiting for the lead's business hours.`
              : "Queue's empty. Nice work — check back after the next lead engine run."}
          </p>
        </div>
      </div>
    );
  }

  const signalEvidence = Object.entries(current.lead.signals)
    .filter(([, v]) => v === true)
    .map(([k]) => k.replace(/_/g, " "));

  const otherChannels: { label: string; href: string }[] = [];
  if (channel !== "email" && current.lead.email) otherChannels.push({ label: current.lead.email, href: `mailto:${current.lead.email}` });
  if (channel !== "instagram" && current.lead.instagramUrl) otherChannels.push({ label: "Instagram", href: current.lead.instagramUrl });
  if (channel !== "linkedin" && current.lead.linkedinUrl) otherChannels.push({ label: "LinkedIn", href: current.lead.linkedinUrl });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {topBar}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 overflow-hidden">
        {/* Left: who */}
        <div className="border-r border-rule overflow-y-auto p-5 space-y-5 pb-28">
          {localTime && channel === "call" && (
            <div className={"flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg " + (localTime.inBusinessHours ? "bg-accent-soft text-accent" : "bg-warm-soft text-warm")}>
              <span>{localTime.label} {localTime.isApproximate && "(approx.)"}</span>
              <span>· {localTime.inBusinessHours ? "in business hours" : "outside business hours"}</span>
            </div>
          )}
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest mb-2">{channel === "call" ? "Calling" : "Reaching out to"}</p>
            <h2 className="text-xl font-bold">{current.lead.businessName}</h2>
            <p className="text-sm text-muted mt-0.5">
              {[current.lead.city, current.lead.contactName ?? "Ask for the owner"].filter(Boolean).join(" · ")}
            </p>
            {current.lead.contactRole && <p className="text-xs text-muted">{current.lead.contactRole}</p>}
          </div>

          {channel === "call" && current.lead.phone && (
            <div className="bg-panel2 border border-rule rounded-xl p-4">
              <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Phone</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xl font-bold font-mono tracking-wide">{current.lead.phone}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(current.lead.phone!)}
                  className="shrink-0 text-[10px] text-accent border border-accent/30 rounded-md px-2 py-1 hover:bg-accent-soft transition-colors font-mono"
                >
                  C
                </button>
              </div>
            </div>
          )}

          {otherChannels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {otherChannels.map((oc) => (
                <a key={oc.href} href={oc.href} target="_blank" rel="noreferrer" className="text-xs text-accent underline underline-offset-2">
                  {oc.label}
                </a>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between">
              <p className="text-[10px] text-muted uppercase tracking-widest">Fit</p>
              <span className={"text-xs font-bold " + (current.lead.fitScore >= 80 ? "text-accent" : "text-warm")}>{current.lead.fitScore}/100</span>
            </div>
            <div className="h-1.5 bg-rule rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${current.lead.fitScore}%`, background: current.lead.fitScore >= 80 ? "var(--accent)" : "var(--warm)" }} />
            </div>
          </div>

          {(current.lead.fitReasons.length > 0 || current.lead.fitFlags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {current.lead.fitReasons.map((s) => (
                <span key={s} className="text-[11px] bg-accent-soft text-accent border border-accent/20 rounded-full px-2.5 py-0.5">
                  {s}
                </span>
              ))}
              {current.lead.fitFlags.map((g) => (
                <span key={g} className="text-[11px] bg-panel2 text-muted rounded-full px-2.5 py-0.5">
                  {g}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[10px] text-muted uppercase tracking-widest">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Type during the call..."
              rows={3}
              className="w-full bg-panel2 border border-rule rounded-lg p-2.5 text-sm placeholder-muted resize-none focus:outline-none focus:border-accent/40 transition-colors"
            />
          </div>

          {(current.lead.sourceUrl || current.lead.website) && (
            <div className="flex flex-wrap gap-3 text-xs">
              {current.lead.website && (
                <a href={current.lead.website} target="_blank" rel="noreferrer" className="text-muted hover:text-ink underline underline-offset-2">
                  Website
                </a>
              )}
              {current.lead.sourceUrl && (
                <a href={current.lead.sourceUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-ink underline underline-offset-2">
                  Source
                </a>
              )}
            </div>
          )}
        </div>

        {/* Center: plan + outcome fields */}
        <div className="border-r border-rule overflow-y-auto p-5 space-y-5 pb-28">
          <p className="text-[10px] text-muted uppercase tracking-widest">Why this lead</p>
          <p className="text-sm text-body leading-relaxed">
            {signalEvidence.length > 0 ? `${signalEvidence.join(", ")}. ` : ""}
            {step?.purpose ?? "Reach out and see where it goes."}
          </p>

          <div className="bg-accent-soft border border-accent/20 rounded-xl p-4 space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-[10px] text-accent uppercase tracking-widest font-medium">{channel === "call" ? "Opener" : "Draft message"}</p>
              <button onClick={copy} className="text-xs text-accent font-medium">
                {copied ? "Copied!" : "Copy (C)"}
              </button>
            </div>
            <textarea
              className="w-full bg-transparent text-sm leading-relaxed resize-none focus:outline-none min-h-[100px]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>

          {step?.tip && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted uppercase tracking-widest">Sales tip</p>
              <p className="text-sm text-body">{step.tip}</p>
            </div>
          )}

          {current.campaign.strategy.cadence?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {current.campaign.strategy.cadence.map((c, i) => (
                <span
                  key={i}
                  className={
                    "text-xs px-2.5 py-1 rounded border " +
                    (i === current.lead.cadenceStep
                      ? "border-accent bg-accent-soft font-semibold"
                      : i < current.lead.cadenceStep
                        ? "border-rule text-muted line-through opacity-60"
                        : "border-rule text-muted")
                  }
                >
                  Day {c.day}: {CHANNEL_LABEL[c.channel]}
                </span>
              ))}
            </div>
          )}

          {pastedOutcome === "meeting_booked" ? (
            <div className="space-y-3 border-t border-rule pt-4">
              <p className="text-[10px] text-muted uppercase tracking-widest">Book the meeting</p>
              <input
                type="datetime-local"
                value={meetingAt}
                onChange={(e) => setMeetingAt(e.target.value)}
                className="w-full bg-panel2 border border-rule rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent/40"
              />
              <input
                value={meetingNote}
                onChange={(e) => setMeetingNote(e.target.value)}
                placeholder="What do they care about most?"
                className="w-full bg-panel2 border border-rule rounded-xl px-3 py-2 text-sm placeholder-muted focus:outline-none focus:border-accent/40"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleOutcome("meeting_booked")}
                  disabled={!meetingAt || busy}
                  className="flex-1 bg-accent text-on-accent font-semibold py-2.5 rounded-xl hover:bg-accent-hover transition-colors text-sm disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Confirm meeting & next lead"}
                </button>
                <button onClick={() => setPastedOutcome(null)} disabled={busy} className="px-4 py-2.5 border border-rule text-muted rounded-xl text-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : pastedOutcome ? (
            <div className="space-y-2 border-t border-rule pt-4">
              <p className="text-sm font-medium">Paste their message (optional)</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-rule rounded-lg px-3 py-2 bg-panel2 text-sm"
                  value={pastedMessage}
                  onChange={(e) => setPastedMessage(e.target.value)}
                  placeholder="What they said"
                />
                <button
                  disabled={busy}
                  onClick={() => handleOutcome(pastedOutcome, pastedMessage)}
                  className="bg-accent text-on-accent font-semibold px-4 rounded-xl text-sm disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Log"}
                </button>
                <button onClick={() => setPastedOutcome(null)} disabled={busy} className="px-4 border border-rule text-muted rounded-xl text-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {error && <p className="text-sm text-stop">{error}</p>}
        </div>

        {/* Right: live objections */}
        <div className="overflow-y-auto p-5 space-y-4 pb-28">
          <p className="text-[10px] text-muted uppercase tracking-widest">If they push back</p>
          {objections.length === 0 ? (
            <p className="text-sm text-muted">No objection playbook for this campaign yet.</p>
          ) : (
            <div className="space-y-2">
              {objections.map((o) => {
                const isActive = activeObjectionId === o.id;
                const fb = objectionFeedback[o.id];
                const rate = o.uses > 0 ? Math.round((o.keptTalkingCount / o.uses) * 100) : 0;
                return (
                  <div key={o.id}>
                    <button
                      onClick={() => setActiveObjectionId(isActive ? null : o.id)}
                      className={
                        "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-medium transition-all " +
                        (isActive ? "bg-accent-soft border-accent/30 text-accent" : "bg-panel2 border-rule text-body hover:border-accent/20 hover:text-ink")
                      }
                    >
                      {o.objection}
                    </button>
                    {isActive && (
                      <div className="mt-2 bg-accent-soft border border-accent/20 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Chip tone={o.status === "proven" ? "go" : o.status === "retired" ? "stop" : o.status === "testing" ? "acc" : "default"}>
                            {o.status === "new" ? "New" : `${o.status} · ${rate}% (${o.keptTalkingCount}/${o.uses})`}
                          </Chip>
                        </div>
                        <p className="text-sm leading-relaxed">{o.responseText}</p>
                        {fb ? (
                          <div className="flex items-center gap-2 text-xs">
                            <span className={fb === "kept_talking" ? "text-go" : "text-stop"}>{fb === "kept_talking" ? "Kept talking" : "Lost them"}</span>
                            <span className="text-muted">· Flow noted</span>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => giveObjectionFeedback(o.id, "kept_talking")}
                              className="flex items-center gap-1.5 text-xs text-muted border border-rule rounded-lg px-3 py-1.5 hover:border-accent/40 hover:text-accent transition-colors"
                            >
                              Kept them talking
                            </button>
                            <button
                              onClick={() => giveObjectionFeedback(o.id, "lost")}
                              className="flex items-center gap-1.5 text-xs text-muted border border-rule rounded-lg px-3 py-1.5 hover:border-stop/40 hover:text-stop transition-colors"
                            >
                              Lost them
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pinned outcome bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-panel border-t border-rule px-5 py-3 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-muted uppercase tracking-widest mr-2">Log outcome</span>
          {outcomes.map((o) => (
            <button
              key={o.outcome}
              disabled={busy}
              onClick={() => handleOutcome(o.outcome)}
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 " +
                (o.variant === "go"
                  ? "bg-accent-soft border-accent/40 text-accent"
                  : o.variant === "stop"
                    ? "bg-stop-soft border-stop/30 text-stop"
                    : "bg-panel2 border-rule text-muted hover:text-ink hover:border-accent/20")
              }
            >
              <span>{o.label}</span>
              <span className="font-mono text-[9px] opacity-50">{o.key}</span>
            </button>
          ))}
          <button onClick={skip} disabled={busy} className="text-xs text-muted hover:text-ink px-3 py-1.5">
            Skip for now (S)
          </button>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-muted">Follow up via</span>
            <select
              className="text-xs border border-rule rounded-lg px-2 py-1.5 bg-panel2"
              value={followUpChannel ?? ""}
              onChange={(e) => setFollowUpChannel((e.target.value || null) as Channel | null)}
            >
              <option value="">(keep cadence channel)</option>
              {CHANNEL_FILTERS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
