import { pipelinePersonKey, type MappedPipelineRow } from "@/lib/pipelineToday";

/** Used when a rep has no cap stored for that channel. */
export const DEFAULT_CHANNEL_DAILY_CAP = 30;

export type WorkChannel = "email" | "linkedin" | "call";
export type RouteSlot = WorkChannel | "needs_contact";

const WORK_CHANNELS: WorkChannel[] = ["email", "linkedin", "call"];
const SLOT_ORDER: RouteSlot[] = ["email", "linkedin", "call", "needs_contact"];

const ROLE_INBOXES = new Set([
  "info",
  "hello",
  "contact",
  "contacts",
  "sales",
  "support",
  "admin",
  "office",
  "team",
  "inquiries",
  "enquiries",
  "hi",
  "mail",
  "general",
  "reception",
  "service",
  "help",
  "marketing",
  "careers",
  "jobs",
  "hr",
  "billing",
  "accounts",
  "noreply",
  "customerservice",
]);

export type RouteRep = {
  id: string;
  channels: WorkChannel[];
  caps: Partial<Record<WorkChannel, number>>;
  load: Record<WorkChannel, number>;
};

export type RoutableCard = {
  cardId: string;
  row: MappedPipelineRow;
};

export type RoutedCard = {
  cardId: string;
  assigneeId: string;
  leadOwnerId: string;
  row: MappedPipelineRow;
  slot: RouteSlot;
};

export type RouteRejection = { cardId: string; reason: string };

export function emptyLoad(): Record<WorkChannel, number> {
  return { email: 0, linkedin: 0, call: 0 };
}

export function parseChannelsWorked(value: unknown): WorkChannel[] {
  if (!Array.isArray(value)) return ["call", "email"];
  const seen = new Set<WorkChannel>();
  for (const item of value) {
    if (item === "email" || item === "linkedin" || item === "call") seen.add(item);
  }
  return [...seen];
}

export function parseChannelCaps(value: unknown): Partial<Record<WorkChannel, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const caps: Partial<Record<WorkChannel, number>> = {};
  for (const channel of WORK_CHANNELS) {
    const raw = (value as Record<string, unknown>)[channel];
    const number = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
    if (Number.isFinite(number) && number >= 0) caps[channel] = Math.floor(number);
  }
  return caps;
}

export function capFor(rep: RouteRep, channel: WorkChannel, fallback: number): number {
  const stored = rep.caps[channel];
  if (typeof stored === "number") return stored;
  return fallback;
}

export function worksChannel(rep: RouteRep, channel: WorkChannel, fallback: number): boolean {
  return rep.channels.includes(channel) && capFor(rep, channel, fallback) > rep.load[channel];
}

/** Lead owner first when they work the channel and still have room; otherwise the teammate with the fewest cards today. */
export function pickAssignee(input: {
  leadOwnerId: string | null;
  channel: WorkChannel;
  reps: RouteRep[];
  defaultCap: number;
}): string | null {
  const owner = input.leadOwnerId ? input.reps.find((rep) => rep.id === input.leadOwnerId) : undefined;
  if (owner && worksChannel(owner, input.channel, input.defaultCap)) {
    owner.load[input.channel] += 1;
    return owner.id;
  }
  const teammates = input.reps
    .filter((rep) => rep.id !== owner?.id && worksChannel(rep, input.channel, input.defaultCap))
    .sort((a, b) => a.load[input.channel] - b.load[input.channel] || a.id.localeCompare(b.id));
  const chosen = teammates[0];
  if (!chosen) return null;
  chosen.load[input.channel] += 1;
  return chosen.id;
}

