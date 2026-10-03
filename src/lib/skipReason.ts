import { leadHasPhone } from "@/lib/focusQueue";
import {
  anyoneWorks,
  displayChannelFor,
  pickAssignee,
  rewriteForSlot,
  type RouteRep,
  type RouteSlot,
} from "@/lib/focusRouting";
import type { MappedPipelineRow } from "@/lib/pipelineToday";
import type { LeadStatus } from "@prisma/client";

export const SKIP_REASONS = ["bad_contact", "wrong_person", "not_fit", "already_in_touch", "not_now", "other"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export const SKIP_RETURN_DAYS = 7;

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  bad_contact: "Bad contact",
  wrong_person: "Wrong person",
  not_fit: "Not a fit",
  already_in_touch: "Already in touch",
  not_now: "Not now",
  other: "Other",
};

export function isSkipReason(value: string): value is SkipReason {
  return (SKIP_REASONS as readonly string[]).includes(value);
}

export function addDaysToStamp(stamp: string, days: number): string {
  const [year, month, day] = stamp.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

export function defaultSkipReturnStamp(todayPkt: string): string {
  return addDaysToStamp(todayPkt, SKIP_RETURN_DAYS);
}

/** A later calendar day. Today does not count: the card has to leave and come back. */
export function validSkipReturnStamp(value: string, todayPkt: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value > todayPkt;
}

export function linkedinProfileUrl(linkedinUrl: string | null | undefined, linkKind: string | null | undefined, linkUrl: string | null | undefined): string | null {
  const fromLead = linkedinUrl?.trim() ?? "";
  if (/linkedin\.com/i.test(fromLead)) return fromLead;
  const fromCard = linkUrl?.trim() ?? "";
  if (linkKind === "linkedin_profile" && /linkedin\.com/i.test(fromCard)) return fromCard;
  return null;
}

/**
 * After a bad email: LinkedIn when a profile URL exists, otherwise a call
 * when there is a phone and someone works calls, otherwise needs contact.
 * Never a contact form.
 */
export function routeAfterBadContact(input: {
  linkedinUrl: string | null;
  phone: string | null;
  reps: RouteRep[];
  defaultCap: number;
  leadOwnerId: string;
}): { slot: "linkedin" | "call" | "needs_contact"; assigneeId: string } {
  if (input.linkedinUrl) {
    const assignee =
      pickAssignee({
        leadOwnerId: input.leadOwnerId,
        channel: "linkedin",
        reps: input.reps,
        defaultCap: input.defaultCap,
      }) ?? input.leadOwnerId;
    return { slot: "linkedin", assigneeId: assignee };
  }
  if (leadHasPhone(input.phone) && anyoneWorks(input.reps, "call", input.defaultCap)) {
    const assignee =
      pickAssignee({
        leadOwnerId: input.leadOwnerId,
        channel: "call",
        reps: input.reps,
        defaultCap: input.defaultCap,
      }) ?? input.leadOwnerId;
    return { slot: "call", assigneeId: assignee };
  }
  return { slot: "needs_contact", assigneeId: input.leadOwnerId };
}

export type SkipCardSlot = "email" | "linkedin" | "call" | "needs_contact";

export type SkipDecision = {
  cardStatus: "skipped" | "snoozed";
  returnsOn: string | null;
  leadStatus: LeadStatus | null;
  stopOutreach: boolean;
  emailInvalid: boolean;
  route: { slot: RouteSlot; assigneeId: string } | null;
};

/**
 * Bad contact always kills the email. LinkedIn is next when a profile exists,
 * then a call, then needs contact. If this card is already that slot, take the
 * one after it so the same card is not opened twice.
 */
export function badContactRoute(input: {
  linkedinUrl: string | null;
  phone: string | null;
  reps: RouteRep[];
  defaultCap: number;
  leadOwnerId: string;
  currentSlot: SkipCardSlot | null;
}): { slot: "linkedin" | "call" | "needs_contact"; assigneeId: string } | null {
  let route = routeAfterBadContact(input);
  if (input.currentSlot === "linkedin" && route.slot === "linkedin") {
    route = routeAfterBadContact({ ...input, linkedinUrl: null });
  }
  if (input.currentSlot && route.slot === input.currentSlot) {
    if (input.currentSlot === "needs_contact") return null;
    return { slot: "needs_contact", assigneeId: input.leadOwnerId };
  }
  return route;
}

export function decideSkip(input: {
  reason: SkipReason;
  linkedinUrl: string | null;
  phone: string | null;
  reps: RouteRep[];
  defaultCap: number;
  leadOwnerId: string;
  returnsOn: string | null;
  todayPkt: string;
  currentSlot?: SkipCardSlot | null;
}): SkipDecision {
  if (input.reason === "not_now") {
    return {
      cardStatus: "snoozed",
      returnsOn: input.returnsOn && validSkipReturnStamp(input.returnsOn, input.todayPkt) ? input.returnsOn : defaultSkipReturnStamp(input.todayPkt),
      leadStatus: null,
      stopOutreach: false,
      emailInvalid: false,
      route: null,
    };
  }
  if (input.reason === "bad_contact") {
    const route = badContactRoute({ ...input, currentSlot: input.currentSlot ?? null });
    return {
      cardStatus: "skipped",
      returnsOn: null,
      leadStatus: !route || route.slot === "needs_contact" ? "needs_contact" : null,
      stopOutreach: false,
      emailInvalid: true,
      route,
    };
  }
  if (input.reason === "wrong_person") {
    return {
      cardStatus: "skipped",
      returnsOn: null,
      leadStatus: "needs_contact",
      stopOutreach: false,
      emailInvalid: false,
      route: null,
    };
  }
  if (input.reason === "not_fit") {
    return {
      cardStatus: "skipped",
      returnsOn: null,
      leadStatus: "not_fit",
      stopOutreach: false,
      emailInvalid: false,
      route: null,
    };
  }
  if (input.reason === "already_in_touch") {
    return {
      cardStatus: "skipped",
      returnsOn: null,
      leadStatus: null,
      stopOutreach: true,
      emailInvalid: false,
      route: null,
    };
  }
  return {
    cardStatus: "skipped",
    returnsOn: null,
    leadStatus: null,
    stopOutreach: false,
    emailInvalid: false,
    route: null,
  };
}

/** The replacement card. Contact forms are not a slot this can produce. */
export function cardForBadContactRoute(
  row: MappedPipelineRow,
  route: { slot: "linkedin" | "call" | "needs_contact"; assigneeId: string },
  lead: { email: string | null; linkedinUrl: string | null; phone: string | null },
  rep: RouteRep | undefined,
): MappedPipelineRow {
  const next = rewriteForSlot(row, route.slot, lead, rep);
  if (next.kind === "contact_form" || next.linkKind === "contact_form") {
    return rewriteForSlot(row, "needs_contact", lead, rep ?? { id: route.assigneeId, channels: [], caps: {}, load: { email: 0, linkedin: 0, call: 0 } });
  }
  if (route.slot === "needs_contact" && rep) next.channel = displayChannelFor(rep);
  return next;
}
