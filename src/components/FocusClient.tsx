"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui";
import { logTouchOutcome } from "@/server/actions/touches";
import { getObjectionResponses, recordObjectionFeedback, getLiveObjectionResponse } from "@/server/actions/objections";
import { rewriteEmailDraft } from "@/server/actions/rewrite";
import { renderMessage, getCallScripts, renderScriptTemplate, type CampaignStrategy } from "@/server/strategy";
import { leadLocalTimeStatus } from "@/server/leadTimezone";
import { joinEmailDraft, resolveLeadChannel, splitEmailDraft } from "@/server/cadence";
import { humanizeTag } from "@/lib/text";
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

/** Email / DM outcomes per product doc: Sent · Can't send · Skip. Replies live on Replies. */
const EMAIL_OUTCOMES: OutcomeDef[] = [
  { outcome: "sent", label: "Sent", key: "1", variant: "go" },
  { outcome: "wrong_number", label: "Can't send / no access", key: "2", variant: "stop" },
];

const DM_OUTCOMES: OutcomeDef[] = [
  { outcome: "sent", label: "Sent", key: "1", variant: "go" },
  { outcome: "wrong_number", label: "Can't send / no access", key: "2", variant: "stop" },
];

function outcomesFor(channel: Channel): OutcomeDef[] {
  if (channel === "call") return CALL_OUTCOMES;
  if (channel === "email") return EMAIL_OUTCOMES;
  return DM_OUTCOMES;
}

const FOLLOW_UP_ELIGIBLE: TouchOutcome[] = ["no_answer", "voicemail", "talked_not_now", "sent"];

function cardChannel(card: Card): Channel {
  return resolveLeadChannel({
    strategy: card.campaign.strategy,
    cadenceStep: card.lead.cadenceStep,
    nextChannelOverride: card.lead.nextChannelOverride,
  });
}

function firstNameOf(contactName: string | null): string {
  if (!contactName) return "there";
  return contactName.trim().split(/\s+/)[0] ?? "there";
}

function gmailComposeUrl(to: string, subject: string, body: string) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

const CHANNEL_FILTERS: Channel[] = ["call", "email", "instagram", "linkedin"];

const SESSION_LENGTHS: { label: string; seconds: number | null }[] = [
  { label: "30 min", seconds: 1800 },
  { label: "1 hr", seconds: 3600 },
  { label: "2 hr", seconds: 7200 },
  { label: "Until empty", seconds: null },
];

