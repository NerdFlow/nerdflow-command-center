"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Chip, Panel } from "@/components/ui";
import { logTouchOutcome } from "@/server/actions/touches";
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
  };
  campaign: { id: string; name: string; productName: string; strategy: CampaignStrategy };
  label: string;
};

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  call: "Call",
  instagram: "Instagram DM",
  linkedin: "LinkedIn message",
};

function outcomesFor(channel: Channel): { key: string; outcome: TouchOutcome; label: string; variant: "default" | "go" | "stop" }[] {
  const base =
    channel === "call"
      ? [
          { key: "1", outcome: "no_answer" as TouchOutcome, label: "No answer", variant: "default" as const },
          { key: "2", outcome: "talked_not_now" as TouchOutcome, label: "Talked, not now", variant: "default" as const },
        ]
      : [
          { key: "1", outcome: "sent" as TouchOutcome, label: "Sent", variant: "default" as const },
          { key: "2", outcome: "replied" as TouchOutcome, label: "They replied", variant: "default" as const },
        ];
  return [
    ...base,
    { key: "3", outcome: "interested", label: "Interested", variant: "go" },
    { key: "4", outcome: "meeting_booked", label: "Meeting booked", variant: "go" },
    { key: "5", outcome: "not_fit", label: "Not a fit", variant: "stop" },
  ];
}

const FOLLOW_UP_ELIGIBLE: TouchOutcome[] = ["no_answer", "talked_not_now", "sent"];

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

