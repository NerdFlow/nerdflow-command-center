"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { logTouchOutcome, rateTouchScript } from "@/server/actions/touches";
import { joinEmailDraft } from "@/server/cadence";
import {
  FOCUS_MODES,
  isFocusMode,
  leadEligibleForFocusMode,
  linkedInOpenUrl,
  resolveFocusOpener,
  type FocusMode,
} from "@/server/focusMode";
import { leadLocalTimeStatus } from "@/server/leadTimezone";
import type { CampaignStrategy } from "@/server/strategy";
import type { Channel, TouchOutcome, LeadSource } from "@prisma/client";

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
    source: LeadSource;
  };
  campaign: { id: string; name: string; productName: string; strategy: CampaignStrategy };
  label: string;
};

const MODE_LABEL: Record<FocusMode, string> = {
  call: "Call",
  email: "Email",
  linkedin: "LinkedIn",
};

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
  { outcome: "wrong_number", label: "Can't send", key: "2", variant: "stop" },
];

const SESSION_LENGTHS: { label: string; seconds: number | null }[] = [
  { label: "30 min", seconds: 1800 },
  { label: "1 hr", seconds: 3600 },
  { label: "2 hr", seconds: 7200 },
  { label: "Until empty", seconds: null },
];

function outcomesFor(mode: FocusMode): OutcomeDef[] {
  return mode === "call" ? CALL_OUTCOMES : MESSAGE_OUTCOMES;
}

function firstNameOf(contactName: string | null): string {
  if (!contactName) return "there";
  return contactName.trim().split(/\s+/)[0] ?? "there";
}

function gmailComposeUrl(to: string, subject: string, body: string) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function askForLabel(contactName: string | null): string {
  const name = contactName?.trim();
  return name || "the owner";
}