const EMAIL_REWRITE_STYLES = [
  { style: "shorter" as const, label: "Shorter" },
  { style: "more_casual" as const, label: "More casual" },
  { style: "different_angle" as const, label: "Different angle" },
];

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
  // Reps only work the channels assigned to them (Settings/Profile "channels worked") -
  // a lead whose next touch is on a channel this rep doesn't work never enters their queue.
  const [cards, setCards] = useState(() => initialCards.filter((c) => allowedChannels.includes(cardChannel(c))));
  const [channelFilter, setChannelFilter] = useState<Channel | "all">(() => {
    if (initialChannel && initialChannel !== "all" && allowedChannels.includes(initialChannel)) return initialChannel;
    if (initialChannel === "all") return "all";
    return "all";
  });
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [draft, setDraft] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewriteNote, setRewriteNote] = useState<string | null>(null);
  const [askFlow, setAskFlow] = useState("");
  const [pastedOutcome, setPastedOutcome] = useState<TouchOutcome | null>(null);
  const [pastedMessage, setPastedMessage] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingNote, setMeetingNote] = useState("");
  const [followUpChannel, setFollowUpChannel] = useState<Channel | null>(null);
  const [notes, setNotes] = useState("");
  const [scriptUsed, setScriptUsed] = useState<"a" | "b" | null>(null);
  const [scriptRating, setScriptRating] = useState<"up" | "down" | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objections, setObjections] = useState<Awaited<ReturnType<typeof getObjectionResponses>>>([]);
  const [activeObjectionId, setActiveObjectionId] = useState<string | null>(null);
  const [objectionFeedback, setObjectionFeedback] = useState<Record<string, "kept_talking" | "lost">>({});
  const [theySaid, setTheySaid] = useState("");
  const [coachingBusy, setCoachingBusy] = useState(false);
  const [coachingResponse, setCoachingResponse] = useState<{ response: string; source: "ai" | "fallback" } | null>(null);

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
    let pool = channelFilter === "all" ? callable : callable.filter((c) => cardChannel(c) === channelFilter);
    if (sourceFilter !== "all") pool = pool.filter((c) => c.lead.source === sourceFilter);
    return pool;
  }, [callable, channelFilter, sourceFilter]);

  const sourcesPresent = useMemo(() => {
    const set = new Set<LeadSource>();
    for (const c of cards) set.add(c.lead.source);
    return Array.from(set);
  }, [cards]);

  const current = visibleCards[0];
  const outOfHoursCallCount = cards.length - callable.length;

  const channel: Channel = current ? cardChannel(current) : "email";
  const step = useMemo(() => {
    if (!current) return undefined;
    const cadence = current.campaign.strategy?.cadence ?? [];
    return (
      cadence.find((s, i) => i >= current.lead.cadenceStep && s.channel === channel) ??
      cadence.find((s) => s.channel === channel) ??
      cadence[current.lead.cadenceStep]
    );
  }, [current, channel]);
  const outcomes = useMemo(() => outcomesFor(channel), [channel]);
  const localTime = current ? leadLocalTimeStatus(current.lead, repTimezone) : null;
  const isEmail = channel === "email";
  const isCall = channel === "call";
  const callScripts = useMemo(() => getCallScripts(current?.campaign.strategy), [current?.campaign.strategy]);
  const scriptValues = useMemo(() => {
    if (!current) return { name: "there", biz: "", city: "", me, product: "" };
    return {
      name: firstNameOf(current.lead.contactName),
      biz: current.lead.businessName,
      city: current.lead.city || "",
      me,
      product: current.campaign.productName,
    };
  }, [current, me]);
  const renderedCallScripts = useMemo(
    (): [string, string] => [
      callScripts[0] ? renderScriptTemplate(callScripts[0], scriptValues) : "",
      callScripts[1] ? renderScriptTemplate(callScripts[1], scriptValues) : "",
    ],
    [callScripts, scriptValues],
  );

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
    if (channel === "email") {
      const parts = splitEmailDraft(text);
      setEmailSubject(parts.subject || `Quick note about ${current.lead.businessName}`);
      setEmailBody(parts.body || text);
    } else {
      setEmailSubject("");
      setEmailBody("");
    }
    setRewriteNote(null);
    setAskFlow("");
    setFollowUpChannel(null);
    setMeetingAt("");
    setMeetingNote("");
    setNotes("");
    setScriptUsed(null);
    setScriptRating(null);
    setObjectionFeedback({});
    setActiveObjectionId(null);
    setTheySaid("");
    setCoachingResponse(null);
  }, [current, channel, me]);

  function pickCallScript(which: "a" | "b") {
    setScriptUsed(which);
    const text = which === "a" ? renderedCallScripts[0] : renderedCallScripts[1];
    if (text) setDraft(text);
  }

  async function runEmailRewrite(style: "shorter" | "more_casual" | "different_angle" | "custom") {
    if (!current || !isEmail) return;
    setRewriteBusy(true);
    setRewriteNote(null);
    try {
      const result = await rewriteEmailDraft({
        campaignId: current.campaign.id,
        leadId: current.lead.id,
        style,
        customInstruction: style === "custom" ? askFlow : undefined,
        subject: emailSubject,
        body: emailBody,
      });
      setEmailSubject(result.subject);
      setEmailBody(result.body);
      setDraft(joinEmailDraft(result.subject, result.body));
      if (result.note) setRewriteNote(result.note);
      else if (result.source === "fallback") setRewriteNote("AI unavailable — restored the campaign's saved email template.");
      else setRewriteNote(null);
    } catch {
      setRewriteNote("Couldn't rewrite — try again, or use the template as-is.");
    } finally {
      setRewriteBusy(false);
    }
  }
  async function getCoaching() {
    if (!current || !theySaid.trim()) return;
    setCoachingBusy(true);
    try {
      const result = await getLiveObjectionResponse({
        campaignId: current.campaign.id,
        leadSaid: theySaid,
        businessName: current.lead.businessName,
        contactFirstName: firstNameOf(current.lead.contactName),
      });
      setCoachingResponse(result);
    } catch {
      setCoachingResponse({ response: "Couldn't reach Flow — try rephrasing or check your connection.", source: "fallback" });
    } finally {
      setCoachingBusy(false);
    }
  }

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
    let pool = ch === "all" ? callable : callable.filter((c) => cardChannel(c) === ch);
    if (sourceFilter !== "all") pool = pool.filter((c) => c.lead.source === sourceFilter);
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
    const text = isEmail ? joinEmailDraft(emailSubject, emailBody) : draft;
    navigator.clipboard.writeText(text).then(() => {
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
        scriptUsed: channel === "call" ? scriptUsed ?? undefined : undefined,
        scriptRating: channel === "call" ? scriptRating ?? undefined : undefined,
        callerNote: channel === "call" ? notes || theySaid || undefined : undefined,
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
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-lg space-y-7 animate-fade-up">
          <div>
            <p className="section-label mb-2">Focus</p>
            <h2 className="page-title m-0">Who are you working?</h2>
            <p className="text-sm text-muted mt-2 mb-0">One lead at a time. Pick a channel, then go.</p>
          </div>
          <div className="space-y-3">
            <p className="section-label mb-0">Channel</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSetupChannel("all")}
                className={
                  "flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-medium transition-all " +
                  (setupChannel === "all" ? "border-accent bg-accent-soft text-ink" : "border-rule bg-panel text-muted hover:text-ink")
                }
              >
                <span>Everything</span>
                <span className="font-bold text-accent tabular-nums text-lg">{cards.length}</span>
              </button>
              {channelTiles.map(({ channel: ch, label, count }) => (
                <button
                  type="button"
                  key={ch}
                  onClick={() => setSetupChannel(ch as Channel)}
                  disabled={count === 0}
                  className={
                    "flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 " +
                    (setupChannel === ch ? "border-accent bg-accent-soft text-ink" : "border-rule bg-panel text-muted hover:text-ink")
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
              onClick={() => startSession(setupChannel)}
              disabled={(setupChannel === "all" ? cards.length : countByChannel[setupChannel as Channel] ?? 0) === 0}
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
    channelFilter === "all"
      ? "All channels"
      : channelFilter === "call"
        ? "Calls"
        : channelFilter === "email"
          ? "Emails"
          : CHANNEL_LABEL[channelFilter];

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
        {sourcesPresent.length > 1 && (
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as LeadSource | "all")}
            className="text-xs border border-rule rounded-lg px-2 py-1.5 bg-panel2"
          >
            <option value="all">All sources</option>
            {sourcesPresent.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        )}
        <span className="text-sm">
          <span className="font-bold text-ink tabular-nums text-base">{touchesLogged}</span>
          <span className="text-dim"> / {sessionTotal}</span>
        </span>
        {conversations > 0 && (
          <span className="text-sm text-accent font-semibold tabular-nums">{conversations} good</span>
        )}
        <button type="button" onClick={endSession} className="text-xs text-dim hover:text-ink px-2 py-1.5 transition-colors">
          End
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

  const whyLine =
    (signalEvidence.length > 0 ? `${signalEvidence.join(", ")}. ` : "") +
    (step?.purpose ?? current.lead.fitReasons[0] ?? "Reach out and see where it goes.");

  const otherChannels: { label: string; href: string }[] = [];
  if (channel !== "call" && current.lead.phone) otherChannels.push({ label: current.lead.phone, href: `tel:${current.lead.phone}` });
  if (channel !== "email" && current.lead.email) otherChannels.push({ label: current.lead.email, href: `mailto:${current.lead.email}` });
  if (channel !== "instagram" && current.lead.instagramUrl) otherChannels.push({ label: "Instagram", href: current.lead.instagramUrl });
  if (channel !== "linkedin" && current.lead.linkedinUrl) otherChannels.push({ label: "LinkedIn", href: current.lead.linkedinUrl });

  const mailtoHref = current.lead.email
    ? `mailto:${encodeURIComponent(current.lead.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : null;
  const gmailHref = current.lead.email ? gmailComposeUrl(current.lead.email, emailSubject, emailBody) : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {topBar}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(200px,0.85fr)_minmax(280px,1.4fr)_minmax(200px,0.9fr)] overflow-hidden">
        {/* Left: who */}
        <div className="border-r border-rule overflow-y-auto p-5 md:p-6 space-y-5 pb-28">
          {localTime && channel === "call" && (
            <div
              className={
                "flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl " +
                (localTime.inBusinessHours ? "bg-accent-soft text-accent" : "bg-warm-soft text-warm")
              }
            >
              <span>
                {localTime.label}
                {localTime.isApproximate ? " · estimated" : ""}
              </span>
              <span>· {localTime.inBusinessHours ? "open now" : "likely closed"}</span>
            </div>
          )}
          <div>
            <p className="section-label mb-2">
              {channel === "call" ? "Calling" : isEmail ? "Emailing" : "Messaging"}
            </p>
            <h2 className="text-2xl font-bold tracking-tight leading-tight m-0">{current.lead.businessName}</h2>
            <p className="text-sm text-muted mt-1.5 mb-0">
              {[current.lead.city, current.lead.contactName ?? "Ask for the owner"].filter(Boolean).join(" · ")}
            </p>
            {current.lead.contactRole && <p className="text-xs text-dim mt-0.5 mb-0">{current.lead.contactRole}</p>}
          </div>

          {channel === "call" && current.lead.phone && (
            <div className="bg-panel2 border border-rule rounded-xl p-4">
              <p className="section-label mb-2">Phone</p>
              <div className="flex items-center justify-between gap-2">
                <a href={`tel:${current.lead.phone}`} className="text-xl font-bold font-mono tracking-wide text-ink hover:text-accent">
                  {current.lead.phone}
                </a>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(current.lead.phone!)}
                  className="shrink-0 text-xs font-medium text-accent border border-accent/30 rounded-lg px-2.5 py-1.5 hover:bg-accent-soft transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {isEmail && (
            <div className="bg-panel2 border border-rule rounded-xl p-4">
              <p className="section-label mb-2">To</p>
              {current.lead.email ? (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xl font-bold font-mono tracking-wide break-all text-ink">{current.lead.email}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(current.lead.email!)}
                    className="shrink-0 text-xs font-medium text-accent border border-accent/30 rounded-lg px-2.5 py-1.5 hover:bg-accent-soft transition-colors"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <p className="text-sm text-stop m-0">No email on file — mark Can&apos;t send.</p>
              )}
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
            <div className="flex justify-between items-baseline">
              <p className="section-label mb-0">Match</p>
              <span className={"text-sm font-bold " + (current.lead.fitScore >= 80 ? "text-accent" : "text-warm")}>
                {current.lead.fitScore >= 80 ? "Strong" : current.lead.fitScore >= 50 ? "OK" : "Weak"}
              </span>
            </div>
            <div className="h-1.5 bg-rule rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${current.lead.fitScore}%`, background: current.lead.fitScore >= 80 ? "var(--accent)" : "var(--warm)" }}
              />
            </div>
          </div>

          {(current.lead.fitReasons.length > 0 || current.lead.fitFlags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {current.lead.fitReasons.map((s) => (
                <span key={s} className="text-[11px] bg-accent-soft text-accent border border-accent/20 rounded-full px-2.5 py-0.5">
                  {humanizeTag(s)}
                </span>
              ))}
              {current.lead.fitFlags.map((g) => (
                <span key={g} className="text-[11px] bg-panel2 text-muted rounded-full px-2.5 py-0.5">
                  {humanizeTag(g)}
                </span>
              ))}
            </div>
          )}

          {(current.lead.sourceUrl || current.lead.website) && (
            <div className="flex flex-wrap gap-3 text-xs">
              {current.lead.website && (
                <a href={current.lead.website} target="_blank" rel="noreferrer" className="text-dim hover:text-ink underline underline-offset-2">
                  Website
                </a>
              )}
              {current.lead.sourceUrl && (
                <a href={current.lead.sourceUrl} target="_blank" rel="noreferrer" className="text-dim hover:text-ink underline underline-offset-2">
                  Source
                </a>
              )}
            </div>
          )}
        </div>

        {/* Center: plan + draft */}
        <div className="border-r border-rule overflow-y-auto p-5 md:p-7 space-y-5 pb-28">
          <div>
            <p className="section-label mb-2">Why them</p>
            <p className="text-sm text-muted leading-relaxed m-0">{whyLine}</p>
          </div>

          {isEmail ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center gap-2">
                <p className="section-label mb-0 text-accent">Send this</p>
                <button type="button" onClick={copy} className="text-xs text-accent font-medium">
                  {copied ? "Copied!" : "Copy · C"}
                </button>
              </div>
              <div className="bg-panel2 border border-accent/25 rounded-2xl overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-rule/70">
                  <p className="section-label mb-1.5">Subject</p>
                  <input
                    value={emailSubject}
                    onChange={(e) => {
                      setEmailSubject(e.target.value);
                      setDraft(joinEmailDraft(e.target.value, emailBody));
                    }}
                    className="w-full bg-transparent border-0 p-0 text-xl font-semibold tracking-tight text-ink placeholder:text-dim focus:outline-none"
                    placeholder="Subject line"
                  />
                </div>
                <div className="px-5 py-4">
                  <p className="section-label mb-2">Body</p>
                  <textarea
                    className="w-full bg-transparent border-0 p-0 text-xl md:text-2xl font-medium leading-snug resize-none focus:outline-none min-h-[200px] text-ink placeholder:text-dim"
                    value={emailBody}
                    onChange={(e) => {
                      setEmailBody(e.target.value);
                      setDraft(joinEmailDraft(emailSubject, e.target.value));
                    }}
                    placeholder={`Hi ${firstNameOf(current.lead.contactName)},`}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {gmailHref && (
                  <a
                    href={gmailHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
                  >
                    Open Gmail
                  </a>
                )}
                {!gmailHref && mailtoHref && (
                  <a
                    href={mailtoHref}
                    className="inline-flex items-center justify-center border border-accent/40 text-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-soft transition-colors"
                  >
                    Open mail app
                  </a>
                )}
                <button
                  type="button"
                  onClick={copy}
                  className="text-sm font-medium text-muted border border-rule rounded-xl px-4 py-3 hover:text-ink hover:border-accent/30 transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-dim m-0">You send it from your own inbox. The app never does.</p>
            </div>
          ) : isCall ? (
            <div className="space-y-4">
              <div>
                <p className="section-label mb-2">Which script did you use?</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["a", "b"] as const).map((letter, idx) => {
                    const text = renderedCallScripts[idx]!;
                    const selected = scriptUsed === letter;
                    return (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => pickCallScript(letter)}
                        className={
                          "text-left rounded-2xl border px-4 py-3 transition-colors " +
                          (selected
                            ? "border-accent bg-accent-soft"
                            : "border-rule bg-panel2 hover:border-accent/30")
                        }
                      >
                        <p className={"text-xs font-semibold mb-1.5 " + (selected ? "text-accent" : "text-muted")}>
                          Script {letter.toUpperCase()}
                          {selected ? " · selected" : ""}
                        </p>
                        <p className={"text-sm leading-snug m-0 " + (text ? "text-ink" : "text-dim italic")}>
                          {text || "Empty — add this script on the campaign Playbook tab."}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="section-label mb-0 text-accent">Say this</p>
                  <button type="button" onClick={copy} className="text-xs text-accent font-medium">
                    {copied ? "Copied!" : "Copy · C"}
                  </button>
                </div>
                <textarea
                  className="w-full bg-panel2 border border-accent/25 rounded-2xl px-5 py-4 text-xl md:text-2xl font-medium leading-snug resize-none focus:outline-none focus:border-accent/50 min-h-[140px] text-ink"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Pick a script above, or type what you’ll say"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <p className="section-label mb-0 mr-1">Was it good?</p>
                <button
                  type="button"
                  onClick={() => setScriptRating((r) => (r === "up" ? null : "up"))}
                  className={
                    "text-sm font-medium rounded-xl border px-3.5 py-2 transition-colors " +
                    (scriptRating === "up"
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-rule bg-panel2 text-muted hover:text-ink")
                  }
                >
                  Thumbs up
                </button>
                <button
                  type="button"
                  onClick={() => setScriptRating((r) => (r === "down" ? null : "down"))}
                  className={
                    "text-sm font-medium rounded-xl border px-3.5 py-2 transition-colors " +
                    (scriptRating === "down"
                      ? "border-stop/40 bg-stop-soft text-stop"
                      : "border-rule bg-panel2 text-muted hover:text-ink")
                  }
                >
                  Thumbs down
                </button>
                {!scriptUsed && (
                  <span className="text-xs text-dim">Optional — outcome still saves without a pick.</span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="section-label mb-0 text-accent">Send this</p>
                <button type="button" onClick={copy} className="text-xs text-accent font-medium">
                  {copied ? "Copied!" : "Copy · C"}
                </button>
              </div>
              <textarea
                className="w-full bg-panel2 border border-accent/25 rounded-2xl px-5 py-4 text-xl md:text-2xl font-medium leading-snug resize-none focus:outline-none focus:border-accent/50 min-h-[160px] text-ink"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>
          )}

          {step?.tip && (
            <div className="space-y-1">
              <p className="section-label mb-0">Tip</p>
              <p className="text-sm text-muted m-0">{step.tip}</p>
            </div>
          )}

          {current.campaign.strategy.cadence?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {current.campaign.strategy.cadence.map((c, i) => (
                <span
                  key={i}
                  className={
                    "text-xs px-2.5 py-1 rounded-lg border " +
                    (i === current.lead.cadenceStep
                      ? "border-accent bg-accent-soft font-semibold"
                      : i < current.lead.cadenceStep
                        ? "border-rule text-dim line-through opacity-60"
                        : "border-rule text-dim")
                  }
                >
                  Day {c.day}: {CHANNEL_LABEL[c.channel]}
                </span>
              ))}
            </div>
          )}

          {pastedOutcome === "meeting_booked" ? (
            <div className="space-y-3 border-t border-rule pt-4">
              <p className="section-label mb-0">Book the meeting</p>
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
                  type="button"
                  onClick={() => handleOutcome("meeting_booked")}
                  disabled={!meetingAt || busy}
                  className="flex-1 bg-accent text-on-accent font-semibold py-2.5 rounded-xl hover:bg-accent-hover transition-colors text-sm disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Confirm meeting & next lead"}
                </button>
                <button type="button" onClick={() => setPastedOutcome(null)} disabled={busy} className="px-4 py-2.5 text-muted rounded-xl text-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : pastedOutcome ? (
            <div className="space-y-2 border-t border-rule pt-4">
              <p className="text-sm font-medium">What they said (optional)</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-rule rounded-lg px-3 py-2 bg-panel2 text-sm"
                  value={pastedMessage}
                  onChange={(e) => setPastedMessage(e.target.value)}
                  placeholder="Paste their words"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleOutcome(pastedOutcome, pastedMessage)}
                  className="bg-accent text-on-accent font-semibold px-4 rounded-xl text-sm disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Log"}
                </button>
                <button type="button" onClick={() => setPastedOutcome(null)} disabled={busy} className="px-4 text-muted rounded-xl text-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {error && <p className="text-sm text-stop">{error}</p>}
        </div>

        {/* Right: help — call objections, or email rewrite helpers */}
        <div className="overflow-y-auto p-5 space-y-4 pb-28">
          {isEmail ? (
            <>
              <p className="section-label mb-0">Rewrite</p>
              <div className="flex flex-wrap gap-2">
                {EMAIL_REWRITE_STYLES.map((opt) => (
                  <button
                    key={opt.style}
                    type="button"
                    disabled={rewriteBusy}
                    onClick={() => void runEmailRewrite(opt.style)}
                    className="text-sm font-medium border border-rule rounded-xl px-3.5 py-2.5 bg-panel2 text-ink hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-40"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {rewriteBusy && <p className="text-xs text-muted m-0">Rewriting…</p>}
              {rewriteNote && <p className="text-xs text-muted m-0">{rewriteNote}</p>}

              <div className="border-t border-rule pt-4 space-y-2">
                <p className="section-label mb-0">Ask for a different angle</p>
                <textarea
                  value={askFlow}
                  onChange={(e) => setAskFlow(e.target.value)}
                  placeholder="Stuck? e.g. Lead with their website redesign…"
                  rows={4}
                  className="w-full bg-panel2 border border-rule rounded-xl p-3 text-sm placeholder-muted resize-none focus:outline-none focus:border-accent/40"
                />
                <button
                  type="button"
                  onClick={() => void runEmailRewrite("custom")}
                  disabled={!askFlow.trim() || rewriteBusy}
                  className="text-xs font-medium text-accent border border-accent/30 rounded-lg px-3 py-1.5 hover:bg-accent-soft transition-colors disabled:opacity-40"
                >
                  {rewriteBusy ? "Thinking…" : "Rewrite with this"}
                </button>
              </div>

              {current.campaign.strategy.objections?.length > 0 && (
                <div className="border-t border-rule pt-4 space-y-2">
                  <p className="section-label mb-0">If they push back later</p>
                  {current.campaign.strategy.objections.slice(0, 4).map((o, i) => (
                    <details key={i} className="bg-panel2 border border-rule rounded-xl px-3 py-2.5">
                      <summary className="text-sm font-medium cursor-pointer">{o.question}</summary>
                      <p className="text-sm text-muted mt-2 leading-relaxed m-0">{o.answer}</p>
                    </details>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
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

              <div className="border-t border-rule pt-4 space-y-2">
                <p className="section-label mb-0">What did they say?</p>
                <textarea
                  value={theySaid || notes}
                  onChange={(e) => {
                    setTheySaid(e.target.value);
                    setNotes(e.target.value);
                  }}
                  placeholder="Their words, or anything to remember for next time"
                  rows={4}
                  className="w-full bg-panel2 border border-rule rounded-xl p-3 text-sm placeholder-muted resize-none focus:outline-none focus:border-accent/40"
                />
                <button
                  type="button"
                  onClick={getCoaching}
                  disabled={!theySaid.trim() || coachingBusy}
                  className="text-xs font-medium text-accent border border-accent/30 rounded-lg px-3 py-1.5 hover:bg-accent-soft transition-colors disabled:opacity-40"
                >
                  {coachingBusy ? "Thinking…" : "Get a reply line"}
                </button>
                {coachingResponse && (
                  <div className="bg-accent-soft border border-accent/20 rounded-xl p-3 space-y-1">
                    <p className="text-sm leading-relaxed m-0">{coachingResponse.response}</p>
                    {coachingResponse.source === "fallback" && (
                      <p className="text-[10px] text-dim m-0">AI unavailable — matched from your saved playbook.</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pinned outcome bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-panel/95 backdrop-blur-sm border-t border-rule px-4 md:px-6 py-3 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label mr-1 mb-0 hidden sm:inline">How did it go?</span>
          {busy && (
            <span className="text-xs text-accent inline-flex items-center gap-1.5 mr-1">
              <span className="btn-spinner inline-block w-3 h-3 border-2 border-accent/25 border-t-accent rounded-full" />
              Saving…
            </span>
          )}
          {outcomes.map((o) => (
            <button
              type="button"
              key={o.outcome}
              disabled={busy}
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
          <button type="button" onClick={skip} disabled={busy} className="text-xs text-dim hover:text-ink px-3 py-2 active:scale-[0.97]">
            Skip · S
          </button>
          {channel === "call" && (
            <details className="ml-auto">
              <summary className="text-xs text-dim cursor-pointer list-none hover:text-ink px-2 py-1">Next channel…</summary>
              <select
                className="mt-1 text-xs border border-rule rounded-lg px-2 py-1.5 bg-panel2 block"
                value={followUpChannel ?? ""}
                onChange={(e) => setFollowUpChannel((e.target.value || null) as Channel | null)}
              >
                <option value="">Stay on plan</option>
                {CHANNEL_FILTERS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
