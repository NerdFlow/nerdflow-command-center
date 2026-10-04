import { resolveLeadChannel } from "@/server/cadence";
import { whyThisLead } from "@/lib/focusCallCard";
import { pktDateStamp, type PipelineCardView, type PipelineLinkKind, type PipelineOutcomeMode } from "@/lib/pipelineToday";
import type { CampaignStrategy } from "@/server/strategy";
import type { Channel } from "@prisma/client";
import { leadHasPhone } from "@/lib/focusQueue";

/**
 * One Today card is one action row. The same lead can produce a LinkedIn
 * request and a Send email in sequence. Call rows stay on the Call session.
 * Pipeline Today rows add follow_up and next_action; those are not cadence steps.
 */
export type TodayActionKind =
  | "send_email"
  | "linkedin_request"
  | "reply"
  | "contact_form"
  | "call"
  | "instagram"
  | "follow_up"
  | "next_action"
  | "needs_contact";

export type TodayOutcomeMode = "call" | PipelineOutcomeMode;

export type TodayAction = {
  key: string;
  leadId: string;
  kind: TodayActionKind;
  channel: Channel;
  replyId: string | null;
  timeLabel?: string | null;
  pipelineRowId?: string | null;
  linkKind?: PipelineLinkKind | null;
  outcomeMode?: PipelineOutcomeMode | null;
};

export type TodayReplyRef = {
  id: string;
  channel: Channel;
};

export type TodayShapeLead = {
  id: string;
  phone: string | null;
  email: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  contactName: string | null;
  cadenceStep: number;
  nextChannelOverride: Channel | null;
  signals: Record<string, unknown>;
  strategy: CampaignStrategy | null | undefined;
  linkedinRequestSent: boolean;
  openReplies: TodayReplyRef[];
  /** Reply-only rows (lead left the cold queue) do not grow a new cold pair. */
  replyOnly?: boolean;
  /** False when the business-hours filter hides this call. */
  callAllowedNow: boolean;
};

const FORM_KEYS = ["contactFormUrl", "contact_form_url", "formUrl", "form_url"];

export function todayActionKey(leadId: string, kind: TodayActionKind, replyId?: string | null): string {
  return replyId ? `${leadId}:${kind}:${replyId}` : `${leadId}:${kind}`;
}

export function contactFormUrl(signals: Record<string, unknown> | null | undefined): string | null {
  if (!signals) return null;
  for (const key of FORM_KEYS) {
    const value = signals[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim();
  }
  return null;
}

export function skipKeysFromSignals(signals: Record<string, unknown> | null | undefined): string[] {
  return stringListFromSignals(signals, "shapeASkipKeys");
}

/** Cadence cards skipped as Not now. Value is the YYYY-MM-DD they return. */
export function skipUntilFromSignals(signals: Record<string, unknown> | null | undefined): Record<string, string> {
  const raw = signals?.shapeASkipUntil;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) out[key] = value;
  }
  return out;
}

export function followUpKeysFromSignals(signals: Record<string, unknown> | null | undefined): string[] {
  return stringListFromSignals(signals, "shapeAFollowUpKeys");
}

function stringListFromSignals(signals: Record<string, unknown> | null | undefined, field: string): string[] {
  const raw = signals?.[field];
  if (!Array.isArray(raw)) return [];
  return raw.filter((key): key is string => typeof key === "string" && key.length > 0);
}

function hasLinkedInProfile(url: string | null | undefined): boolean {
  const raw = url?.trim() ?? "";
  return /linkedin\.com\/in\//i.test(raw);
}

/** Cadence LinkedIn, or the cold email pair (connect, then email) on day 0. */
export function linkedinRequestReason(
  lead: Pick<TodayShapeLead, "linkedinUrl" | "contactName" | "cadenceStep" | "nextChannelOverride" | "linkedinRequestSent" | "strategy">,
): "cadence" | "cold_email_pair" | null {
  if (lead.linkedinRequestSent) return null;
  const channel = resolveLeadChannel({
    strategy: lead.strategy,
    cadenceStep: lead.cadenceStep,
    nextChannelOverride: lead.nextChannelOverride,
  });
  if (channel === "linkedin") return "cadence";
  if (channel !== "email" || lead.cadenceStep !== 0) return null;
  if (hasLinkedInProfile(lead.linkedinUrl) || lead.contactName?.trim()) return "cold_email_pair";
  return null;
}

function channelAllowed(allowed: Channel[], channel: Channel): boolean {
  return allowed.includes(channel);
}

