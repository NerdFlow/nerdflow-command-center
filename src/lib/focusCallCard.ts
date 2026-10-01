import {
  hasTemplateHole,
  resolveFocusObjections,
  resolveFocusOpener,
  type FocusTemplateValues,
  type ScriptStrategy,
} from "@/lib/focusScripts";

/** Card copy scrolls. Outcomes are a footer in normal flow, so they cannot cover the script. */
export function focusSessionStacks(): { card: "scroll"; outcomes: "footer" } {
  return { card: "scroll", outcomes: "footer" };
}

export function whoLine(contactName: string | null | undefined, role: string | null | undefined): string {
  const name = contactName?.trim() ?? "";
  const roleText = role?.trim() ?? "";
  if (name && roleText) return `${name} · ${roleText}`;
  if (name) return name;
  if (roleText) return roleText;
  return "Ask for the owner";
}

export function whyThisLead(input: { fitReasons: string[]; summary?: string | null; icpBusiness?: string | null }): string {
  const reasons = input.fitReasons.map((reason) => reason.trim()).filter(Boolean);
  if (reasons.length > 0) return reasons.slice(0, 2).join(" ");
  const summary = input.summary?.trim();
  if (summary) {
    const sentence = summary.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (sentence) return sentence;
  }
  const icp = input.icpBusiness?.trim();
  if (icp) return icp;
  return "In this campaign's queue.";
}

export function websiteHref(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function websiteLabel(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

const OUTCOME_LABEL: Record<string, string> = {
  sent: "Sent",
  no_answer: "No answer",
  talked_not_now: "Follow-up",
  replied: "Replied",
  interested: "Interested",
  meeting_booked: "Meeting booked",
  not_fit: "Not interested",
  voicemail: "Voicemail",
  wrong_number: "Wrong number",
};

export function formatLastTouch(
  touch: { channel: string; outcome: string; occurredAt: Date } | null,
  now = new Date(),
): string | null {
  if (!touch) return null;
  const days = Math.floor((now.getTime() - touch.occurredAt.getTime()) / 86_400_000);
  const when = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  const channel = touch.channel === "call" ? "Call" : touch.channel === "email" ? "Email" : touch.channel;
  const outcome = OUTCOME_LABEL[touch.outcome] ?? touch.outcome;
  return `Last touch: ${channel} · ${outcome} · ${when}`;
}

export function normalizeCallerNote(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? "";
  if (!text) return null;
  return text.slice(0, 500);
}

export type CallCardModel = {
  who: string;
  why: string;
  websiteHref: string | null;
  websiteLabel: string | null;
  lastTouch: string | null;
  scriptLabel: "Script A" | "Script B";
  opener: string;
  objections: { question: string; answer: string }[];
  scriptId: string;
  variant: "a" | "b";
};

export function buildCallCard(input: {
  leadId: string;
  contactName: string | null;
  contactRole: string | null;
  businessName: string;
  city: string | null;
  website: string | null;
  fitReasons: string[];
  productName: string;
  me: string;
  strategy: ScriptStrategy;
  lastTouch: { channel: string; outcome: string; occurredAt: Date } | null;
  now?: Date;
}): CallCardModel {
  const values: FocusTemplateValues = {
    name: input.contactName?.trim() ?? "",
    biz: input.businessName,
    city: input.city?.trim() ?? "",
    me: input.me,
    product: input.productName,
    role: input.contactRole?.trim() || undefined,
  };
  const opener = resolveFocusOpener({
    channel: "call",
    leadId: input.leadId,
    productName: input.productName,
    strategy: input.strategy,
    values,
  });
  const objections = resolveFocusObjections(input.strategy, input.productName, values);
  const href = websiteHref(input.website);
  return {
    who: whoLine(input.contactName, input.contactRole),
    why: whyThisLead({
      fitReasons: input.fitReasons,
      summary: input.strategy.summary,
      icpBusiness: input.strategy.icp?.business,
    }),
    websiteHref: href,
    websiteLabel: href ? websiteLabel(href) : null,
    lastTouch: formatLastTouch(input.lastTouch, input.now),
    scriptLabel: opener.variant === "a" ? "Script A" : "Script B",
    opener: opener.text,
    objections,
    scriptId: opener.scriptId,
    variant: opener.variant,
  };
}

export function callCardHasHoles(card: Pick<CallCardModel, "opener" | "objections">): boolean {
  if (hasTemplateHole(card.opener)) return true;
  return card.objections.some((item) => hasTemplateHole(item.question) || hasTemplateHole(item.answer));
}

export type PendingOutcome = {
  leadId: string;
  outcome: string;
  callerNote: string | null;
};

/** Ignore a second tap on the same lead. A different lead can start immediately. */
export function startOptimisticOutcome(inFlight: Set<string>, leadId: string): boolean {
  if (inFlight.has(leadId)) return false;
  inFlight.add(leadId);
  return true;
}

export function dropCard<T extends { lead: { id: string } }>(cards: T[], leadId: string): T[] {
  return cards.filter((card) => card.lead.id !== leadId);
}

export function restoreCard<T extends { lead: { id: string } }>(cards: T[], card: T): T[] {
  if (cards.some((item) => item.lead.id === card.lead.id)) return cards;
  return [card, ...cards];
}

export function recordPending(pending: PendingOutcome[], item: PendingOutcome): PendingOutcome[] {
  return [...pending, item];
}

export function finishPending(pending: PendingOutcome[], leadId: string): PendingOutcome[] {
  return pending.filter((item) => item.leadId !== leadId);
}
