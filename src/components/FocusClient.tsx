"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logTouchOutcome, rateTouchScript } from "@/server/actions/touches";
import { completeTodayRow, followUpTodayRow, skipTodayRow } from "@/server/actions/todayRows";
import { recordPipelineOutcome } from "@/server/actions/pipelineToday";
import { resolveLeadChannel, splitEmailDraft } from "@/server/cadence";
import { FlowCoach } from "@/components/FlowCoach";
import { ShapeASession } from "@/components/ShapeASession";
import { TodaySyncPanel } from "@/components/TodaySyncPanel";
import type { CoachDirectoryLead, ShapeCard } from "@/lib/shapeCard";
import type { FocusSyncState } from "@/server/todayBoard";
import {
  actionVisible,
  followUpKeysFromSignals,
  formatQueueClock,
  orderActions,
  pickerCounts,
  projectTodayActions,
  skipKeysFromSignals,
  todayActionKey,
  type TodayAction,
} from "@/lib/todayCards";
import {
  dropCard,
  finishPending,
  focusSessionStacks,
  normalizeCallerNote,
  recordPending,
  restoreCard,
  startOptimisticOutcome,
  whoLine,
  whyThisLead,
  websiteHref,
  websiteLabel,
  type PendingOutcome,
} from "@/lib/focusCallCard";
import { cadenceChannel, cardInRepQueue, focusWorkingChannel, matchesFocusFilter } from "@/lib/focusQueue";
import { callPlaceholderName, resolveFocusObjections, resolveFocusOpener, type ScriptRating } from "@/lib/focusScripts";
import { linkedinOpenUrl, mailtoUrl } from "@/lib/outreachLinks";
import { leadLocalTimeStatus } from "@/server/leadTimezone";
import type { Channel, TouchOutcome, LeadSource } from "@prisma/client";

type Card = ShapeCard;

