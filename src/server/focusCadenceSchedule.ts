import type { Channel, LeadStatus, Prisma } from "@prisma/client";
import {
  cadenceContact,
  parseFocusCadence,
  pktDayStart,
  placeRoutedChannel,
  walkCadence,
  type CadenceChannel,
  type CadenceView,
} from "@/lib/focusCadence";
import { parseChannelsWorked } from "@/lib/focusRouting";
import { dateStampFromDb, pktDateStamp, queueDateAsUtc } from "@/lib/pipelineToday";
import { prisma } from "@/server/db";

const CONTINUING: LeadStatus[] = ["queued", "in_cadence"];

type CadenceLead = {
  id: string;
  status: LeadStatus;
  email: string | null;
  emailVerification: string;
  linkedinUrl: string | null;
  phone: string | null;
  signals: Prisma.JsonValue;
  cadenceStep: number;
  cadenceStartedOn: Date | null;
  nextTouchAt: Date | null;
  nextChannelOverride: Channel | null;
  createdAt: Date;
};

function anchorStamp(lead: { cadenceStartedOn: Date | null; createdAt: Date }, hint: string | null): string {
  if (lead.cadenceStartedOn) return dateStampFromDb(lead.cadenceStartedOn);
  if (hint) return hint;
  return pktDateStamp(lead.createdAt);
}

function asWorkChannel(channel: Channel): CadenceChannel | null {
  if (channel === "email" || channel === "linkedin" || channel === "call") return channel;
  return null;
}

async function loadCadenceContext(organizationId: string, leadId: string) {
  const [lead, settings] = await Promise.all([
    prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { owner: { select: { channelsWorked: true } } },
    }),
    prisma.orgSettings.findUnique({ where: { organizationId }, select: { focusCadence: true } }),
  ]);
  if (!lead) return null;
  return {
    lead,
    cadence: parseFocusCadence(settings?.focusCadence),
    ownerChannels: parseChannelsWorked(lead.owner.channelsWorked),
  };
}

function viewData(view: CadenceView, anchor: string, status: LeadStatus | "keep"): Prisma.LeadUpdateInput {
  const started = queueDateAsUtc(anchor);
  if (view.state === "finished") {
    return {
      status: "finished",
      cadenceStartedOn: started,
      nextTouchAt: null,
      nextChannelOverride: null,
    };
  }
  return {
    ...(status === "keep" ? {} : { status }),
    cadenceStep: view.stepIndex,
    cadenceStartedOn: started,
    nextTouchAt: pktDayStart(view.dueOn),
    nextChannelOverride: null,
  };
}

/**
 * After Done on the current step, schedule the next usable step.
 * The card stays off the board until that Asia/Karachi day.
 * Does not open a deal and does not change a lead who has already left the sequence.
 */
export async function scheduleFocusCadenceAfterDone(input: {
  organizationId: string;
  leadId: string;
  completedChannel: Channel;
  anchorHint?: string | null;
}) {
  const completed = asWorkChannel(input.completedChannel);
  if (!completed) return;
  const loaded = await loadCadenceContext(input.organizationId, input.leadId);
  if (!loaded || !CONTINUING.includes(loaded.lead.status)) return;
  const step = loaded.cadence[loaded.lead.cadenceStep];
  if (!step || step.channel !== completed) return;

  const anchor = anchorStamp(loaded.lead, input.anchorHint ?? null);
  const view = walkCadence({
    cadence: loaded.cadence,
    startIndex: loaded.lead.cadenceStep + 1,
    anchor,
    today: pktDateStamp(),
    contact: cadenceContact(loaded.lead),
    ownerChannels: loaded.ownerChannels,
  });
  await prisma.lead.update({ where: { id: loaded.lead.id }, data: viewData(view, anchor, "in_cadence") });
}

/**
 * Drop follow-ups whose day has not arrived, and jump a step this owner cannot do.
 * A hot score does not pull a future step onto the board.
 */
export async function alignQueueCadence<T extends CadenceLead>(
  organizationId: string,
  ownerChannels: readonly string[],
  leads: T[],
): Promise<Array<T & { dueChannel: CadenceChannel }>> {
  if (leads.length === 0) return [];
  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId },
    select: { focusCadence: true },
  });
  const cadence = parseFocusCadence(settings?.focusCadence);
  const today = pktDateStamp();
  const visible: Array<T & { dueChannel: CadenceChannel }> = [];

  for (const lead of leads) {
    if (!CONTINUING.includes(lead.status)) continue;
    const anchor = anchorStamp(lead, null);
    const view = walkCadence({
      cadence,
      startIndex: lead.cadenceStep,
      anchor,
      today,
      contact: cadenceContact(lead),
      ownerChannels,
    });
    const desiredTouch = view.state === "finished" ? null : pktDayStart(view.dueOn);
    const desiredStep = view.state === "finished" ? lead.cadenceStep : view.stepIndex;
    const desiredStatus = view.state === "finished" ? "finished" : view.state === "waiting" ? "in_cadence" : lead.status;
    const touchMatches =
      desiredTouch === null
        ? lead.nextTouchAt === null
        : lead.nextTouchAt !== null && Math.abs(lead.nextTouchAt.getTime() - desiredTouch.getTime()) < 1000;
    if (!lead.cadenceStartedOn || lead.cadenceStep !== desiredStep || lead.status !== desiredStatus || lead.nextChannelOverride !== null || !touchMatches) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: viewData(view, anchor, view.state === "due" ? "keep" : "in_cadence"),
      });
    }
    if (view.state !== "due") continue;
    lead.cadenceStep = view.stepIndex;
    lead.nextChannelOverride = null;
    visible.push({ ...lead, dueChannel: view.channel });
  }
  return visible;
}

/** Fields a bad-contact route writes so the replacement card is the cadence step. */
export function cadenceFieldsForRoutedSkip(input: {
  cadence: ReturnType<typeof parseFocusCadence>;
  stepIndex: number;
  routedChannel: "linkedin" | "call";
  anchor: string;
  today: string;
  contact: ReturnType<typeof cadenceContact>;
  ownerChannels: readonly string[];
  pipelineCardOpened: boolean;
}): Prisma.LeadUpdateInput {
  const placed = placeRoutedChannel(input);
  const started = queueDateAsUtc(input.anchor);
  if (placed.matchedCadenceStep && input.pipelineCardOpened) {
    return {
      status: "in_cadence",
      cadenceStep: placed.stepIndex,
      cadenceStartedOn: started,
      nextTouchAt: null,
      nextChannelOverride: null,
    };
  }
  if (placed.matchedCadenceStep) {
    return {
      status: "in_cadence",
      cadenceStep: placed.stepIndex,
      cadenceStartedOn: started,
      nextTouchAt: pktDayStart(input.today),
      nextChannelOverride: null,
    };
  }
  if (!placed.dueOn) {
    return {
      status: "finished",
      cadenceStep: input.stepIndex,
      cadenceStartedOn: started,
      nextTouchAt: null,
      nextChannelOverride: null,
    };
  }
  return {
    status: "in_cadence",
    cadenceStep: placed.stepIndex,
    cadenceStartedOn: started,
    nextTouchAt: pktDayStart(placed.dueOn),
    nextChannelOverride: null,
  };
}
