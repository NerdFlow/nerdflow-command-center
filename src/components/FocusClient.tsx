"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { logTouchOutcome, rateTouchScript } from "@/server/actions/touches";
import { splitEmailDraft } from "@/server/cadence";
import { cadenceChannel, cardInRepQueue, focusWorkingChannel, matchesFocusFilter } from "@/lib/focusQueue";
import { focusObjections, resolveFocusOpener, type ScriptRating } from "@/lib/focusScripts";
import { linkedinOpenUrl, mailtoUrl } from "@/lib/outreachLinks";
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

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  call: "Call",
  instagram: "Instagram DM",
  linkedin: "LinkedIn DM",
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
  { outcome: "wrong_number", label: "Can't send / no access", key: "2", variant: "stop" },
  { outcome: "interested", label: "Interested", key: "3", variant: "go" },
  { outcome: "talked_not_now", label: "Follow-up", key: "4", variant: "default" },
];

function outcomesFor(channel: Channel): OutcomeDef[] {
  return channel === "call" ? CALL_OUTCOMES : MESSAGE_OUTCOMES;
}

function firstNameOf(contactName: string | null): string {
  if (!contactName) return "there";
  return contactName.trim().split(/\s+/)[0] ?? "there";
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
}: {
  initialCards: Card[];
  me: string;
  repTimezone: string;
  allowedChannels: Channel[];
  initialChannel?: Channel | "all";
}) {
  const router = useRouter();
  const [cards, setCards] = useState(() => initialCards.filter((c) => cardInRepQueue(c, allowedChannels)));
  const [channelFilter, setChannelFilter] = useState<Channel | "all">(() => {
    if (initialChannel && initialChannel !== "all" && allowedChannels.includes(initialChannel)) return initialChannel;
    if (initialChannel === "all") return "all";
    return "all";
  });
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        name: firstNameOf(current.lead.contactName),
        biz: current.lead.businessName,
        city: current.lead.city || "",
        me,
        product: current.campaign.productName,
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
    if (!current) return [];
    return focusObjections(current.campaign.strategy, current.campaign.productName);
  }, [current]);

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
      if (!started || !current) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const match = outcomes.find((o) => o.key === e.key);
      if (match) void handleOutcome(match.outcome);
      if (e.key.toLowerCase() === "s") skip();
      if (e.key.toLowerCase() === "c") copy();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, current, outcomes, draftText]);

  function startSession(ch: Channel | "all") {
    if (ch !== "all") setChannelFilter(ch);
    setSessionTotal(selectFocusCards(cards, ch, sourceFilter, businessHoursOnly, repTimezone).length);
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

  async function handleOutcome(outcome: TouchOutcome) {
    if (!current || !opener) return;
    setBusy(true);
    setError(null);
    try {
      const res = await logTouchOutcome({
        leadId: current.lead.id,
        channel,
        outcome,
        scriptUsed: opener.variant,
        scriptId: opener.scriptId,
      });
      const doneLeadId = current.lead.id;
      const businessName = current.lead.businessName;
      setCards((prev) => prev.filter((c) => c.lead.id !== doneLeadId));
      setTouchesLogged((n) => n + 1);
      if (outcome === "replied" || outcome === "interested" || outcome === "meeting_booked") {
        setConversations((n) => n + 1);
      }
      if (res.touchId) setPendingRating({ touchId: res.touchId, businessName });
      if ((outcome === "interested" || outcome === "meeting_booked") && res.dealId) {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log that outcome — try again.");
    } finally {
      setBusy(false);
    }
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
    const channelTiles: { channel: Channel; label: string; count: number }[] = (
      [
        { channel: "call" as const, label: "Call", count: countByChannel.call },
        { channel: "email" as const, label: "Email", count: countByChannel.email },
        { channel: "linkedin" as const, label: "LinkedIn", count: countByChannel.linkedin },
        { channel: "instagram" as const, label: "Instagram DM", count: countByChannel.instagram },
      ]
    ).filter((t) => allowedChannels.includes(t.channel));

    return (
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-lg space-y-7 animate-fade-up">
          <div>
            <p className="section-label mb-2">Focus</p>
            <h2 className="page-title m-0">Who are you working?</h2>
            <p className="text-sm text-muted mt-2 mb-0">
              Call is every lead of yours with a phone. LinkedIn is every lead in this queue. Email follows the cadence step.
            </p>
          </div>
          <div className="space-y-3">
            <p className="section-label mb-0">Channel</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChannelFilter("all")}
                className={
                  "flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-medium transition-all " +
                  (channelFilter === "all" ? "border-accent bg-accent-soft text-ink" : "border-rule bg-panel text-muted hover:text-ink")
                }
              >
                <span>Everything</span>
                <span className="font-bold text-accent tabular-nums text-lg">
                  {selectFocusCards(cards, "all", sourceFilter, businessHoursOnly, repTimezone).length}
                </span>
              </button>
              {channelTiles.map(({ channel: ch, label, count }) => (
                <button
                  type="button"
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  disabled={count === 0}
                  className={
                    "flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 " +
                    (channelFilter === ch ? "border-accent bg-accent-soft text-ink" : "border-rule bg-panel text-muted hover:text-ink")
                  }
                >
                  <span>{label}</span>
                  <span className="font-bold text-accent tabular-nums text-lg">{count}</span>
                </button>
              ))}
            </div>
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
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={businessHoursOnly}
              onChange={(e) => setBusinessHoursOnly(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            <span className="text-sm text-muted">Only call leads in their local business hours</span>
          </label>
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
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => startSession(channelFilter)}
              disabled={selectFocusCards(cards, channelFilter, sourceFilter, businessHoursOnly, repTimezone).length === 0}
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
  const sessionTitle =
    channelFilter === "all" ? "All channels" : channelFilter === "call" ? "Calls" : channelFilter === "email" ? "Emails" : CHANNEL_LABEL[channelFilter];

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
        {channelFilter === "call" || channelFilter === "all" ? (
          <label className="hidden sm:flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={businessHoursOnly} onChange={(e) => setBusinessHoursOnly(e.target.checked)} className="accent-[var(--accent)]" />
            <span className="text-xs text-dim">Their hours only</span>
          </label>
        ) : null}
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

  const askFor = current.lead.contactName?.trim() || "the owner";
  const place = [current.lead.businessName, current.lead.city].filter(Boolean).join(" · ");
  const mailtoHref = current.lead.email && emailParts ? mailtoUrl(current.lead.email, emailParts.subject, emailParts.body) : null;
  const linkedinHref = channel === "linkedin" ? linkedinOpenUrl(current.lead) : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {topBar}
      {ratingBar}

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 pb-28">
        <div className="max-w-xl mx-auto space-y-5">
          <div>
            <p className="section-label mb-2">{channel === "call" ? "Calling" : channel === "email" ? "Emailing" : "Messaging"}</p>
            <p className="text-sm text-muted m-0">Ask for {askFor}</p>
            <h2 className="text-2xl font-bold tracking-tight leading-tight m-0 mt-1">{place}</h2>
            {current.lead.contactRole && <p className="text-xs text-dim mt-1 mb-0">{current.lead.contactRole}</p>}
          </div>

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
              <p className="section-label mb-0 text-accent">Opener</p>
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

      <div className="absolute bottom-0 left-0 right-0 bg-panel/95 backdrop-blur-sm border-t border-rule px-4 md:px-6 py-3 z-20">
        <div className="flex flex-wrap items-center gap-2 max-w-xl mx-auto">
          <span className="section-label mr-1 mb-0 hidden sm:inline">How did it go?</span>
          {outcomes.map((o) => (
            <button
              type="button"
              key={o.outcome}
              disabled={busy}
              onClick={() => void handleOutcome(o.outcome)}
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
          <button type="button" onClick={skip} disabled={busy} className="text-xs text-dim hover:text-ink px-3 py-2">
            Skip · S
          </button>
        </div>
      </div>
    </div>
  );
}
