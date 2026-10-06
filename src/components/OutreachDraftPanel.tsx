"use client";

import { signatureForMailbox, type MailboxSignatureMap } from "@/lib/mailboxSignature";
import {
  emailStepFor,
  MAX_REGENERATIONS,
  runPreSendChecklist,
  type ChecklistCatalog,
  type ChecklistResult,
} from "@/lib/outreachChecklist";

export const FALLBACK_DRAFT_NOTICE =
  "Fallback draft. The model didn't return one, so this template does not count toward today's cap.";

export function reviewOutreachCopy(input: {
  channel: "email" | "linkedin";
  kind: string;
  cadenceStep: number;
  subject: string;
  body: string;
  companyName: string;
  openerSourceUrl: string | null;
  dnc: boolean;
  catalog: ChecklistCatalog;
  signatures: MailboxSignatureMap;
  mailbox: string;
  postalAddress: string | null;
  optOutLine: string | null;
}): ChecklistResult {
  const signature = signatureForMailbox(input.signatures, input.mailbox);
  return runPreSendChecklist({
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    companyName: input.companyName,
    openerSourceUrl: input.openerSourceUrl,
    emailStep: emailStepFor(input.kind, input.cadenceStep),
    subjectRequired: input.channel === "email",
    dnc: input.dnc,
    catalog: input.catalog,
    settings: {
      mailboxOwnerName: signature?.name || null,
      signatureText: signature?.signature || null,
      postalAddress: input.postalAddress,
      optOutLine: input.optOutLine,
    },
  });
}

export function OutreachDraftPanel({
  channel,
  subject,
  body,
  openerSourceUrl,
  review,
  saved,
  regenerateCount,
  source,
  killSwitch,
  capReached,
  busy,
  onSubject,
  onBody,
  onOpener,
  onGenerate,
  onRegenerate,
}: {
  channel: "email" | "linkedin";
  subject: string;
  body: string;
  openerSourceUrl: string;
  review: ChecklistResult;
  saved: boolean;
  regenerateCount: number;
  source: string | null;
  killSwitch: boolean;
  capReached: boolean;
  busy: boolean;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
  onOpener: (value: string) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  const blockedReason = killSwitch
    ? "Draft generation is switched off."
    : capReached
      ? "Daily draft cap reached."
      : null;
  const regenerationsLeft = Math.max(0, MAX_REGENERATIONS - regenerateCount);

  return (
    <div className="space-y-3">
      {source === "fallback" && <p className="text-sm text-muted m-0">{FALLBACK_DRAFT_NOTICE}</p>}
      {review.blocks.length > 0 && (
        <div className="bg-stop-soft border border-stop/30 rounded-xl px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-stop m-0">Fix before sending</p>
          {review.blocks.map((issue) => (
            <p key={`${issue.code}-${issue.reason}`} className="text-sm text-stop m-0">
              {issue.reason}
            </p>
          ))}
        </div>
      )}
      {review.warnings.length > 0 && (
        <div className="space-y-1">
          {review.warnings.map((issue) => (
            <p key={`${issue.code}-${issue.reason}`} className="text-xs text-muted m-0">
              {issue.reason}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!saved ? (
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy || Boolean(blockedReason)}
            className="inline-flex items-center justify-center border border-rule bg-panel font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-40"
          >
            {busy ? "Writing…" : "Generate draft"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy || Boolean(blockedReason) || regenerationsLeft === 0}
            className="inline-flex items-center justify-center border border-rule bg-panel font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-40"
          >
            {busy ? "Writing…" : `Regenerate (${regenerationsLeft} left)`}
          </button>
        )}
        {saved && <span className="text-xs text-muted">Draft saved. Opening this card again will not write a new one.</span>}
      </div>
      {blockedReason && <p className="text-xs text-stop m-0">{blockedReason}</p>}
      <label className="block text-sm">
        Opener source URL
        <input
          value={openerSourceUrl}
          onChange={(event) => onOpener(event.target.value)}
          placeholder="https://…"
          className="w-full border border-rule rounded-xl px-3 py-2 bg-bg mt-1 text-sm"
        />
      </label>
      {channel === "email" && (
        <label className="block text-sm">
          Subject
          <input value={subject} onChange={(event) => onSubject(event.target.value)} className="w-full border border-rule rounded-xl px-3 py-2 bg-bg mt-1 text-sm" />
        </label>
      )}
      <label className="block text-sm">
        Message
        <textarea value={body} onChange={(event) => onBody(event.target.value)} rows={8} className="w-full border border-rule rounded-xl px-3 py-2 bg-bg mt-1 text-sm leading-relaxed" />
      </label>
    </div>
  );
}