const SOURCE_LABEL: Partial<Record<LeadSource, string>> = {
  google_places: "Google Places",
  csv: "CSV import",
  manual: "Manually added",
  ai_search: "AI search",
  open_data: "Open data",
  apollo: "Apollo",
  openclaw: "OpenClaw",
  portfolio_agent: "Portfolio agent",
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

const MESSAGE_OUTCOMES: OutcomeDef[] = [
  { outcome: "sent", label: "Sent", key: "1", variant: "go" },
  { outcome: "wrong_number", label: "Can't send / no access", key: "2", variant: "stop" },
  { outcome: "interested", label: "Interested", key: "3", variant: "go" },
  { outcome: "talked_not_now", label: "Follow-up", key: "4", variant: "default" },
];

function outcomesFor(channel: Channel): OutcomeDef[] {
  return channel === "call" ? CALL_OUTCOMES : MESSAGE_OUTCOMES;
}

function greetingName(channel: Channel, contactName: string | null, role: string | null): string {
  if (channel === "call") return contactName?.trim() ? callPlaceholderName(contactName) : "";
  const first = contactName?.trim().split(/\s+/)[0];
  return first || "there";
}

const SESSION_LENGTHS: { label: string; seconds: number | null }[] = [
  { label: "30 min", seconds: 1800 },
  { label: "1 hr", seconds: 3600 },
  { label: "2 hr", seconds: 7200 },
  { label: "Until empty", seconds: null },
];

const RATINGS: { rating: ScriptRating; label: string }[] = [
  { rating: "helpful", label: "Helpful" },
  { rating: "meh", label: "Meh" },
  { rating: "bad", label: "Bad" },
];

function selectFocusCards(
  cards: Card[],
  filter: Channel | "all",
  source: LeadSource | "all",
  businessHoursOnly: boolean,
  repTimezone: string,
) {
  return cards.filter((card) => {
    const hoursMatter =
      businessHoursOnly && (filter === "call" || (filter === "all" && cadenceChannel(card) === "call"));
    const inBusinessHours = !hoursMatter || leadLocalTimeStatus(card.lead, repTimezone).inBusinessHours;
    if (!matchesFocusFilter(card, filter, { inBusinessHours })) return false;
    if (source !== "all" && card.lead.source !== source) return false;
    return true;
  });
}

export function FocusClient({
  initialCards,
  me,
  repTimezone,
  allowedChannels,
  initialChannel,
  coachLeads = [],
  assistantName = "Flow",
  suppressCall = false,
  sync = null,
}: {
  initialCards: Card[];
  me: string;
  repTimezone: string;
  allowedChannels: Channel[];
  initialChannel?: Channel | "all";
  coachLeads?: CoachDirectoryLead[];
  assistantName?: string;
  suppressCall?: boolean;
  sync?: FocusSyncState | null;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(() => initialCards.filter((c) => c.replyOnly || cardInRepQueue(c, allowedChannels)));
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(() => initialCards.flatMap((card) => followUpKeysFromSignals(card.lead.signals)));
  const [deferredKeys, setDeferredKeys] = useState<string[]>(() => initialCards.flatMap((card) => skipKeysFromSignals(card.lead.signals)));
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);
  const [coachOpen, setCoachOpen] = useState(false);
  const shapeInFlight = useRef(new Set<string>());
  const [channelFilter, setChannelFilter] = useState<Channel | "all">(() => {
    if (suppressCall && initialChannel === "call") return "all";
    if (initialChannel && initialChannel !== "all" && allowedChannels.includes(initialChannel)) return initialChannel;
    if (initialChannel === "all") return "all";
    return "all";
  });
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callNote, setCallNote] = useState("");
  const inFlight = useRef(new Set<string>());
  const pendingSaves = useRef<PendingOutcome[]>([]);
  const [pendingRating, setPendingRating] = useState<{ touchId: string; businessName: string } | null>(null);

  const [started, setStarted] = useState(false);
  const [sessionLengthSeconds, setSessionLengthSeconds] = useState<number | null>(3600);
  const [secondsLeft, setSecondsLeft] = useState(3600);
  const [touchesLogged, setTouchesLogged] = useState(0);
  const [conversations, setConversations] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [businessHoursOnly, setBusinessHoursOnly] = useState(false);

  const countByChannel = useMemo(() => {
    const count = (channel: Channel) => selectFocusCards(cards, channel, sourceFilter, businessHoursOnly, repTimezone).length;
    return {
      call: count("call"),
      email: count("email"),
      instagram: count("instagram"),
      linkedin: count("linkedin"),
    };
  }, [cards, businessHoursOnly, repTimezone, sourceFilter]);

  const shapeRows = useMemo(() => {
    const hidden = new Set(hiddenKeys);
    const expanded = cards.flatMap((card) => {
      if (sourceFilter !== "all" && card.lead.source !== sourceFilter) return [];
      const callAllowedNow = !businessHoursOnly || leadLocalTimeStatus(card.lead, repTimezone).inBusinessHours;
      return projectTodayActions({
        pipeline: card.pipeline,
        hideCall: suppressCall,
        allowedChannels,
        lead: {
          id: card.lead.id,
          phone: card.lead.phone,
          email: card.lead.email,
          linkedinUrl: card.lead.linkedinUrl,
          instagramUrl: card.lead.instagramUrl,
          contactName: card.lead.contactName,
          cadenceStep: card.lead.cadenceStep,
          nextChannelOverride: card.lead.nextChannelOverride,
          signals: card.lead.signals,
          strategy: card.campaign.strategy,
          linkedinRequestSent: card.linkedinRequestSent,
          openReplies: card.openReplies,
          replyOnly: card.replyOnly,
          callAllowedNow,
        },
      })
        .filter((action) => !hidden.has(action.key))
        .map((action) => ({ action, card }));
    });
    const ordered = orderActions(
      expanded.map((row) => row.action),
      deferredKeys,
      pinnedKeys,
    );
    const byKey = new Map(expanded.map((row) => [row.action.key, row]));
    return ordered.flatMap((action) => {
      const row = byKey.get(action.key);
      return row ? [row] : [];
    });
  }, [cards, sourceFilter, businessHoursOnly, repTimezone, allowedChannels, hiddenKeys, deferredKeys, pinnedKeys, suppressCall]);

  const shapeCounts = useMemo(() => pickerCounts(shapeRows.map((row) => row.action)), [shapeRows]);

  const visibleCards = useMemo(
    () => selectFocusCards(cards, channelFilter, sourceFilter, businessHoursOnly, repTimezone),
    [cards, channelFilter, sourceFilter, businessHoursOnly, repTimezone],
  );

  const sourcesPresent = useMemo(() => {
    const set = new Set<LeadSource>();
    for (const c of cards) set.add(c.lead.source);
    return Array.from(set);
  }, [cards]);

  const current = visibleCards[0];
  const channel: Channel = current ? focusWorkingChannel(current, channelFilter) : "email";
  const outcomes = useMemo(() => outcomesFor(channel), [channel]);
  const localTime = current && channel === "call" ? leadLocalTimeStatus(current.lead, repTimezone) : null;

  const opener = useMemo(() => {
    if (!current) return null;
    return resolveFocusOpener({
      channel,
      leadId: current.lead.id,
      productName: current.campaign.productName,
      strategy: current.campaign.strategy,
      values: {
        name: greetingName(channel, current.lead.contactName, current.lead.contactRole),
        biz: current.lead.businessName,
        city: current.lead.city || "",
        me,
        product: current.campaign.productName,
        role: current.lead.contactRole ?? undefined,
      },
    });
  }, [current, channel, me]);

  const emailParts = useMemo(() => {
    if (!current || channel !== "email" || !opener) return null;
    const parts = splitEmailDraft(opener.text);
    return {
      subject: parts.subject || `Quick note about ${current.lead.businessName}`,
      body: parts.body || opener.text,
    };
  }, [current, channel, opener]);

  const objections = useMemo(() => {
    if (!current || !opener) return [];
    return resolveFocusObjections(current.campaign.strategy, current.campaign.productName, {
      name: greetingName(channel, current.lead.contactName, current.lead.contactRole),
      biz: current.lead.businessName,
      city: current.lead.city || "",
      me,
      product: current.campaign.productName,
      role: current.lead.contactRole ?? undefined,
    });
  }, [current, opener, channel, me]);

  useEffect(() => {
    if (!started || sessionLengthSeconds === null) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [started, sessionLengthSeconds]);

  const draftText = emailParts ? emailParts.body : opener?.text ?? "";

  function copy() {
    if (!draftText) return;
    navigator.clipboard.writeText(draftText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!started || channelFilter !== "call" || !current) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const match = outcomes.find((o) => o.key === e.key);
      if (match) handleOutcome(match.outcome);
      if (e.key.toLowerCase() === "s") skip();
      if (e.key.toLowerCase() === "c") copy();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleOutcome closes over the current card and the note; rebind when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, channelFilter, current, outcomes, draftText, callNote, opener, channel]);

  function startSession(ch: Channel | "all") {
    if (ch !== "all") setChannelFilter(ch);
    const total =
      ch === "call"
        ? selectFocusCards(cards, "call", sourceFilter, businessHoursOnly, repTimezone).length
        : shapeRows.filter((row) => actionVisible(row.action, ch)).length;
    setSessionTotal(total);
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
      const copyCards = [...prev];
      const [item] = copyCards.splice(idx, 1);
      if (item) copyCards.push(item);
      return copyCards;
    });
  }

  function shapeRowsFor(filter: Channel | "all") {
    return shapeRows.filter((row) => actionVisible(row.action, filter));
  }

  function settlePipeline(row: { action: TodayAction; card: Card }, outcome: "done" | "skip" | "needs_follow_up") {
    const rowId = row.action.pipelineRowId;
    if (!rowId) return;
    const key = row.action.key;
    if (shapeInFlight.current.has(key)) return;
    shapeInFlight.current.add(key);
    setHiddenKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setError(null);
    if (outcome !== "skip") setTouchesLogged((n) => n + 1);
    void recordPipelineOutcome({ rowId, outcome })
      .then((res) => {
        if (res.touchId && outcome === "done" && row.action.kind === "send_email") {
          setPendingRating({ touchId: res.touchId, businessName: row.card.lead.businessName });
        }
      })
      .catch((err: unknown) => {
        setHiddenKeys((prev) => prev.filter((item) => item !== key));
        if (outcome !== "skip") setTouchesLogged((n) => Math.max(0, n - 1));
        setError(err instanceof Error ? err.message : "Couldn't log that — it's back on this card.");
      })
      .finally(() => {
        shapeInFlight.current.delete(key);
      });
  }

  function handleShapeSkip(row: { action: TodayAction; card: Card }) {
    if (row.action.pipelineRowId) {
      settlePipeline(row, "skip");
      return;
    }
    const key = row.action.key;
    setDeferredKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setError(null);
    void skipTodayRow({ leadId: row.card.lead.id, actionKey: key, kind: row.action.kind }).catch((err: unknown) => {
      setDeferredKeys((prev) => prev.filter((item) => item !== key));
      setError(err instanceof Error ? err.message : "Couldn't skip that row.");
    });
  }

  function handleShapeFollowUp(row: { action: TodayAction; card: Card }) {
    if (row.action.pipelineRowId) {
      settlePipeline(row, "needs_follow_up");
      return;
    }
    if (row.action.kind !== "reply" && row.action.kind !== "follow_up" && row.action.kind !== "next_action") return;
    const key = row.action.key;
    if (shapeInFlight.current.has(key)) return;
    shapeInFlight.current.add(key);
    setHiddenKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setError(null);
    setTouchesLogged((n) => n + 1);
    void followUpTodayRow({
      leadId: row.card.lead.id,
      actionKey: key,
      kind: row.action.kind,
      channel: row.action.channel,
    })
      .catch((err: unknown) => {
        setHiddenKeys((prev) => prev.filter((item) => item !== key));
        setTouchesLogged((n) => Math.max(0, n - 1));
        setError(err instanceof Error ? err.message : "Couldn't log that follow-up.");
      })
      .finally(() => {
        shapeInFlight.current.delete(key);
      });
  }

  function handleShapeDone(row: { action: TodayAction; card: Card }, script?: { variant: "a" | "b"; scriptId: string }) {
    if (row.action.pipelineRowId) {
      settlePipeline(row, "done");
      return;
    }
    const kind = row.action.kind;
    if (kind === "call" || kind === "follow_up" || kind === "next_action") return;
    const key = row.action.key;
    if (shapeInFlight.current.has(key)) return;
    shapeInFlight.current.add(key);
    setHiddenKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setError(null);
    setTouchesLogged((n) => n + 1);
    const cadenceNow = resolveLeadChannel({
      strategy: row.card.campaign.strategy,
      cadenceStep: row.card.lead.cadenceStep,
      nextChannelOverride: row.card.lead.nextChannelOverride,
    });
    void completeTodayRow({
      leadId: row.card.lead.id,
      kind,
      replyId: row.action.replyId ?? undefined,
      scriptUsed: script?.variant,
      scriptId: script?.scriptId,
      advanceCadence: row.action.kind === "linkedin_request" ? cadenceNow === "linkedin" : undefined,
    })
      .then((res) => {
        if (res.touchId && row.action.kind === "send_email") {
          setPendingRating({ touchId: res.touchId, businessName: row.card.lead.businessName });
        }
      })
      .catch((err: unknown) => {
        setHiddenKeys((prev) => prev.filter((item) => item !== key));
        setTouchesLogged((n) => Math.max(0, n - 1));
        setError(err instanceof Error ? err.message : "Couldn't log that — it's back on this card.");
      })
      .finally(() => {
        shapeInFlight.current.delete(key);
      });
  }

  function handleShapeCall(
    row: { action: TodayAction; card: Card },
    outcome: TouchOutcome,
    note: string | null,
    script: { variant: "a" | "b"; scriptId: string },
  ) {
    const key = row.action.key;
    const leadId = row.card.lead.id;
    if (!startOptimisticOutcome(inFlight.current, key)) return;
    const terminal = outcome === "not_fit" || outcome === "wrong_number";
    const siblingKeys = shapeRows.filter((item) => item.card.lead.id === leadId).map((item) => item.action.key);
    setHiddenKeys((prev) => Array.from(new Set([...prev, ...(terminal ? siblingKeys : [key])])));
    setError(null);
    setTouchesLogged((n) => n + 1);
    const countsAsConversation = outcome === "replied" || outcome === "interested" || outcome === "meeting_booked";
    if (countsAsConversation) setConversations((n) => n + 1);
    void logTouchOutcome({
      leadId,
      channel: "call",
      outcome,
      scriptUsed: script.variant,
      scriptId: script.scriptId,
      callerNote: note ?? undefined,
    })
      .then((res) => {
        if (res.touchId) setPendingRating({ touchId: res.touchId, businessName: row.card.lead.businessName });
        if ((outcome === "interested" || outcome === "meeting_booked") && res.dealId) router.refresh();
      })
      .catch((err: unknown) => {
        setHiddenKeys((prev) => prev.filter((item) => !(terminal ? siblingKeys : [key]).includes(item)));
        setTouchesLogged((n) => Math.max(0, n - 1));
        if (countsAsConversation) setConversations((n) => Math.max(0, n - 1));
        setError(err instanceof Error ? err.message : "Couldn't log that outcome — it's back on this card.");
      })
      .finally(() => {
        inFlight.current.delete(key);
      });
  }

  function handleOutcome(outcome: TouchOutcome) {
    if (!current || !opener) return;
    const card = current;
    const leadId = card.lead.id;
    if (!startOptimisticOutcome(inFlight.current, leadId)) return;

    const note = channel === "call" ? normalizeCallerNote(callNote) : null;
    const scriptUsed = opener.variant;
    const scriptId = opener.scriptId;
    const workingChannel = channel;
    const countsAsConversation = outcome === "replied" || outcome === "interested" || outcome === "meeting_booked";

    pendingSaves.current = recordPending(pendingSaves.current, { leadId, outcome, callerNote: note });
    setCards((prev) => dropCard(prev, leadId));
    setCallNote("");
    setError(null);
    setTouchesLogged((n) => n + 1);
    if (countsAsConversation) setConversations((n) => n + 1);

    void logTouchOutcome({
      leadId,
      channel: workingChannel,
      outcome,
      scriptUsed,
      scriptId,
      callerNote: note ?? undefined,
    })
      .then((res) => {
        pendingSaves.current = finishPending(pendingSaves.current, leadId);
        if (res.touchId) setPendingRating({ touchId: res.touchId, businessName: card.lead.businessName });
        if ((outcome === "interested" || outcome === "meeting_booked") && res.dealId) router.refresh();
      })
      .catch((e: unknown) => {
        pendingSaves.current = finishPending(pendingSaves.current, leadId);
        setCards((prev) => restoreCard(prev, card));
        setTouchesLogged((n) => Math.max(0, n - 1));
        if (countsAsConversation) setConversations((n) => Math.max(0, n - 1));
        if (note) setCallNote(note);
        setError(e instanceof Error ? e.message : "Couldn't log that outcome — it's back on this card.");
      })
      .finally(() => {
        inFlight.current.delete(leadId);
      });
  }

  async function rate(rating: ScriptRating) {
    if (!pendingRating) return;
    const touchId = pendingRating.touchId;
    setPendingRating(null);
    try {
      await rateTouchScript(touchId, rating);
    } catch {
      setError("Couldn't save that rating. The outcome is already logged.");
    }
  }

  function endSession() {
    setStarted(false);
    router.push("/today");
  }

  if (!started) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-lg space-y-7 animate-fade-up">
          <div>
            <p className="section-label mb-2">Today</p>
            <h2 className="page-title m-0">Who are you working?</h2>
            <p className="text-sm text-muted mt-2 mb-0">
              One card = one Today row. Email opens Titan. LinkedIn request = Connect with no note.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { channel: "all" as const, label: "Everything", count: shapeCounts.all },
                { channel: "email" as const, label: "Email", count: shapeCounts.email },
                { channel: "linkedin" as const, label: "LinkedIn", count: shapeCounts.linkedin },
                ...(suppressCall
                  ? []
                  : [{ channel: "call" as const, label: "Call", count: allowedChannels.includes("call") ? countByChannel.call : 0 }]),
              ] as const
            ).map((tile) => (
              <button
                type="button"
                key={tile.channel}
                onClick={() => setChannelFilter(tile.channel)}
                disabled={tile.count === 0}
                className={
                  "flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 " +
                  (channelFilter === tile.channel ? "border-accent bg-accent-soft text-ink" : "border-rule bg-panel text-muted hover:text-ink")
                }
              >
                <span>{tile.label}</span>
                <span className="font-bold text-accent tabular-nums text-lg">{tile.count}</span>
              </button>
            ))}
            {shapeCounts.instagram > 0 && (
              <button
                type="button"
                onClick={() => setChannelFilter("instagram")}
                className={
                  "col-span-2 flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-medium transition-all " +
                  (channelFilter === "instagram" ? "border-accent bg-accent-soft text-ink" : "border-rule bg-panel text-muted hover:text-ink")
                }
              >
                <span>Instagram</span>
                <span className="font-bold text-accent tabular-nums text-lg">{shapeCounts.instagram}</span>
              </button>
            )}
          </div>
          <div className="space-y-3">
            <p className="section-label mb-0">How long</p>
            <div className="flex gap-2">
              {SESSION_LENGTHS.map((opt) => (
                <button
                  type="button"
                  key={opt.label}
                  onClick={() => {
                    setSessionLengthSeconds(opt.seconds);
                    setSecondsLeft(opt.seconds ?? 0);
                  }}
                  className={
                    "flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all " +
                    (sessionLengthSeconds === opt.seconds ? "border-accent bg-accent-soft text-accent" : "border-rule bg-panel text-muted hover:text-ink")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {sync && <TodaySyncPanel sync={sync} />}
          {!suppressCall && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={businessHoursOnly}
                onChange={(e) => setBusinessHoursOnly(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm text-muted">Only call leads in their local business hours</span>
            </label>
          )}
          {sourcesPresent.length > 1 && (
            <div className="space-y-2">
              <p className="section-label mb-0">Lead source</p>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as LeadSource | "all")}
                className="w-full text-sm border border-rule rounded-xl px-3 py-2.5 bg-panel"
              >
                <option value="all">All sources</option>
                {sourcesPresent.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => startSession(channelFilter)}
              disabled={
                channelFilter === "call"
                  ? countByChannel.call === 0
                  : shapeRowsFor(channelFilter).length === 0
              }
              className="bg-accent text-on-accent font-semibold px-8 py-3 rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-40 text-[15px]"
            >
              Start
            </button>
            <button type="button" onClick={() => setCoachOpen(true)} className="text-sm font-medium text-accent px-2 py-3">
              Tell Flow what happened
            </button>
            <button
              type="button"
              onClick={() => router.push("/today")}
              className="px-3 py-3 text-muted rounded-xl hover:text-ink transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
        {coachOpen && (
          <FlowCoach
            assistantName={assistantName}
            leads={coachLeads}
            onClose={() => setCoachOpen(false)}
            onLogged={(result) => {
              setCards((prev) => {
                const idx = prev.findIndex((card) => card.lead.id === result.leadId);
                const reply = result.card.openReplies[0];
                if (!reply) return prev;
                if (idx === -1) return [...prev, result.card];
                const next = [...prev];
                const card = next[idx]!;
                if (card.openReplies.some((item) => item.id === reply.id)) return prev;
                next[idx] = { ...card, openReplies: [...card.openReplies, reply] };
                return next;
              });
              setPinnedKeys((prev) => [todayActionKey(result.leadId, "reply", result.replyId), ...prev]);
            }}
          />
        )}
      </div>
    );
  }

  if (channelFilter !== "call") {
    const clock = formatQueueClock(new Date(), repTimezone);
    return (
      <>
        <ShapeASession
          rows={shapeRowsFor(channelFilter)}
          me={me}
          repTimezone={repTimezone}
          clock={clock}
          touchesLogged={touchesLogged}
          sessionTotal={sessionTotal}
          secondsLeft={secondsLeft}
          sessionLengthSeconds={sessionLengthSeconds}
          conversations={conversations}
          businessHoursOnly={businessHoursOnly}
          onToggleHours={setBusinessHoursOnly}
          showHours={channelFilter === "all" && !suppressCall}
          error={error}
          pendingRating={pendingRating}
          onRate={(rating) => void rate(rating)}
          onDismissRating={() => setPendingRating(null)}
          onEnd={endSession}
          onOpenCoach={() => setCoachOpen(true)}
          onDone={handleShapeDone}
          onSkip={handleShapeSkip}
          onFollowUp={handleShapeFollowUp}
          onCallOutcome={handleShapeCall}
        />
        {coachOpen && (
          <FlowCoach
            assistantName={assistantName}
            leads={coachLeads}
            onClose={() => setCoachOpen(false)}
            onLogged={(result) => {
              setCards((prev) => {
                const idx = prev.findIndex((card) => card.lead.id === result.leadId);
                const reply = result.card.openReplies[0];
                if (!reply) return prev;
                if (idx === -1) return [...prev, result.card];
                const next = [...prev];
                const card = next[idx]!;
                if (card.openReplies.some((item) => item.id === reply.id)) return prev;
                next[idx] = { ...card, openReplies: [...card.openReplies, reply] };
                return next;
              });
              setPinnedKeys((prev) => [todayActionKey(result.leadId, "reply", result.replyId), ...prev]);
            }}
          />
        )}
      </>
    );
  }

  const mins = sessionLengthSeconds === null ? null : Math.floor(secondsLeft / 60);
  const secs = sessionLengthSeconds === null ? null : String(secondsLeft % 60).padStart(2, "0");
  const sessionTitle = "Calls";

  const topBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 bg-panel/90 backdrop-blur-sm border-b border-rule shrink-0 z-10">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold">{sessionTitle}</span>
        {mins !== null && (
          <span className="text-xs tabular-nums text-dim bg-panel2 px-2 py-1 rounded-md">
            {mins}:{secs}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 md:gap-4 flex-wrap">
        <label className="hidden sm:flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={businessHoursOnly} onChange={(e) => setBusinessHoursOnly(e.target.checked)} className="accent-[var(--accent)]" />
          <span className="text-xs text-dim">Their hours only</span>
        </label>
        <span className="text-sm">
          <span className="font-bold text-ink tabular-nums text-base">{touchesLogged}</span>
          <span className="text-dim"> / {sessionTotal}</span>
        </span>
        {conversations > 0 && <span className="text-sm text-accent font-semibold tabular-nums">{conversations} good</span>}
        <button type="button" onClick={endSession} className="text-xs text-dim hover:text-ink px-2 py-1.5 transition-colors">
          End
        </button>
      </div>
    </div>
  );

  const ratingBar = pendingRating ? (
    <div className="px-4 md:px-6 py-2.5 border-b border-rule bg-panel2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">Opener for {pendingRating.businessName}?</span>
      {RATINGS.map((item) => (
        <button
          key={item.rating}
          type="button"
          onClick={() => void rate(item.rating)}
          className="text-xs font-medium border border-rule rounded-lg px-2.5 py-1 bg-panel hover:border-accent/40 hover:text-accent"
        >
          {item.label}
        </button>
      ))}
      <button type="button" onClick={() => setPendingRating(null)} className="text-xs text-dim hover:text-ink px-2 py-1">
        Skip
      </button>
    </div>
  ) : null;

  if (!current || !opener) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {topBar}
        {ratingBar}
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted text-center max-w-sm">Queue&apos;s empty. Nice work.</p>
        </div>
      </div>
    );
  }

  const askFor = current.lead.contactName?.trim() || current.lead.contactRole?.trim() || "the owner";
  const place = [current.lead.businessName, current.lead.city].filter(Boolean).join(" · ");
  const mailtoHref = current.lead.email && emailParts ? mailtoUrl(current.lead.email, emailParts.subject, emailParts.body) : null;
  const linkedinHref = channel === "linkedin" ? linkedinOpenUrl(current.lead) : null;
  const stack = focusSessionStacks();
  const callWhy =
    channel === "call"
      ? whyThisLead({
          fitReasons: current.lead.fitReasons,
          summary: current.campaign.strategy.summary,
          icpBusiness: current.campaign.strategy.icp?.business,
        })
      : "";
  const callSite = channel === "call" ? websiteHref(current.lead.website) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {topBar}
      {ratingBar}

      <div className={stack.card === "scroll" ? "flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-6" : "px-4 md:px-6 py-6"}>
        <div className="max-w-xl mx-auto space-y-5">
          <div>
            <p className="section-label mb-2">{channel === "call" ? "Calling" : channel === "email" ? "Emailing" : "Messaging"}</p>
            <p className="text-sm text-muted m-0">Ask for {askFor}</p>
            <h2 className="text-2xl font-bold tracking-tight leading-tight m-0 mt-1">{place}</h2>
            {current.lead.contactRole && <p className="text-xs text-dim mt-1 mb-0">{current.lead.contactRole}</p>}
          </div>

          {channel === "call" && (
            <div className="bg-panel2 border border-rule rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-sm font-medium m-0">{whoLine(current.lead.contactName, current.lead.contactRole)}</p>
              <p className="text-sm text-muted m-0 leading-relaxed">{callWhy}</p>
              {callSite && (
                <a href={callSite} target="_blank" rel="noreferrer" className="text-sm text-accent underline underline-offset-2">
                  {websiteLabel(callSite)}
                </a>
              )}
              {current.lead.lastTouchLabel && <p className="text-xs text-dim m-0">{current.lead.lastTouchLabel}</p>}
            </div>
          )}

          {localTime && (
            <p className={"text-xs font-medium m-0 " + (localTime.inBusinessHours ? "text-accent" : "text-warm")}>
              {localTime.label}
              {localTime.isApproximate ? " · estimated" : ""} · {localTime.inBusinessHours ? "open now" : "likely closed"}
            </p>
          )}

          {channel === "call" && (
            <div>
              {current.lead.phone ? (
                <a
                  href={`tel:${current.lead.phone}`}
                  className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
                >
                  Call {current.lead.phone}
                </a>
              ) : (
                <p className="text-sm text-stop m-0">No phone on file.</p>
              )}
            </div>
          )}

          {channel === "email" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center justify-center border border-rule font-semibold px-5 py-3 rounded-xl text-[15px] hover:border-accent/40"
              >
                {copied ? "Copied" : "Copy draft"}
              </button>
              {mailtoHref ? (
                <a
                  href={mailtoHref}
                  className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
                >
                  Open in Titan
                </a>
              ) : (
                <p className="text-sm text-stop m-0">No email on file.</p>
              )}
            </div>
          )}

          {channel === "linkedin" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center justify-center border border-rule font-semibold px-5 py-3 rounded-xl text-[15px] hover:border-accent/40"
              >
                {copied ? "Copied" : "Copy draft"}
              </button>
              {linkedinHref && (
                <a
                  href={linkedinHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
                >
                  Open LinkedIn
                </a>
              )}
            </div>
          )}

          {channel === "instagram" && current.lead.instagramUrl && (
            <a href={current.lead.instagramUrl} target="_blank" rel="noreferrer" className="text-sm text-accent underline underline-offset-2">
              Open Instagram
            </a>
          )}

          {channel !== "call" && <p className="text-xs text-dim m-0">You send it yourself. Nothing goes out from here.</p>}

          <div className="bg-panel2 border border-accent/25 rounded-2xl px-5 py-4 space-y-2">
            <div className="flex justify-between items-center gap-2">
              <p className="section-label mb-0 text-accent">{channel === "call" ? (opener.variant === "a" ? "Script A" : "Script B") : "Opener"}</p>
              <button type="button" onClick={copy} className="text-xs text-accent font-medium">
                {copied ? "Copied" : "Copy · C"}
              </button>
            </div>
            {emailParts?.subject && <p className="text-sm font-semibold m-0">{emailParts.subject}</p>}
            <p className="text-lg md:text-xl font-medium leading-snug m-0 whitespace-pre-wrap">{emailParts ? emailParts.body : opener.text}</p>
          </div>

          {objections.length > 0 && (
            <div className="space-y-2">
              <p className="section-label mb-0">If they push back</p>
              {objections.map((o) => (
                <div key={o.question} className="bg-panel2 border border-rule rounded-xl px-3 py-2.5">
                  <p className="text-sm font-medium m-0">{o.question}</p>
                  <p className="text-sm text-muted mt-1 mb-0 leading-relaxed">{o.answer}</p>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-stop">{error}</p>}
        </div>
      </div>

      <div
        className={
          stack.outcomes === "footer"
            ? "shrink-0 max-h-[40vh] overflow-y-auto bg-panel/95 backdrop-blur-sm border-t border-rule px-4 md:px-6 py-3"
            : "absolute bottom-0 left-0 right-0 bg-panel/95 backdrop-blur-sm border-t border-rule px-4 md:px-6 py-3 z-20"
        }
      >
        <div className="max-w-xl mx-auto space-y-2">
          {channel === "call" && (
            <input
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              placeholder="What they said (optional)"
              maxLength={500}
              className="w-full border border-rule rounded-xl px-3 py-2 bg-bg text-sm"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
          <span className="section-label mr-1 mb-0 hidden sm:inline">How did it go?</span>
          {outcomes.map((o) => (
            <button
              type="button"
              key={o.outcome}
              onClick={() => handleOutcome(o.outcome)}
              className={
                "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-40 " +
                (o.variant === "go"
                  ? "bg-accent-soft border-accent/40 text-accent"
                  : o.variant === "stop"
                    ? "bg-stop-soft border-stop/30 text-stop"
                    : "bg-panel2 border-rule text-muted hover:text-ink hover:border-accent/20")
              }
            >
              <span>{o.label}</span>
              <span className="font-mono text-[10px] opacity-40">{o.key}</span>
            </button>
          ))}
          <button type="button" onClick={skip} className="text-xs text-dim hover:text-ink px-3 py-2">
            Skip · S
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
