"use client";

import { useEffect, useMemo, useState } from "react";
import { splitEmailDraft } from "@/server/cadence";
import { buildCallCard, focusSessionStacks, normalizeCallerNote, websiteLabel, whoLine, whyThisLead } from "@/lib/focusCallCard";
import { resolveFocusOpener } from "@/lib/focusScripts";
import { linkedinOpenUrl, mailtoUrl } from "@/lib/outreachLinks";
import { OUTCOME_FOLLOW_UP, outcomeLabels, pipelineMailtoHref, pipelineTimeChip, TITAN_FROM } from "@/lib/pipelineToday";
import { leadLocalTimeStatus } from "@/server/leadTimezone";
import {
  actionHeader,
  actionKicker,
  actionOutcomeMode,
  actionShowsBlankMessage,
  contactFormUrl,
  shapeHeadline,
  shapeIntel,
  type TodayAction,
} from "@/lib/todayCards";
import type { ShapeCard } from "@/lib/shapeCard";
import { SkipReasonSheet, type SkipDetail } from "@/components/SkipReasonSheet";
import type { TouchOutcome } from "@prisma/client";
import type { ScriptRating } from "@/lib/focusScripts";

type Row = { action: TodayAction; card: ShapeCard };

const CALL_OUTCOMES: { outcome: TouchOutcome; label: string; key: string; variant: "default" | "go" | "stop" }[] = [
  { outcome: "no_answer", label: "No answer", key: "1", variant: "default" },
  { outcome: "voicemail", label: "Voicemail", key: "2", variant: "default" },
  { outcome: "not_fit", label: "Not interested", key: "3", variant: "stop" },
  { outcome: "talked_not_now", label: "Follow-up", key: "4", variant: "default" },
  { outcome: "interested", label: "Interested", key: "5", variant: "go" },
  { outcome: "meeting_booked", label: "Meeting booked", key: "6", variant: "go" },
  { outcome: "wrong_number", label: "Wrong number", key: "7", variant: "stop" },
];

const RATINGS: { rating: ScriptRating; label: string }[] = [
  { rating: "helpful", label: "Helpful" },
  { rating: "meh", label: "Meh" },
  { rating: "bad", label: "Bad" },
];