export function FocusClient({ initialCards, me, repTimezone }: { initialCards: Card[]; me: string; repTimezone: string }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [draft, setDraft] = useState("");
  const [pastedOutcome, setPastedOutcome] = useState<TouchOutcome | null>(null);
  const [pastedMessage, setPastedMessage] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingNote, setMeetingNote] = useState("");
  const [followUpChannel, setFollowUpChannel] = useState<Channel | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countByChannel = useMemo(() => {
    const counts: Partial<Record<Channel, number>> = {};
    for (const c of cards) {
      const ch = cardChannel(c);
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
    return counts;
  }, [cards]);

  // Call leads only during their business hours — filtered out of the "current" pick (not deleted, just deprioritized) until then.
  const callable = useMemo(
    () =>
      cards.filter((c) => {
        if (cardChannel(c) !== "call") return true;
        return leadLocalTimeStatus(c.lead, repTimezone).inBusinessHours;
      }),
    [cards, repTimezone],
  );

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
  }, [current, channel, me]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || pastedOutcome) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const match = outcomes.find((o) => o.key === e.key);
      if (match) void handleOutcome(match.outcome);
      if (e.key.toLowerCase() === "s") skip();
      if (e.key.toLowerCase() === "c") copy();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, outcomes, pastedOutcome, draft]);

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
        pastedMessage: message,
        followUpChannel: FOLLOW_UP_ELIGIBLE.includes(outcome) && followUpChannel ? followUpChannel : undefined,
        meetingAt: outcome === "meeting_booked" ? new Date(meetingAt).toISOString() : undefined,
        meetingNote: outcome === "meeting_booked" ? meetingNote : undefined,
      });
      setPastedOutcome(null);
      setPastedMessage("");
      const doneLeadId = current.lead.id;
      setCards((prev) => prev.filter((c) => c.lead.id !== doneLeadId));
      if ((outcome === "interested" || outcome === "meeting_booked") && res.dealId) {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log that outcome — try again.");
    } finally {
      setBusy(false);
    }
  }

  const totalCount = cards.length;
  const filterBar = (
    <div className="flex flex-wrap gap-1.5 mb-4">
      <button
        onClick={() => setChannelFilter("all")}
        className={
          "text-xs px-2.5 py-1 rounded-full border " +
          (channelFilter === "all" ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted hover:text-ink")
        }
      >
        All ({totalCount})
      </button>
      {CHANNEL_FILTERS.map((ch) => (
        <button
          key={ch}
          onClick={() => setChannelFilter(ch)}
          disabled={!countByChannel[ch]}
          className={
            "text-xs px-2.5 py-1 rounded-full border disabled:opacity-40 " +
            (channelFilter === ch ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted hover:text-ink")
          }
        >
          {CHANNEL_LABEL[ch]} ({countByChannel[ch] ?? 0})
        </button>
      ))}
      {outOfHoursCallCount > 0 && (
        <span className="text-xs px-2.5 py-1 rounded-full border border-rule text-muted">
          {outOfHoursCallCount} call{outOfHoursCallCount === 1 ? "" : "s"} waiting for business hours
        </span>
      )}
    </div>
  );

  if (!current) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
        {filterBar}
        <Panel>
          <p className="text-muted">
            {channelFilter === "all"
              ? outOfHoursCallCount > 0
                ? `Nothing left right now — ${outOfHoursCallCount} call${outOfHoursCallCount === 1 ? "" : "s"} waiting for the lead's business hours.`
                : "Nothing left in your queue. Nice work — check back after the next lead engine run."
              : `No ${CHANNEL_LABEL[channelFilter].toLowerCase()} leads queued right now — try a different filter above.`}
          </p>
        </Panel>
      </div>
    );
  }

  const signalEvidence = Object.entries(current.lead.signals)
    .filter(([, v]) => v === true)
    .map(([k]) => k.replace(/_/g, " "));

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 pb-32">
      {filterBar}
      <div className="grid gap-4 md:[grid-template-columns:1.1fr_1fr]">
        <Panel>
          <div className="mb-2">
            <Chip tone="acc">{current.campaign.productName}</Chip>
            <Chip>{current.campaign.name}</Chip>
            <Chip tone={current.label === "Hot" ? "hot" : "default"}>{current.label}</Chip>
          </div>
          <h2 className="text-xl font-semibold mb-0.5">{current.lead.businessName}</h2>
          <p className="text-sm text-muted mb-1">
            {[current.lead.contactName, current.lead.contactRole, current.lead.city].filter(Boolean).join(" · ") || "No contact details yet"}
          </p>
          {localTime && (
            <p className="text-xs text-muted mb-4">
              {localTime.label} local {localTime.isApproximate && "(approx.)"} ·{" "}
              <span className={localTime.inBusinessHours ? "text-go" : "text-stop"}>
                {localTime.inBusinessHours ? "in business hours" : "outside business hours"}
              </span>
            </p>
          )}

          <div className="text-xs text-muted uppercase tracking-wide mb-1">Reach them by</div>
          <div className="text-2xl font-bold tracking-tight mb-1">
            {CHANNEL_LABEL[channel]}
            {current.lead.nextChannelOverride && <span className="text-xs text-accent font-normal ml-2">(handed off)</span>}
          </div>
          <p className="text-[15px] text-muted mb-3.5">
            {signalEvidence.length > 0 ? `${signalEvidence.join(", ")}. ` : ""}
            {step?.purpose ?? "Reach out and see where it goes."}
          </p>
          {step?.tip && (
            <div className="bg-accent-soft rounded-card px-3.5 py-3 mb-4 shadow-[inset_3px_0_0_var(--accent)]">
              <b className="block text-xs text-signal mb-0.5">Sales tip</b>
              {step.tip}
            </div>
          )}

          <div className="flex gap-1.5 flex-wrap mb-4">
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

          {current.campaign.strategy.objections?.length > 0 && (
            <details className="border-t border-rule pt-2 mt-4">
              <summary className="cursor-pointer text-sm font-medium">If they push back</summary>
              <div className="mt-2 space-y-2">
                {current.campaign.strategy.objections.map((o, i) => (
                  <div key={i} className="text-sm">
                    <div className="font-medium">{o.question}</div>
                    <div className="text-muted">{o.answer}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Panel>

        <Panel>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium m-0">Draft message</h3>
            <button onClick={copy} className="text-sm text-accent font-medium">
              {copied ? "Copied!" : "Copy (C)"}
            </button>
          </div>
          <textarea
            className="w-full border border-rule rounded-lg px-3 py-2.5 bg-bg min-h-[220px] leading-relaxed"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="text-xs text-muted mt-2">
            FLOW never sends this for you — copy it into {CHANNEL_LABEL[channel].toLowerCase()} yourself.
          </p>
        </Panel>
      </div>

      {/* Pinned outcome bar — always visible, never scrolled out of reach. */}
      <div className="fixed bottom-0 left-0 right-0 bg-panel border-t border-rule px-4 md:px-8 py-3 z-20">
        <div className="max-w-5xl mx-auto">
          {error && <p className="text-sm text-stop mb-2">{error}</p>}

          {pastedOutcome === "meeting_booked" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted">
                When
                <input type="datetime-local" className="block border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm mt-0.5" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} />
              </label>
              <label className="text-xs text-muted flex-1 min-w-[160px]">
                Note (optional)
                <input className="block w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm mt-0.5" value={meetingNote} onChange={(e) => setMeetingNote(e.target.value)} />
              </label>
              <Btn variant="go" disabled={!meetingAt || busy} onClick={() => handleOutcome("meeting_booked")}>
                {busy ? "Saving…" : "Confirm meeting"}
              </Btn>
              <Btn variant="ghost" onClick={() => setPastedOutcome(null)} disabled={busy}>
                Cancel
              </Btn>
            </div>
          ) : pastedOutcome ? (
            <div className="space-y-2">
              <p className="text-sm font-medium m-0">Paste their message to get coaching later</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-rule rounded-lg px-3 py-2 bg-bg text-sm"
                  value={pastedMessage}
                  onChange={(e) => setPastedMessage(e.target.value)}
                  placeholder="Optional — paste what they said"
                />
                <Btn variant="primary" disabled={busy} onClick={() => handleOutcome(pastedOutcome, pastedMessage)}>
                  {busy ? "Saving…" : "Log outcome"}
                </Btn>
                <Btn variant="ghost" onClick={() => setPastedOutcome(null)} disabled={busy}>
                  Cancel
                </Btn>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {outcomes.map((o) => (
                <Btn key={o.outcome} variant={o.variant} disabled={busy} onClick={() => handleOutcome(o.outcome)}>
                  {o.label} <span className="text-muted ml-1">({o.key})</span>
                </Btn>
              ))}
              <Btn variant="ghost" onClick={skip} disabled={busy}>
                Skip for now (S)
              </Btn>
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-muted">Follow up via</span>
                <select
                  className="text-xs border border-rule rounded-lg px-2 py-1.5 bg-bg"
                  value={followUpChannel ?? ""}
                  onChange={(e) => setFollowUpChannel((e.target.value || null) as Channel | null)}
                >
                  <option value="">(keep cadence channel)</option>
                  {(["call", "email", "instagram", "linkedin"] as Channel[]).map((c) => (
                    <option key={c} value={c}>
                      {CHANNEL_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