export function expandShapeLead(lead: TodayShapeLead, allowedChannels: Channel[]): TodayAction[] {
  const actions: TodayAction[] = [];
  const push = (kind: TodayActionKind, channel: Channel, replyId?: string | null) => {
    actions.push({ key: todayActionKey(lead.id, kind, replyId), leadId: lead.id, kind, channel, replyId: replyId ?? null });
  };

  for (const reply of lead.openReplies) {
    if (reply.channel === "call") continue;
    if (!channelAllowed(allowedChannels, reply.channel) && !(reply.channel === "linkedin" && allowedChannels.includes("email"))) continue;
    push("reply", reply.channel, reply.id);
  }

  if (lead.replyOnly) {
    if (leadHasPhone(lead.phone) && lead.callAllowedNow && channelAllowed(allowedChannels, "call")) push("call", "call");
    return actions;
  }

  const cadence = resolveLeadChannel({
    strategy: lead.strategy,
    cadenceStep: lead.cadenceStep,
    nextChannelOverride: lead.nextChannelOverride,
  });

  const linkedinReason = linkedinRequestReason(lead);
  const canLinkedin =
    linkedinReason === "cadence"
      ? channelAllowed(allowedChannels, "linkedin") || channelAllowed(allowedChannels, "email")
      : linkedinReason === "cold_email_pair" &&
        (channelAllowed(allowedChannels, "linkedin") || channelAllowed(allowedChannels, "email"));
  if (linkedinReason && canLinkedin) push("linkedin_request", "linkedin");

  const emailDead = lead.signals?.emailInvalid === true;
  if (cadence === "email" && lead.email?.trim() && !emailDead && channelAllowed(allowedChannels, "email")) {
    push("send_email", "email");
  }

  const form = contactFormUrl(lead.signals);
  if (form && !emailDead && channelAllowed(allowedChannels, "email")) push("contact_form", "email");

  if (cadence === "instagram" && channelAllowed(allowedChannels, "instagram")) {
    push("instagram", "instagram");
  }

  if (leadHasPhone(lead.phone) && lead.callAllowedNow && channelAllowed(allowedChannels, "call")) {
    push("call", "call");
  }

  return actions;
}

export function actionVisible(action: TodayAction, filter: Channel | "all"): boolean {
  if (filter === "all") return true;
  if (action.kind === "needs_contact") return action.channel === filter;
  if (action.kind === "next_action") return false;
  if (action.kind === "follow_up") {
    if (filter === "email") return action.linkKind === "mailto" || action.linkKind === "contact_form";
    if (filter === "linkedin") return action.linkKind === "linkedin_profile";
    return false;
  }
  if (filter === "call") return action.kind === "call";
  if (filter === "email") {
    return action.kind === "send_email" || action.kind === "contact_form" || (action.kind === "reply" && action.channel === "email");
  }
  if (filter === "linkedin") {
    return action.kind === "linkedin_request" || (action.kind === "reply" && action.channel === "linkedin");
  }
  if (filter === "instagram") {
    return action.kind === "instagram" || (action.kind === "reply" && action.channel === "instagram");
  }
  return false;
}

/** Deferred rows stay in the queue, after the rows still to do. */
export function orderActions(actions: TodayAction[], deferredKeys: string[], pinnedKeys: string[] = []): TodayAction[] {
  const pinned = new Set(pinnedKeys);
  const deferred = new Set(deferredKeys);
  const pins = actions.filter((action) => pinned.has(action.key) && !deferred.has(action.key));
  const head = actions.filter((action) => !pinned.has(action.key) && !deferred.has(action.key));
  const tail = actions.filter((action) => deferred.has(action.key));
  return [...pins, ...head, ...tail];
}

export type PickerCounts = { all: number; email: number; linkedin: number; call: number; instagram: number };

export function pickerCounts(actions: TodayAction[]): PickerCounts {
  return {
    all: actions.filter((action) => actionVisible(action, "all")).length,
    email: actions.filter((action) => actionVisible(action, "email")).length,
    linkedin: actions.filter((action) => actionVisible(action, "linkedin")).length,
    call: actions.filter((action) => actionVisible(action, "call")).length,
    instagram: actions.filter((action) => actionVisible(action, "instagram")).length,
  };
}

/**
 * Cold email, LinkedIn request, and contact form are Done / Skip.
 * Reply and follow-up may also show Needs follow-up. Pipeline next actions
 * are Done and Needs follow-up. Call keeps Interested and the other call outcomes.
 */
export function actionOutcomeMode(kind: TodayActionKind): TodayOutcomeMode {
  if (kind === "call") return "call";
  if (kind === "reply" || kind === "follow_up") return "done_skip_followup";
  if (kind === "next_action") return "done_followup";
  return "done_skip";
}

export function actionFromPipeline(leadId: string, view: PipelineCardView): TodayAction {
  return {
    key: `pipeline:${view.rowId}`,
    leadId,
    kind: view.kind,
    channel: view.channel,
    replyId: null,
    timeLabel: view.timeLabel,
    pipelineRowId: view.rowId,
    linkKind: view.linkKind,
    outcomeMode: view.outcomeMode,
  };
}