export function inboxLocalPart(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A named person's address. Role inboxes (info@, sales@) are not a named-person email. */
export function isNamedPersonEmail(email: string | null | undefined): boolean {
  if (!email || !email.includes("@")) return false;
  const local = inboxLocalPart(email);
  if (!local || ROLE_INBOXES.has(local)) return false;
  return /[a-z]/.test(local);
}

export type OutreachSlot = "contact_form" | "email" | "linkedin" | "call" | "unaddressed_email" | "other";

export function outreachSlot(row: Pick<MappedPipelineRow, "kind" | "channel" | "linkKind" | "mailtoTo">): OutreachSlot {
  if (row.kind === "contact_form" || row.linkKind === "contact_form") return "contact_form";
  if (row.kind === "call" || row.channel === "call") return "call";
  if (row.channel === "linkedin" || row.kind === "linkedin_request" || row.linkKind === "linkedin_profile") return "linkedin";
  if (row.linkKind === "mailto" || row.kind === "send_email" || row.kind === "reply" || row.kind === "follow_up") {
    if ((row.linkKind === "mailto" || row.kind === "send_email") && isNamedPersonEmail(row.mailtoTo)) return "email";
    if (row.linkKind === "mailto" || row.kind === "send_email") return "unaddressed_email";
  }
  if (row.kind === "needs_contact") return "other";
  return "other";
}

export function displayChannelFor(rep: RouteRep | undefined): WorkChannel {
  if (rep?.channels.includes("email")) return "email";
  if (rep?.channels.includes("linkedin")) return "linkedin";
  if (rep?.channels.includes("call")) return "call";
  return "email";
}

export function rewriteNeedsContact(row: MappedPipelineRow, channel: WorkChannel): MappedPipelineRow {
  return {
    ...row,
    kind: "needs_contact",
    channel,
    actionLabel: "Needs contact",
    linkKind: "none",
    linkUrl: null,
    mailtoTo: null,
    mailtoSubject: null,
    message: "",
    blankMessage: false,
    connectNoNote: false,
    phone: row.phone,
    outcomeMode: "done_followup",
    intel: "No named email, LinkedIn, or call could be staffed. Find a way to reach them. Nothing sends from here.",
  };
}

export function rewriteForSlot(
  row: MappedPipelineRow,
  slot: RouteSlot,
  lead: { email: string | null; linkedinUrl: string | null; phone: string | null },
  rep: RouteRep | undefined,
): MappedPipelineRow {
  if (slot === "needs_contact") return rewriteNeedsContact(row, displayChannelFor(rep));
  if (slot === "call") {
    return {
      ...row,
      kind: "call",
      channel: "call",
      actionLabel: row.kind === "call" ? row.actionLabel : "Call",
      linkKind: "none",
      linkUrl: null,
      mailtoTo: null,
      mailtoSubject: null,
      message: "",
      blankMessage: false,
      connectNoNote: false,
      phone: row.phone || lead.phone,
      outcomeMode: "done_skip",
      intel: "Call them yourself. Nothing dials from here.",
    };
  }
  if (slot === "linkedin") {
    return {
      ...row,
      kind: "linkedin_request",
      channel: "linkedin",
      actionLabel: row.kind === "linkedin_request" || row.kind === "follow_up" || row.kind === "reply" ? row.actionLabel : "LinkedIn request",
      linkKind: "linkedin_profile",
      linkUrl: row.linkKind === "linkedin_profile" ? row.linkUrl : lead.linkedinUrl,
      mailtoTo: null,
      mailtoSubject: null,
      message: row.channel === "linkedin" ? row.message : "",
      blankMessage: row.channel === "linkedin" ? row.blankMessage : true,
      connectNoNote: row.channel === "linkedin" ? row.connectNoNote : true,
      outcomeMode: row.channel === "linkedin" ? row.outcomeMode : "done_skip",
      intel: row.channel === "linkedin" ? row.intel : "Connect with no note. The message stays blank.",
    };
  }
  return {
    ...row,
    kind: "send_email",
    channel: "email",
    actionLabel: row.kind === "send_email" || row.kind === "follow_up" || row.kind === "reply" ? row.actionLabel : "Send email",
    linkKind: "mailto",
    linkUrl: null,
    mailtoTo: isNamedPersonEmail(row.mailtoTo) ? row.mailtoTo : lead.email,
    mailtoSubject: row.mailtoSubject,
    message: row.channel === "email" ? row.message : "",
    blankMessage: false,
    connectNoNote: false,
    outcomeMode: row.channel === "email" && row.kind !== "needs_contact" ? row.outcomeMode : "done_skip",
    intel: row.channel === "email" && row.kind !== "needs_contact" ? row.intel : "Open in Titan and send it yourself.",
  };
}

export function matchOwnerHint<T extends { id: string; email: string; fullName: string }>(
  users: T[],
  hint: string | null | undefined,
): T | null {
  const text = hint?.trim().toLowerCase();
  if (!text) return null;
  return (
    users.find((user) => user.email.toLowerCase() === text) ??
    users.find((user) => user.email.toLowerCase().split("@")[0] === text) ??
    users.find((user) => user.fullName.trim().toLowerCase() === text) ??
    null
  );
}

function rejectionReason(slot: OutreachSlot, skipped: boolean): string {
  if (slot === "contact_form") return "contact_form";
  if (slot === "unaddressed_email") return "not_named_email";
  if (skipped) return "channel_skipped";
  return "later_channel";
}

/**
 * One card per lead. Try named-person email, then LinkedIn, then call.
 * A channel nobody can take is skipped. Contact forms are never queued.
 * The last step is needs_contact on the lead owner.
 */
export function selectRoutedCards(input: {
  cards: RoutableCard[];
  leadOwners: Map<string, string>;
  hintOwnerId: string | null;
  fallbackOwnerId: string | null;
  reps: RouteRep[];
  defaultCap: number;
  locked?: Map<string, string>;
}): { routed: RoutedCard[]; rejected: RouteRejection[] } {
  const routed: RoutedCard[] = [];
  const rejected: RouteRejection[] = [];
  const groups = new Map<string, RoutableCard[]>();
  for (const card of input.cards) {
    const key = pipelinePersonKey(card.row.company, card.row.contactName);
    const list = groups.get(key) ?? [];
    list.push(card);
    groups.set(key, list);
  }

  for (const [personKey, group] of groups) {
    const leadOwnerId = input.leadOwners.get(personKey) ?? input.hintOwnerId ?? input.fallbackOwnerId;
    if (!leadOwnerId) {
      for (const card of group) rejected.push({ cardId: card.cardId, reason: "no_route" });
      continue;
    }

    const lockedCard = group.find((card) => input.locked?.has(card.cardId));
    if (lockedCard) {
      routed.push({
        cardId: lockedCard.cardId,
        assigneeId: input.locked?.get(lockedCard.cardId) ?? leadOwnerId,
        leadOwnerId,
        row: lockedCard.row,
        slot: slotOfRow(lockedCard.row),
      });
      for (const card of group) {
        if (card.cardId === lockedCard.cardId) continue;
        rejected.push({ cardId: card.cardId, reason: "already_worked" });
      }
      continue;
    }

    const buckets = new Map<OutreachSlot, RoutableCard[]>();
    for (const card of group) {
      const slot = outreachSlot(card.row);
      const list = buckets.get(slot) ?? [];
      list.push(card);
      buckets.set(slot, list);
    }

    let placed: RoutableCard | null = null;
    let placedSlot: RouteSlot = "needs_contact";
    let placedRow: MappedPipelineRow | null = null;
    let assigneeId: string | null = null;
    const skippedIds = new Set<string>();

    for (const slot of ["email", "linkedin", "call"] as const) {
      const card = buckets.get(slot)?.[0];
      if (!card) continue;
      const assignee = pickAssignee({ leadOwnerId, channel: slot, reps: input.reps, defaultCap: input.defaultCap });
      if (!assignee) {
        skippedIds.add(card.cardId);
        continue;
      }
      placed = card;
      placedSlot = slot;
      placedRow = card.row;
      assigneeId = assignee;
      break;
    }

    if (!placed || !assigneeId || !placedRow) {
      const source =
        buckets.get("other")?.[0] ??
        buckets.get("unaddressed_email")?.[0] ??
        buckets.get("email")?.[0] ??
        buckets.get("linkedin")?.[0] ??
        buckets.get("call")?.[0];
      if (!source) {
        for (const card of group) {
          const slot = outreachSlot(card.row);
          rejected.push({ cardId: card.cardId, reason: slot === "contact_form" ? "contact_form" : "no_route" });
        }
        continue;
      }
      const ownerRep = input.reps.find((rep) => rep.id === leadOwnerId);
      placed = source;
      placedSlot = "needs_contact";
      placedRow = rewriteNeedsContact(source.row, displayChannelFor(ownerRep));
      assigneeId = leadOwnerId;
    }

    routed.push({
      cardId: placed.cardId,
      assigneeId,
      leadOwnerId,
      row: placedRow,
      slot: placedSlot,
    });

    for (const card of group) {
      if (card.cardId === placed.cardId) continue;
      const slot = outreachSlot(card.row);
      rejected.push({ cardId: card.cardId, reason: rejectionReason(slot, skippedIds.has(card.cardId)) });
    }
  }

  return { routed, rejected };
}

export function slotOfRow(row: Pick<MappedPipelineRow, "kind" | "channel" | "linkKind" | "mailtoTo">): RouteSlot {
  const slot = outreachSlot(row);
  if (slot === "email" || slot === "linkedin" || slot === "call") return slot;
  return "needs_contact";
}

export type RerouteCard = {
  id: string;
  slot: RouteSlot;
  leadOwnerId: string;
  assigneeId: string;
  hasNamedEmail: boolean;
  hasLinkedin: boolean;
  hasPhone: boolean;
};

export type ReroutePlan = {
  id: string;
  assigneeId: string;
  slot: RouteSlot;
  changed: boolean;
};

function slotAvailable(card: RerouteCard, slot: RouteSlot): boolean {
  if (slot === "email") return card.hasNamedEmail || card.slot === "email";
  if (slot === "linkedin") return card.hasLinkedin || card.slot === "linkedin";
  if (slot === "call") return card.hasPhone || card.slot === "call";
  return true;
}

/** Reassign open cards after channel settings change. Lead ownership is not an input that this mutates. */
export function planQueueReroute(input: { cards: RerouteCard[]; reps: RouteRep[]; defaultCap: number }): ReroutePlan[] {
  const plans: ReroutePlan[] = [];
  for (const card of input.cards) {
    const start = Math.max(0, SLOT_ORDER.indexOf(card.slot));
    let assigneeId = card.leadOwnerId;
    let slot: RouteSlot = "needs_contact";
    let placed = false;
    for (const next of SLOT_ORDER.slice(start)) {
      if (!slotAvailable(card, next)) continue;
      if (next === "needs_contact") {
        assigneeId = card.leadOwnerId;
        slot = "needs_contact";
        placed = true;
        break;
      }
      const assignee = pickAssignee({
        leadOwnerId: card.leadOwnerId,
        channel: next,
        reps: input.reps,
        defaultCap: input.defaultCap,
      });
      if (!assignee) continue;
      assigneeId = assignee;
      slot = next;
      placed = true;
      break;
    }
    if (!placed) {
      assigneeId = card.leadOwnerId;
      slot = "needs_contact";
    }
    plans.push({
      id: card.id,
      assigneeId,
      slot,
      changed: assigneeId !== card.assigneeId || slot !== card.slot,
    });
  }
  return plans;
}

export function anyoneWorks(reps: RouteRep[], channel: WorkChannel, fallback: number): boolean {
  return reps.some((rep) => rep.channels.includes(channel) && capFor(rep, channel, fallback) > 0);
}