export function ShapeASession({
  rows,
  me,
  repTimezone,
  clock,
  touchesLogged,
  sessionTotal,
  secondsLeft,
  sessionLengthSeconds,
  conversations,
  businessHoursOnly,
  onToggleHours,
  showHours,
  error,
  pendingRating,
  onRate,
  onDismissRating,
  onEnd,
  onOpenCoach,
  onDone,
  onSkip,
  onFollowUp,
  onCallOutcome,
  onLogReply,
}: {
  rows: Row[];
  me: string;
  repTimezone: string;
  clock: string;
  touchesLogged: number;
  sessionTotal: number;
  secondsLeft: number;
  sessionLengthSeconds: number | null;
  conversations: number;
  businessHoursOnly: boolean;
  onToggleHours: (value: boolean) => void;
  showHours: boolean;
  error: string | null;
  pendingRating: { touchId: string; businessName: string } | null;
  onRate: (rating: ScriptRating) => void;
  onDismissRating: () => void;
  onEnd: () => void;
  onOpenCoach: () => void;
  onDone: (row: Row, script?: { variant: "a" | "b"; scriptId: string }) => void;
  onSkip: (row: Row, detail: SkipDetail) => void;
  onFollowUp: (row: Row) => void;
  onCallOutcome: (row: Row, outcome: TouchOutcome, note: string | null, script: { variant: "a" | "b"; scriptId: string }) => void;
  onLogReply: (row: Row) => void;
}) {
  const current = rows[0];
  const [copied, setCopied] = useState(false);
  const [callNote, setCallNote] = useState("");
  const [askingSkip, setAskingSkip] = useState(false);
  const stack = focusSessionStacks();

  useEffect(() => {
    setCopied(false);
    setCallNote("");
    setAskingSkip(false);
  }, [current?.action.key]);

  const emailParts = useMemo(() => {
    if (!current || current.card.pipeline || current.action.kind !== "send_email") return null;
    const opener = resolveFocusOpener({
      channel: "email",
      leadId: current.card.lead.id,
      productName: current.card.campaign.productName,
      strategy: current.card.campaign.strategy,
      values: {
        name: current.card.lead.contactName?.trim().split(/\s+/)[0] || "there",
        biz: current.card.lead.businessName,
        city: current.card.lead.city || "",
        me,
        product: current.card.campaign.productName,
        role: current.card.lead.contactRole ?? undefined,
      },
    });
    const parts = splitEmailDraft(opener.text);
    return {
      subject: parts.subject || `Quick note about ${current.card.lead.businessName}`,
      body: parts.body || opener.text,
      variant: opener.variant,
      scriptId: opener.scriptId,
    };
  }, [current, me]);

  const pipeline = current?.card.pipeline ?? null;
  const reply = current?.action.replyId
    ? current.card.openReplies.find((item) => item.id === current.action.replyId) ?? null
    : null;
  const draftText = pipeline
    ? pipeline.blankMessage
      ? ""
      : pipeline.message.trim()
    : current?.action.kind === "reply"
      ? reply?.responseDraft?.trim() || ""
      : current?.action.kind === "send_email"
        ? emailParts?.body || ""
        : current?.action.kind === "instagram" || current?.action.kind === "contact_form"
          ? emailParts?.body || ""
          : "";
  const outcomeMode = current
    ? pipeline?.outcomeMode ?? (actionOutcomeMode(current.action.kind) === "call" ? "call" : actionOutcomeMode(current.action.kind))
    : "done_skip";
  const warmLabels = outcomeMode === "call" ? [] : outcomeLabels(outcomeMode);
  const showFollowUp = warmLabels.includes(OUTCOME_FOLLOW_UP);
  const showSkip = true;

  function copy() {
    const text = draftText;
    if (!text || (current && actionShowsBlankMessage(current.action.kind))) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || askingSkip) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (showSkip && e.key.toLowerCase() === "s") setAskingSkip(true);
      if (e.key.toLowerCase() === "c") copy();
      if (showFollowUp && e.key === "2") onFollowUp(current);
      if (actionOutcomeMode(current.action.kind) === "call") {
        const match = CALL_OUTCOMES.find((item) => item.key === e.key);
        if (match) {
          const card = buildCallCard({
            leadId: current.card.lead.id,
            contactName: current.card.lead.contactName,
            contactRole: current.card.lead.contactRole,
            businessName: current.card.lead.businessName,
            city: current.card.lead.city,
            website: current.card.lead.website,
            fitReasons: current.card.lead.fitReasons,
            productName: current.card.campaign.productName,
            me,
            strategy: current.card.campaign.strategy,
            lastTouch: null,
          });
          onCallOutcome(current, match.outcome, normalizeCallerNote(callNote), { variant: card.variant, scriptId: card.scriptId });
        }
        return;
      }
      if (e.key === "1") onDone(current, emailParts ? { variant: emailParts.variant, scriptId: emailParts.scriptId } : undefined);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, callNote, emailParts, me, showFollowUp, showSkip, onFollowUp, askingSkip]);

  const mins = sessionLengthSeconds === null ? null : Math.floor(secondsLeft / 60);
  const secs = sessionLengthSeconds === null ? null : String(secondsLeft % 60).padStart(2, "0");
  const header = current
    ? current.card.pipeline
      ? pipelineTimeChip(current.card.pipeline.kind, current.card.pipeline.timeLabel, current.card.pipeline.actionLabel)
      : actionHeader(current.action.kind, current.card.lead.businessName, clock)
    : "Today";

  const topBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 bg-panel/90 backdrop-blur-sm border-b border-rule shrink-0">
      <span className="text-sm font-semibold">{header}</span>
      <div className="flex items-center gap-3 md:gap-4 flex-wrap">
        {mins !== null && <span className="text-xs tabular-nums text-dim bg-panel2 px-2 py-1 rounded-md">{mins}:{secs}</span>}
        {showHours && (
          <label className="hidden sm:flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={businessHoursOnly} onChange={(e) => onToggleHours(e.target.checked)} className="accent-[var(--accent)]" />
            <span className="text-xs text-dim">Their hours only</span>
          </label>
        )}
        <button type="button" onClick={onOpenCoach} className="text-xs font-medium text-accent hover:underline">
          Tell Flow
        </button>
        <span className="text-sm">
          <span className="font-bold text-ink tabular-nums text-base">{touchesLogged}</span>
          <span className="text-dim"> / {sessionTotal}</span>
        </span>
        {conversations > 0 && <span className="text-sm text-accent font-semibold tabular-nums">{conversations} good</span>}
        <button type="button" onClick={onEnd} className="text-xs text-dim hover:text-ink px-2 py-1.5">
          End
        </button>
      </div>
    </div>
  );

  const ratingBar = pendingRating ? (
    <div className="px-4 md:px-6 py-2.5 border-b border-rule bg-panel2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">Opener for {pendingRating.businessName}?</span>
      {RATINGS.map((item) => (
        <button key={item.rating} type="button" onClick={() => onRate(item.rating)} className="text-xs font-medium border border-rule rounded-lg px-2.5 py-1 bg-panel hover:border-accent/40 hover:text-accent">
          {item.label}
        </button>
      ))}
      <button type="button" onClick={onDismissRating} className="text-xs text-dim hover:text-ink px-2 py-1">
        Skip
      </button>
    </div>
  ) : null;

  if (!current) {
    return (
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        {topBar}
        {ratingBar}
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted text-center max-w-sm">Queue&apos;s empty. Nice work.</p>
        </div>
      </div>
    );
  }

  const lead = current.card.lead;
  const kind = current.action.kind;
  const askFor = lead.contactName?.trim().split(/\s+/)[0] || lead.contactRole?.trim() || "the owner";
  const cadencePurpose = current.card.campaign.strategy.cadence?.[lead.cadenceStep]?.purpose ?? null;
  const intel = pipeline
    ? pipeline.intel
    : shapeIntel({
        contactRole: lead.contactRole,
        city: lead.city,
        region: lead.region,
        fitReasons: lead.fitReasons,
        summary: current.card.campaign.strategy.summary,
        icpBusiness: current.card.campaign.strategy.icp?.business,
        cadencePurpose,
      });
  const formUrl = pipeline
    ? pipeline.linkKind === "contact_form"
      ? pipeline.linkUrl
      : null
    : contactFormUrl(lead.signals);
  const mailtoHref = pipeline
    ? pipelineMailtoHref(pipeline)
    : kind === "send_email" && lead.email && emailParts
      ? mailtoUrl(lead.email, emailParts.subject, emailParts.body)
      : kind === "reply" && current.action.channel === "email" && lead.email && reply?.responseDraft
        ? mailtoUrl(lead.email, `Re: ${lead.businessName}`, reply.responseDraft)
        : null;
  const wantsLinkedIn =
    kind === "linkedin_request" ||
    (kind === "follow_up" && pipeline?.linkKind === "linkedin_profile") ||
    (kind === "reply" && (pipeline ? pipeline.linkKind === "linkedin_profile" : current.action.channel === "linkedin"));
  const linkedinHref = wantsLinkedIn ? pipeline?.linkUrl || linkedinOpenUrl(lead) : null;
  const callModel =
    kind === "call"
      ? buildCallCard({
          leadId: lead.id,
          contactName: lead.contactName,
          contactRole: lead.contactRole,
          businessName: lead.businessName,
          city: lead.city,
          website: lead.website,
          fitReasons: lead.fitReasons,
          productName: current.card.campaign.productName,
          me,
          strategy: current.card.campaign.strategy,
          lastTouch: null,
        })
      : null;
  const localTime = kind === "call" ? leadLocalTimeStatus(lead, repTimezone) : null;
  const callSite = callModel?.websiteHref ?? null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" data-kind={kind}>
      {topBar}
      {ratingBar}
      <div className={stack.card === "scroll" ? "flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-6" : "px-4 md:px-6 py-6"}>
        <div className="max-w-xl mx-auto space-y-5">
          <div>
            <p className="section-label mb-2">{actionKicker(kind, pipeline?.actionLabel)}</p>
            <p className="text-sm text-muted m-0">Ask for {askFor}</p>
            <h2 className="text-2xl font-bold tracking-tight leading-tight m-0 mt-1">{shapeHeadline(lead.contactName, lead.businessName)}</h2>
          </div>

          {kind !== "call" && (
            <div className="bg-panel2 border border-rule rounded-xl px-4 py-3">
              <p className="section-label mb-1">Why this lead</p>
              <p className="text-sm text-ink m-0 leading-relaxed">{intel}</p>
            </div>
          )}

          {kind === "linkedin_request" && <p className="text-sm text-muted m-0">Connect with no note. Message stays blank.</p>}
          {kind === "reply" && <p className="text-sm text-muted m-0">Not a connection request — paste / send the DM.</p>}

          {kind === "call" && callModel && (
            <div className="bg-panel2 border border-rule rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-sm font-medium m-0">{whoLine(lead.contactName, lead.contactRole)}</p>
              <p className="text-sm text-muted m-0 leading-relaxed">
                {whyThisLead({
                  fitReasons: lead.fitReasons,
                  summary: current.card.campaign.strategy.summary,
                  icpBusiness: current.card.campaign.strategy.icp?.business,
                })}
              </p>
              {callSite && (
                <a href={callSite} target="_blank" rel="noreferrer" className="text-sm text-accent underline underline-offset-2">
                  {websiteLabel(callSite)}
                </a>
              )}
              {lead.lastTouchLabel && <p className="text-xs text-dim m-0">{lead.lastTouchLabel}</p>}
            </div>
          )}

          {localTime && (
            <p className={"text-xs font-medium m-0 " + (localTime.inBusinessHours ? "text-accent" : "text-warm")}>
              {localTime.label}
              {localTime.isApproximate ? " · estimated" : ""} · {localTime.inBusinessHours ? "open now" : "likely closed"}
            </p>
          )}

          {kind === "call" &&
            (lead.phone ? (
              <a href={`tel:${lead.phone}`} className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover">
                Call {lead.phone}
              </a>
            ) : (
              <p className="text-sm text-stop m-0">No phone on file.</p>
            ))}

          {kind !== "call" && kind !== "linkedin_request" && (
            <div className="flex flex-wrap items-center gap-2">
              {draftText && (
                <button type="button" onClick={copy} className="inline-flex items-center justify-center border border-rule bg-panel font-semibold px-5 py-3 rounded-xl text-[15px] hover:border-accent/40">
                  {copied ? "Copied" : pipeline ? "Copy" : "Copy draft"}
                </button>
              )}
              {mailtoHref && (
                <a href={mailtoHref} className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover">
                  Open in Titan
                </a>
              )}
              {linkedinHref && (
                <a href={linkedinHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover">
                  Open LinkedIn
                </a>
              )}
              {(kind === "contact_form" || pipeline?.linkKind === "contact_form") && formUrl && (
                <a href={formUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover">
                  Open form
                </a>
              )}
              {kind === "instagram" && lead.instagramUrl && (
                <a href={lead.instagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover">
                  Open Instagram
                </a>
              )}
            </div>
          )}

          {kind === "linkedin_request" && linkedinHref && (
            <a href={linkedinHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover">
              Open LinkedIn
            </a>
          )}

          {(kind === "send_email" || kind === "contact_form" || (pipeline && pipeline.linkKind === "mailto")) && (
            <p className="text-xs text-dim m-0">
              {pipeline ? `From Titan · ${TITAN_FROM}. ` : ""}
              You send it yourself. Nothing goes out from here.
            </p>
          )}

          {kind === "linkedin_request" && (
            <div className="bg-panel2 border border-rule rounded-2xl px-5 py-4">
              <p className="section-label mb-2 text-dim">Message</p>
              <p className="text-sm text-muted m-0">(blank — connection request only)</p>
            </div>
          )}

          {pipeline && kind !== "linkedin_request" && (
            <div className="bg-cold-soft border border-accent/15 rounded-2xl px-5 py-4 space-y-2">
              <p className="section-label mb-0 text-accent">Message</p>
              {pipeline.mailtoSubject && <p className="text-sm font-semibold m-0">{pipeline.mailtoSubject}</p>}
              <p className="text-base leading-relaxed m-0 whitespace-pre-wrap">{pipeline.message.trim() || "No message on this row."}</p>
            </div>
          )}

          {!pipeline && kind === "send_email" && emailParts && (
            <div className="bg-cold-soft border border-accent/15 rounded-2xl px-5 py-4 space-y-2">
              <p className="section-label mb-0 text-accent">Opener</p>
              {emailParts.subject && <p className="text-sm font-semibold m-0">{emailParts.subject.replace(/^Subject:\s*/i, "")}</p>}
              <p className="text-base leading-relaxed m-0 whitespace-pre-wrap">{emailParts.body}</p>
            </div>
          )}

          {!pipeline && kind === "reply" && (
            <div className="bg-cold-soft border border-accent/15 rounded-2xl px-5 py-4 space-y-2">
              <p className="section-label mb-0 text-accent">Message</p>
              <p className="text-base leading-relaxed m-0 whitespace-pre-wrap">{reply?.responseDraft?.trim() || "No draft stored. Paste your own in LinkedIn. Nothing is sent from here."}</p>
            </div>
          )}

          {kind === "call" && callModel && (
            <div className="bg-panel2 border border-accent/25 rounded-2xl px-5 py-4 space-y-2">
              <p className="section-label mb-0 text-accent">{callModel.scriptLabel}</p>
              <p className="text-lg md:text-xl font-medium leading-snug m-0 whitespace-pre-wrap">{callModel.opener}</p>
            </div>
          )}

          {kind === "call" &&
            callModel &&
            callModel.objections.length > 0 && (
              <div className="space-y-2">
                <p className="section-label mb-0">If they push back</p>
                {callModel.objections.map((item) => (
                  <div key={item.question} className="bg-panel2 border border-rule rounded-xl px-3 py-2.5">
                    <p className="text-sm font-medium m-0">{item.question}</p>
                    <p className="text-sm text-muted mt-1 mb-0 leading-relaxed">{item.answer}</p>
                  </div>
                ))}
              </div>
            )}

          {error && <p className="text-sm text-stop m-0">{error}</p>}
        </div>
      </div>

      <div className="shrink-0 bg-panel/95 backdrop-blur-sm border-t border-rule px-4 md:px-6 py-3">
        <div className="max-w-xl mx-auto space-y-2">
          {kind === "call" && (
            <input
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              placeholder="What they said (optional)"
              maxLength={500}
              className="w-full border border-rule rounded-xl px-3 py-2 bg-bg text-sm"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted mr-1">How did it go?</span>
            {kind === "call" && callModel ? (
              CALL_OUTCOMES.map((item) => (
                <button
                  type="button"
                  key={item.outcome}
                  onClick={() => onCallOutcome(current, item.outcome, normalizeCallerNote(callNote), { variant: callModel.variant, scriptId: callModel.scriptId })}
                  className={
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium " +
                    (item.variant === "go"
                      ? "bg-accent-soft border-accent/40 text-accent"
                      : item.variant === "stop"
                        ? "bg-stop-soft border-stop/30 text-stop"
                        : "bg-panel2 border-rule text-muted hover:text-ink")
                  }
                >
                  <span>{item.label}</span>
                  <span className="font-mono text-[10px] opacity-40">{item.key}</span>
                </button>
              ))
            ) : (
              <button
                type="button"
                onClick={() => onDone(current, emailParts ? { variant: emailParts.variant, scriptId: emailParts.scriptId } : undefined)}
                className="bg-accent text-on-accent font-semibold px-4 py-2 rounded-xl text-sm"
              >
                Done
              </button>
            )}
            {showFollowUp && kind !== "call" && (
              <button type="button" onClick={() => onFollowUp(current)} className="border border-rule bg-panel font-semibold px-4 py-2 rounded-xl text-sm">
                Needs follow-up
              </button>
            )}
            {showSkip && (
              <button type="button" onClick={() => setAskingSkip(true)} className="border border-rule bg-panel font-semibold px-4 py-2 rounded-xl text-sm">
                Skip
              </button>
            )}
            <button type="button" onClick={() => onLogReply(current)} className="border border-rule bg-panel font-semibold px-4 py-2 rounded-xl text-sm">
              Log reply
            </button>
          </div>
        </div>
      </div>
      {askingSkip && current && (
        <SkipReasonSheet
          onCancel={() => setAskingSkip(false)}
          onConfirm={(detail) => {
            setAskingSkip(false);
            onSkip(current, detail);
          }}
        />
      )}
    </div>
  );
}