export function FocusClient({
  initialCards,
  me,
  repTimezone,
  allowedChannels,
  initialChannel,
}: {
  initialCards: Card[];
  me: string;
  repTimezone: string;
  allowedChannels: Channel[];
  initialChannel?: Channel | "all";
}) {
  const router = useRouter();
  const modes = FOCUS_MODES.filter((mode) => allowedChannels.includes(mode));
  const [cards, setCards] = useState(initialCards);
  const [channelFilter, setChannelFilter] = useState<FocusMode>(() => {
    if (isFocusMode(initialChannel) && allowedChannels.includes(initialChannel)) return initialChannel;
    return modes[0] ?? "call";
  });
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [sessionLengthSeconds, setSessionLengthSeconds] = useState<number | null>(3600);
  const [secondsLeft, setSecondsLeft] = useState(3600);
  const [touchesLogged, setTouchesLogged] = useState(0);
  const [conversations, setConversations] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [businessHoursOnly, setBusinessHoursOnly] = useState(false);
  const [pendingRating, setPendingRating] = useState<{ touchId: string; businessName: string } | null>(null);

  function inMode(card: Card, mode: FocusMode): boolean {
    if (sourceFilter !== "all" && card.lead.source !== sourceFilter) return false;
    if (!leadEligibleForFocusMode(card.lead, mode)) return false;
    if (mode === "call" && businessHoursOnly) {
      return leadLocalTimeStatus(card.lead, repTimezone).inBusinessHours;
    }
    return true;
  }

  const counts = useMemo(() => {
    const out: Record<FocusMode, number> = { call: 0, email: 0, linkedin: 0 };
    for (const mode of modes) {
      out[mode] = cards.filter((card) => inMode(card, mode)).length;
    }
    return out;
    // inMode closes over sourceFilter, businessHoursOnly, and repTimezone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, modes, sourceFilter, businessHoursOnly, repTimezone]);

  const visibleCards = useMemo(
    () => cards.filter((card) => inMode(card, channelFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, channelFilter, sourceFilter, businessHoursOnly, repTimezone],
  );

  const sourcesPresent = useMemo(() => {
    const set = new Set<LeadSource>();
    for (const card of cards) set.add(card.lead.source);
    return Array.from(set);
  }, [cards]);

  const current = visibleCards[0];
  const mode: FocusMode = channelFilter;
  const outcomes = useMemo(() => outcomesFor(mode), [mode]);

  const opener = useMemo(() => {
    if (!current) return null;
    return resolveFocusOpener({
      leadId: current.lead.id,
      channel: mode,
      strategy: current.campaign.strategy,
      cadenceStep: current.lead.cadenceStep,
      values: {
        name: firstNameOf(current.lead.contactName),
        biz: current.lead.businessName,
        city: current.lead.city || "",
        me,
        product: current.campaign.productName,
      },
    });
  }, [current, mode, me]);

  const objections = (current?.campaign.strategy.objections ?? []).filter((item) => item.question.trim()).slice(0, 2);

  useEffect(() => {
    if (!started || sessionLengthSeconds === null) return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [started, sessionLengthSeconds]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!started || !current) return;
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      const match = outcomes.find((item) => item.key === event.key);
      if (match) void handleOutcome(match.outcome);
      if (event.key.toLowerCase() === "s") skip();
      if (event.key.toLowerCase() === "c" && mode !== "call") copyDraft();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, current, outcomes, mode, opener]);

  function poolFor(nextMode: FocusMode) {
    return cards.filter((card) => {
      if (sourceFilter !== "all" && card.lead.source !== sourceFilter) return false;
      if (!leadEligibleForFocusMode(card.lead, nextMode)) return false;
      if (nextMode === "call" && businessHoursOnly) {
        return leadLocalTimeStatus(card.lead, repTimezone).inBusinessHours;
      }
      return true;
    });
  }

  function startSession(nextMode: FocusMode) {
    setChannelFilter(nextMode);
    setSessionTotal(poolFor(nextMode).length);
    setTouchesLogged(0);
    setConversations(0);
    setSecondsLeft(sessionLengthSeconds ?? 0);
    setStarted(true);
  }

  function skip() {
    if (!current) return;
    setCards((prev) => {
      const idx = prev.findIndex((card) => card.lead.id === current.lead.id);
      if (idx === -1) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      if (item) copy.push(item);
      return copy;
    });
  }

  function copyDraft() {
    if (!opener) return;
    const text = mode === "email" ? joinEmailDraft(opener.subject, opener.body) : opener.body || opener.text;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleOutcome(outcome: TouchOutcome) {
    if (!current) return;
    setPendingRating(null);
    setBusy(true);
    setError(null);
    try {
      const res = await logTouchOutcome({
        leadId: current.lead.id,
        channel: mode,
        outcome,
      });
      const doneLeadId = current.lead.id;
      const businessName = current.lead.businessName;
      setCards((prev) => prev.filter((card) => card.lead.id !== doneLeadId));
      setTouchesLogged((n) => n + 1);
      if (outcome === "replied" || outcome === "interested" || outcome === "meeting_booked") {
        setConversations((n) => n + 1);
      }
      setPendingRating({ touchId: res.touchId, businessName });
      if (outcome === "interested" || outcome === "meeting_booked") router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log that outcome — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function rate(rating: "helpful" | "meh" | "bad") {
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
            <p className="section-label mb-2">Focus</p>
            <h2 className="page-title m-0">Who are you working?</h2>
            <p className="text-sm text-muted mt-2 mb-0">One lead at a time. You send every message yourself.</p>
          </div>
          <div className="space-y-3">
            <p className="section-label mb-0">Channel</p>
            <div className="grid grid-cols-3 gap-2">
              {modes.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setChannelFilter(item)}
                  disabled={counts[item] === 0}
                  className={
                    "flex flex-col items-start px-4 py-3.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 " +
                    (channelFilter === item ? "border-accent bg-accent-soft text-ink" : "border-rule bg-panel text-muted hover:text-ink")
                  }
                >
                  <span>{MODE_LABEL[item]}</span>
                  <span className="font-bold text-accent tabular-nums text-lg">{counts[item]}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-dim m-0">Call includes every lead with a phone, whatever step the cadence is on.</p>
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
                    (sessionLengthSeconds === opt.seconds
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-rule bg-panel text-muted hover:text-ink")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {channelFilter === "call" && (
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
                {sourcesPresent.map((source) => (
                  <option key={source} value={source}>
                    {SOURCE_LABEL[source] ?? source}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => startSession(channelFilter)}
              disabled={counts[channelFilter] === 0}
              className="flex-1 bg-accent text-on-accent font-semibold py-3.5 rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-40 text-[15px]"
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => router.push("/today")}
              className="px-5 py-3.5 text-muted rounded-xl hover:text-ink transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mins = sessionLengthSeconds === null ? null : Math.floor(secondsLeft / 60);
  const secs = sessionLengthSeconds === null ? null : String(secondsLeft % 60).padStart(2, "0");
  const sessionTitle = mode === "call" ? "Calls" : mode === "email" ? "Emails" : "LinkedIn";

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
        {mode === "call" && (
          <label className="hidden sm:flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={businessHoursOnly}
              onChange={(e) => setBusinessHoursOnly(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            <span className="text-xs text-dim">Their hours only</span>
          </label>
        )}
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
    <div className="rounded-xl border border-rule bg-panel2 px-4 py-3">
      <p className="text-sm m-0 mb-2">How was the opener for {pendingRating.businessName}?</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["helpful", "Helpful"],
            ["meh", "Meh"],
            ["bad", "Bad"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => void rate(value)}
            className="text-sm font-medium rounded-xl border border-rule bg-panel px-3 py-1.5 text-ink hover:border-accent/40"
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={() => setPendingRating(null)} className="text-sm text-dim px-3 py-1.5 hover:text-ink">
          Skip
        </button>
      </div>
    </div>
  ) : null;

  if (!current || !opener) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {topBar}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm w-full space-y-4">
            {ratingBar}
            <p className="text-muted text-center m-0">Queue&apos;s empty. Nice work.</p>
          </div>
        </div>
      </div>
    );
  }

  const gmailHref =
    mode === "email" && current.lead.email
      ? gmailComposeUrl(current.lead.email, opener.subject || `Quick note about ${current.lead.businessName}`, opener.body)
      : null;
  const linkedInHref = mode === "linkedin" ? linkedInOpenUrl(current.lead.linkedinUrl) : null;
  const variantLabel = opener.variant === "a" || opener.variant === "b" ? `Opener ${opener.variant.toUpperCase()}` : "Opener";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {topBar}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 md:px-6 py-6 pb-36 space-y-6">
          {ratingBar}

          <div>
            <p className="section-label mb-1">Ask for</p>
            <h2 className="text-2xl font-bold tracking-tight m-0">{askForLabel(current.lead.contactName)}</h2>
            <p className="text-sm text-muted mt-1.5 mb-0">
              {current.lead.businessName}
              {current.lead.city ? ` · ${current.lead.city}` : ""}
            </p>
          </div>

          {mode === "call" && current.lead.phone && (
            <a
              href={`tel:${current.lead.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
            >
              Call {current.lead.phone}
            </a>
          )}

          {mode === "email" && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={copyDraft}
                className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
              >
                {copied ? "Copied" : "Copy draft"}
              </button>
              {gmailHref && (
                <a
                  href={gmailHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center border border-accent/40 text-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-soft transition-colors"
                >
                  Open Gmail
                </a>
              )}
              <p className="w-full text-xs text-dim m-0">Opens a draft in your Gmail. Nothing is sent from here.</p>
            </div>
          )}

          {mode === "linkedin" && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={copyDraft}
                className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
              >
                {copied ? "Copied" : "Copy draft"}
              </button>
              {linkedInHref && (
                <a
                  href={linkedInHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center border border-accent/40 text-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-soft transition-colors"
                >
                  Open LinkedIn
                </a>
              )}
              <p className="w-full text-xs text-dim m-0">Paste the draft yourself. Nothing is sent from here.</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="section-label mb-0">{variantLabel}</p>
            {mode === "email" && opener.subject && <p className="text-sm font-medium m-0">{opener.subject}</p>}
            <p className="text-base leading-relaxed m-0 whitespace-pre-wrap">{opener.body || "No opener on this campaign yet. Add scripts on the campaign Scripts tab."}</p>
          </div>

          {objections.length > 0 && (
            <div className="space-y-3">
              <p className="section-label mb-0">If they push back</p>
              {objections.map((item) => (
                <div key={item.question} className="rounded-xl border border-rule bg-panel2 px-4 py-3">
                  <p className="text-sm font-medium m-0">{item.question}</p>
                  <p className="text-sm text-muted mt-1.5 mb-0 leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-stop m-0">{error}</p>}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-panel/95 backdrop-blur-sm border-t border-rule px-4 md:px-6 py-3 z-20">
        <div className="max-w-xl mx-auto flex flex-wrap items-center gap-2">
          <span className="section-label mr-1 mb-0 hidden sm:inline">How did it go?</span>
          {outcomes.map((item) => (
            <button
              type="button"
              key={item.outcome}
              disabled={busy}
              onClick={() => void handleOutcome(item.outcome)}
              className={
                "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-40 " +
                (item.variant === "go"
                  ? "bg-accent-soft border-accent/40 text-accent"
                  : item.variant === "stop"
                    ? "bg-stop-soft border-stop/30 text-stop"
                    : "bg-panel2 border-rule text-muted hover:text-ink hover:border-accent/20")
              }
            >
              <span>{item.label}</span>
              <span className="font-mono text-[10px] opacity-40">{item.key}</span>
            </button>
          ))}
          <button type="button" onClick={skip} disabled={busy} className="text-xs text-dim hover:text-ink px-3 py-2 active:scale-[0.97]">
            Skip · S
          </button>
        </div>
      </div>
    </div>
  );
}
