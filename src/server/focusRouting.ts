import type { Channel } from "@prisma/client";
import {
  DEFAULT_CHANNEL_DAILY_CAP,
  displayChannelFor,
  emptyLoad,
  isNamedPersonEmail,
  parseChannelCaps,
  parseChannelsWorked,
  planQueueReroute,
  rewriteForSlot,
  slotOfRow,
  type RouteRep,
  type RouteSlot,
} from "@/lib/focusRouting";
import type { MappedPipelineRow, PipelineActionKind, PipelineChannel, PipelineLinkKind, PipelineOutcomeMode } from "@/lib/pipelineToday";
import { pktDateStamp, queueDateAsUtc } from "@/lib/pipelineToday";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";

const WORK: Channel[] = ["email", "linkedin", "call"];

function asWorkChannel(value: string): PipelineChannel {
  if (value === "linkedin" || value === "call") return value;
  return "email";
}

export async function loadRouteReps(
  organizationId: string,
  queueDate: Date,
  options?: { skipKeys?: Set<string>; force?: boolean },
) {
  const [users, settings, rows] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId, status: { not: "deactivated" } },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        channelsWorked: true,
        channelDailyCaps: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.orgSettings.findUnique({ where: { organizationId }, select: { leadDailyCapDefault: true } }),
    prisma.pipelineTodayRow.findMany({
      where: { organizationId, queueDate, status: { in: ["done", "skipped", "follow_up"] } },
      select: { externalKey: true, ownerId: true, channel: true },
    }),
  ]);
  const defaultCap = settings?.leadDailyCapDefault && settings.leadDailyCapDefault > 0 ? settings.leadDailyCapDefault : DEFAULT_CHANNEL_DAILY_CAP;
  const reps: RouteRep[] = users.map((user) => ({
    id: user.id,
    channels: parseChannelsWorked(user.channelsWorked),
    caps: parseChannelCaps(user.channelDailyCaps),
    load: emptyLoad(),
  }));
  const byId = new Map(reps.map((rep) => [rep.id, rep]));
  for (const row of rows) {
    if (options?.force && options.skipKeys?.has(row.externalKey)) continue;
    if (!WORK.includes(row.channel)) continue;
    const rep = byId.get(row.ownerId);
    if (rep) rep.load[asWorkChannel(row.channel)] += 1;
  }
  const fallback = users.find((user) => user.role === "lead") ?? users[0] ?? null;
  return { users, reps, defaultCap, fallbackOwnerId: fallback?.id ?? null };
}

function storedRow(row: {
  sheetRow: number;
  timeLabel: string;
  contactName: string | null;
  company: string;
  actionLabel: string;
  kind: string;
  channel: Channel;
  linkKind: string;
  linkUrl: string | null;
  mailtoTo: string | null;
  mailtoSubject: string | null;
  message: string;
  connectNoNote: boolean;
  outcomeMode: string;
  intel: string;
  sheetDone: boolean;
}): MappedPipelineRow {
  const kind = (row.kind as PipelineActionKind) || "next_action";
  const outcomeMode: PipelineOutcomeMode =
    row.outcomeMode === "done_skip_followup" || row.outcomeMode === "done_followup" || row.outcomeMode === "done_skip"
      ? row.outcomeMode
      : "done_skip";
  return {
    sheetRow: row.sheetRow,
    timeLabel: row.timeLabel,
    contactName: row.contactName ?? "",
    company: row.company,
    actionLabel: row.actionLabel,
    kind,
    channel: asWorkChannel(row.channel),
    linkKind: (row.linkKind as PipelineLinkKind) || "none",
    linkUrl: row.linkUrl,
    mailtoTo: row.mailtoTo,
    mailtoSubject: row.mailtoSubject,
    message: row.message,
    blankMessage: row.connectNoNote && !row.message,
    connectNoNote: row.connectNoNote,
    phone: null,
    outcomeMode,
    intel: row.intel,
    sheetDone: row.sheetDone,
  };
}

function slotChangedFields(row: MappedPipelineRow) {
  return {
    actionLabel: row.actionLabel,
    kind: row.kind,
    channel: row.channel,
    linkKind: row.linkKind,
    linkUrl: row.linkUrl,
    mailtoTo: row.mailtoTo,
    mailtoSubject: row.mailtoSubject,
    message: row.message,
    connectNoNote: row.connectNoNote,
    outcomeMode: row.outcomeMode,
    intel: row.intel,
  };
}

/** Move today's open cards onto reps who still work that channel. Does not change lead owners. */
export async function rerouteOpenFocusCards(organizationId: string, actorId: string) {
  const today = queueDateAsUtc(pktDateStamp());
  const open = await prisma.pipelineTodayRow.findMany({
    where: { organizationId, status: "open", queueDate: { lte: today } },
    include: { lead: { select: { ownerId: true, email: true, linkedinUrl: true, phone: true } } },
    orderBy: [{ queueDate: "asc" }, { sheetRow: "asc" }],
  });
  if (open.length === 0) return [];
  const { reps, defaultCap } = await loadRouteReps(organizationId, today);
  const plans = planQueueReroute({
    defaultCap,
    reps,
    cards: open.map((row) => ({
      id: row.id,
      slot: slotOfRow({
        kind: row.kind as PipelineActionKind,
        channel: asWorkChannel(row.channel),
        linkKind: row.linkKind as PipelineLinkKind,
        mailtoTo: row.mailtoTo,
      }),
      leadOwnerId: row.lead.ownerId,
      assigneeId: row.ownerId,
      hasNamedEmail: isNamedPersonEmail(row.lead.email) || isNamedPersonEmail(row.mailtoTo),
      hasLinkedin: Boolean(row.lead.linkedinUrl || (row.linkKind === "linkedin_profile" && row.linkUrl)),
      hasPhone: Boolean(row.lead.phone) || row.kind === "call" || row.channel === "call",
    })),
  });

  const moves: { cardId: string; leadId: string; from: string; to: string; slot: RouteSlot }[] = [];
  for (const plan of plans) {
    if (!plan.changed) continue;
    const row = open.find((item) => item.id === plan.id);
    if (!row) continue;
    const current = slotOfRow({
      kind: row.kind as PipelineActionKind,
      channel: asWorkChannel(row.channel),
      linkKind: row.linkKind as PipelineLinkKind,
      mailtoTo: row.mailtoTo,
    });
    const rep = reps.find((item) => item.id === plan.assigneeId);
    const nextRow = plan.slot === current ? null : rewriteForSlot(storedRow(row), plan.slot, row.lead, rep ?? { id: plan.assigneeId, channels: [], caps: {}, load: emptyLoad() });
    if (plan.slot === "needs_contact" && rep) {
      const channel = displayChannelFor(rep);
      if (nextRow) nextRow.channel = channel;
    }
    await prisma.pipelineTodayRow.update({
      where: { id: row.id },
      data: {
        ownerId: plan.assigneeId,
        ...(nextRow ? slotChangedFields(nextRow) : {}),
      },
    });
    moves.push({ cardId: row.externalKey, leadId: row.leadId, from: row.ownerId, to: plan.assigneeId, slot: plan.slot });
  }

  if (moves.length > 0) {
    await writeAuditLog({
      organizationId,
      actorId,
      action: "focus_cards_routed",
      entityType: "user",
      entityId: actorId,
      after: { moves },
    });
  }
  return moves;
}
