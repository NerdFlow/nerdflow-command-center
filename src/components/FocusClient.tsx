"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Chip, Panel } from "@/components/ui";
import { logTouchOutcome } from "@/server/actions/touches";
import { renderMessage, type CampaignStrategy } from "@/server/strategy";
import type { Channel, TouchOutcome } from "@prisma/client";

type Card = {
  lead: {
    id: string;
    businessName: string;
    contactName: string | null;
    contactRole: string | null;
    city: string | null;
    cadenceStep: number;
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
  if (channel === "call") {
    return [
      { key: "1", outcome: "no_answer", label: "No answer", variant: "default" },
      { key: "2", outcome: "talked_not_now", label: "Talked, not now", variant: "default" },
      { key: "3", outcome: "interested", label: "Interested", variant: "go" },
      { key: "4", outcome: "not_fit", label: "Not a fit", variant: "stop" },
    ];
  }
  return [
    { key: "1", outcome: "sent", label: "Sent", variant: "default" },
    { key: "2", outcome: "replied", label: "They replied", variant: "default" },
    { key: "3", outcome: "interested", label: "Interested", variant: "go" },
    { key: "4", outcome: "not_fit", label: "Not a fit", variant: "stop" },
  ];
}

function cardChannel(card: Card): Channel {
  const step = card.campaign.strategy?.cadence?.[card.lead.cadenceStep];
  return step?.channel ?? card.campaign.strategy?.channels?.[0]?.channel ?? "email";
}

const CHANNEL_FILTERS: Channel[] = ["call", "email", "instagram", "linkedin"];

export function FocusClient({ initialCards, me }: { initialCards: Card[]; me: string }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [draft, setDraft] = useState("");
  const [pastedOutcome, setPastedOutcome] = useState<TouchOutcome | null>(null);
  const [pastedMessage, setPastedMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const countByChannel = useMemo(() => {
    const counts: Partial<Record<Channel, number>> = {};
    for (const c of cards) {
      const ch = cardChannel(c);
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
    return counts;
  }, [cards]);

  const visibleCards = useMemo(
    () => (channelFilter === "all" ? cards : cards.filter((c) => cardChannel(c) === channelFilter)),
    [cards, channelFilter],
  );

  const current = visibleCards[0];

  const step = current?.campaign.strategy?.cadence?.[current.lead.cadenceStep];
  const channel: Channel = step?.channel ?? current?.campaign.strategy?.channels?.[0]?.channel ?? "email";
  const outcomes = useMemo(() => outcomesFor(channel), [channel]);

  useEffect(() => {
    if (!current) return;
    const variant = current.lead.cadenceStep === 0 ? "first" : "follow";
    const text = renderMessage(current.campaign.strategy, channel, variant, {
      name: current.lead.contactName || "there",
      biz: current.lead.businessName,
      city: current.lead.city || "",
      me,
      product: current.campaign.productName,
    });
    setDraft(text);
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
    setBusy(true);
    const res = await logTouchOutcome({ leadId: current.lead.id, channel, outcome, pastedMessage: message });
    setBusy(false);
    setPastedOutcome(null);
    setPastedMessage("");
    const doneLeadId = current.lead.id;
    setCards((prev) => prev.filter((c) => c.lead.id !== doneLeadId));
    if (outcome === "interested" && res.dealId) {
      router.refresh();
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
    </div>
  );

  if (!current) {
    return (
      <div>
        {filterBar}
        <Panel>
          <p className="text-muted">
            {channelFilter === "all"
              ? "Nothing left in your queue. Nice work — check back after the next lead engine run."
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
    <div>
      {filterBar}
      <div className="grid gap-4 md:[grid-template-columns:1.1fr_1fr]">
      <Panel>
        <div className="mb-2">
          <Chip tone="acc">{current.campaign.productName}</Chip>
          <Chip>{current.campaign.name}</Chip>
          <Chip tone={current.label === "Hot" ? "hot" : "default"}>{current.label}</Chip>
        </div>
        <h2 className="text-xl font-semibold mb-0.5">{current.lead.businessName}</h2>
        <p className="text-sm text-muted mb-4">
          {[current.lead.contactName, current.lead.contactRole, current.lead.city].filter(Boolean).join(" · ") || "No contact details yet"}
        </p>

        <div className="text-xs text-muted uppercase tracking-wide mb-1">Reach them by</div>
        <div className="text-2xl font-bold tracking-tight mb-1">{CHANNEL_LABEL[channel]}</div>
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

        {pastedOutcome ? (
          <div className="space-y-2.5">
            <p className="text-sm font-medium">Paste their message to get coaching later</p>
            <textarea
              className="w-full border border-rule rounded-lg px-3 py-2 bg-bg min-h-[100px]"
              value={pastedMessage}
              onChange={(e) => setPastedMessage(e.target.value)}
              placeholder="Optional — paste what they said"
            />
            <div className="flex gap-2">
              <Btn variant="primary" disabled={busy} onClick={() => handleOutcome(pastedOutcome, pastedMessage)}>
                {busy ? "Saving…" : "Log outcome"}
              </Btn>
              <Btn variant="ghost" onClick={() => setPastedOutcome(null)} disabled={busy}>
                Cancel
              </Btn>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {outcomes.map((o) => (
              <Btn key={o.outcome} variant={o.variant} disabled={busy} onClick={() => handleOutcome(o.outcome)}>
                {o.label} <span className="text-muted ml-1">({o.key})</span>
              </Btn>
            ))}
            <Btn variant="ghost" onClick={skip} disabled={busy}>
              Skip for now (S)
            </Btn>
          </div>
        )}

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
    </div>
  );
}