/** One due cadence step. Replies stay. No second channel and no future step. */
function actionsForDueChannel(lead: TodayShapeLead, channel: Channel, allowedChannels: Channel[]): TodayAction[] {
  const actions: TodayAction[] = [];
  const push = (kind: TodayActionKind, actionChannel: Channel, replyId?: string | null) => {
    actions.push({ key: todayActionKey(lead.id, kind, replyId), leadId: lead.id, kind, channel: actionChannel, replyId: replyId ?? null });
  };
  for (const reply of lead.openReplies) {
    if (reply.channel === "call") continue;
    if (!channelAllowed(allowedChannels, reply.channel) && !(reply.channel === "linkedin" && allowedChannels.includes("email"))) continue;
    push("reply", reply.channel, reply.id);
  }
  if (!channelAllowed(allowedChannels, channel)) return actions;
  if (channel === "email" && lead.email?.trim() && lead.signals?.emailInvalid !== true) push("send_email", "email");
  if (channel === "linkedin") push("linkedin_request", "linkedin");
  if (channel === "call" && leadHasPhone(lead.phone) && lead.callAllowedNow) push("call", "call");
  if (channel === "instagram") push("instagram", "instagram");
  return actions;
}

/** Pipeline rows are the card. A cadence lead shows only the step that is due. */
export function projectTodayActions(input: {
  pipeline?: PipelineCardView | null;
  lead: TodayShapeLead;
  allowedChannels: Channel[];
  hideCall?: boolean;
  dueChannel?: Channel | null;
}): TodayAction[] {
  const actions = input.pipeline
    ? [actionFromPipeline(input.lead.id, input.pipeline)]
    : input.dueChannel
      ? actionsForDueChannel(input.lead, input.dueChannel, input.allowedChannels)
      : expandShapeLead(input.lead, input.allowedChannels);
  const settled = new Set(followUpKeysFromSignals(input.lead.signals));
  const skipped = new Set(skipKeysFromSignals(input.lead.signals));
  const until = skipUntilFromSignals(input.lead.signals);
  const today = pktDateStamp();
  return actions.filter((action) => {
    if (settled.has(action.key) || skipped.has(action.key)) return false;
    const back = until[action.key];
    if (back && back > today) return false;
    if (input.hideCall && action.kind === "call") return false;
    return true;
  });
}

export const SHAPE_A_DONE_SKIP_LABELS = ["Done", "Skip"] as const;

export function actionShowsBlankMessage(kind: TodayActionKind): boolean {
  return kind === "linkedin_request";
}

const ZONE_SHORT: Record<string, string> = {
  "Asia/Karachi": "PKT",
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "America/Los_Angeles": "PT",
};

export function formatQueueClock(date: Date, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  const zone =
    ZONE_SHORT[timeZone] ??
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ??
    "";
  return `${formatted} ${zone}`.trim();
}

export function actionHeader(kind: TodayActionKind, businessName: string, clock: string): string {
  if (kind === "reply") return `Reply · ${businessName}`;
  if (kind === "call") return "Calls";
  if (kind === "send_email" || kind === "contact_form") return `Emails · ${clock}`;
  if (kind === "linkedin_request") return `LinkedIn · ${clock}`;
  if (kind === "instagram") return `Instagram · ${clock}`;
  return clock;
}

export function actionKicker(kind: TodayActionKind, actionLabel?: string | null): string {
  switch (kind) {
    case "send_email":
      return "Emailing";
    case "linkedin_request":
      return "LinkedIn request";
    case "reply":
      return "Reply to them";
    case "contact_form":
      return "Contact form";
    case "instagram":
      return "Instagram DM";
    case "follow_up":
      return "Follow-up";
    case "next_action":
      return actionLabel?.trim() || "Next action";
    case "needs_contact":
      return "Needs contact";
    default:
      return "Calling";
  }
}

export function shapeHeadline(contactName: string | null | undefined, businessName: string): string {
  const name = contactName?.trim() ?? "";
  const business = businessName.trim();
  if (name && business && name.toLowerCase() !== business.toLowerCase()) return `${name} · ${business}`;
  return business || name || "This lead";
}

export function shapeIntel(input: {
  contactRole: string | null;
  city: string | null;
  region: string | null;
  fitReasons: string[];
  summary?: string | null;
  icpBusiness?: string | null;
  cadencePurpose?: string | null;
}): string {
  const why = whyThisLead({
    fitReasons: input.fitReasons,
    summary: input.cadencePurpose?.trim() || input.summary,
    icpBusiness: input.icpBusiness,
  });
  const place = [input.contactRole?.trim(), [input.city, input.region].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  if (place && why) return `${place} — ${why}`;
  return why;
}

export function leadShortCode(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0;
  return `NF-${String(hash % 1000).padStart(3, "0")}`;
}
