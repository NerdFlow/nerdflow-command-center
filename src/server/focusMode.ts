import type { Channel } from "@prisma/client";
import { splitEmailDraft } from "@/server/cadence";
import {
  getCallScripts,
  getEmailScripts,
  renderMessage,
  renderScriptTemplate,
  type CampaignStrategy,
} from "@/server/playbook";

/** Focus V1 modes. Call is phone-first and does not use cadence-resolved channel. */
export const FOCUS_MODES = ["call", "email", "linkedin"] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];

export function isFocusMode(value: string | null | undefined): value is FocusMode {
  return value === "call" || value === "email" || value === "linkedin";
}

export function hasCallablePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return phone.replace(/\D/g, "").length >= 7;
}

export function hasReachableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function hasLinkedIn(url: string | null | undefined): boolean {
  return Boolean(url && url.trim().length > 0);
}

/**
 * Who belongs in a Focus mode.
 * Call: any queued lead with a phone, even when the current cadence step is email.
 * Email / LinkedIn: a reachable address or profile. Cadence channel is not a gate.
 */
export function leadEligibleForFocusMode(
  lead: { phone: string | null; email: string | null; linkedinUrl: string | null },
  mode: FocusMode,
): boolean {
  if (mode === "call") return hasCallablePhone(lead.phone);
  if (mode === "email") return hasReachableEmail(lead.email);
  return hasLinkedIn(lead.linkedinUrl);
}

export function countFocusModes<T extends { phone: string | null; email: string | null; linkedinUrl: string | null }>(
  leads: T[],
  allowed: readonly string[],
): Record<FocusMode, number> {
  const counts: Record<FocusMode, number> = { call: 0, email: 0, linkedin: 0 };
  for (const lead of leads) {
    for (const mode of FOCUS_MODES) {
      if (!allowed.includes(mode)) continue;
      if (leadEligibleForFocusMode(lead, mode)) counts[mode] += 1;
    }
  }
  return counts;
}

export type ScriptVariant = "a" | "b";

/** Stable A/B assignment. The rep does not pick. Same lead + channel stays on the same variant. */
export function assignScriptVariant(leadId: string, channel: "call" | "email"): ScriptVariant {
  let hash = 2166136261;
  const seed = `${leadId}:${channel}`;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? "a" : "b";
}

export function scriptIdFor(channel: Channel, variant: string): string {
  return `${channel}:${variant}`;
}

/** Interested, or another positive outcome, for the weekly per-100 comparison. */
export const POSITIVE_TOUCH_OUTCOMES = ["interested", "meeting_booked", "replied"] as const;

export function isPositiveOutcome(outcome: string): boolean {
  return (POSITIVE_TOUCH_OUTCOMES as readonly string[]).includes(outcome);
}

/** Interested (or other positive outcomes) per 100 touches. Null when there are no touches. */
export function perHundred(positive: number, touches: number): number | null {
  if (touches <= 0) return null;
  return Math.round((positive / touches) * 100);
}

export function variantFromScriptId(scriptId: string | null | undefined, scriptUsed: string | null | undefined): ScriptVariant | null {
  if (scriptId?.endsWith(":a") || scriptId === "a" || scriptUsed === "a") return "a";
  if (scriptId?.endsWith(":b") || scriptId === "b" || scriptUsed === "b") return "b";
  return null;
}

export type FocusOpener = {
  scriptId: string;
  variant: ScriptVariant | "template";
  /** Full text to copy. Emails keep the Subject line. */
  text: string;
  subject: string;
  body: string;
};

type PlaceholderValues = { name: string; biz: string; city: string; me: string; product: string };

function pickFilledVariant(
  preferred: ScriptVariant,
  a: string,
  b: string,
): { variant: ScriptVariant; text: string } | null {
  const aText = a.trim();
  const bText = b.trim();
  if (preferred === "a" && aText) return { variant: "a", text: aText };
  if (preferred === "b" && bText) return { variant: "b", text: bText };
  if (aText) return { variant: "a", text: aText };
  if (bText) return { variant: "b", text: bText };
  return null;
}

/**
 * The one opener Focus shows. Call and email use the system-assigned A/B field.
 * LinkedIn uses the playbook message. Nothing here sends.
 */
export function resolveFocusOpener(params: {
  leadId: string;
  channel: Channel;
  strategy: CampaignStrategy;
  cadenceStep: number;
  values: PlaceholderValues;
}): FocusOpener {
  if (params.channel === "call" || params.channel === "email") {
    const preferred = assignScriptVariant(params.leadId, params.channel);
    const pair = params.channel === "call" ? getCallScripts(params.strategy) : getEmailScripts(params.strategy);
    const rendered: [string, string] = [
      pair[0] ? renderScriptTemplate(pair[0], params.values) : "",
      pair[1] ? renderScriptTemplate(pair[1], params.values) : "",
    ];
    const picked = pickFilledVariant(preferred, rendered[0], rendered[1]);
    if (picked) {
      const parts = params.channel === "email" ? splitEmailDraft(picked.text) : { subject: "", body: picked.text };
      const body = params.channel === "email" ? parts.body || picked.text : picked.text;
      return {
        scriptId: scriptIdFor(params.channel, picked.variant),
        variant: picked.variant,
        text: params.channel === "email" ? (parts.subject ? picked.text : body) : body,
        subject: parts.subject,
        body,
      };
    }
  }

  const messageVariant = params.cadenceStep > 0 ? "follow" : "first";
  const fallback = renderMessage(params.strategy, params.channel, messageVariant, params.values);
  const parts = params.channel === "email" ? splitEmailDraft(fallback) : { subject: "", body: fallback };
  const body = params.channel === "email" ? parts.body || fallback : fallback;
  return {
    scriptId: scriptIdFor(params.channel, messageVariant),
    variant: "template",
    text: fallback,
    subject: parts.subject,
    body,
  };
}

/** Opens the prospect's LinkedIn profile, or messaging if we only have a handle. Never sends. */
export function linkedInOpenUrl(url: string | null | undefined): string {
  const raw = url?.trim() ?? "";
  if (!raw) return "https://www.linkedin.com/messaging/";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("linkedin.com") || raw.startsWith("www.linkedin.com")) return `https://${raw}`;
  return `https://www.linkedin.com/in/${encodeURIComponent(raw.replace(/^@/, ""))}`;
}
