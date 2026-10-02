import { beforeEach, describe, expect, it, vi } from "vitest";
import { pktDateStamp, queueDateAsUtc } from "@/lib/pipelineToday";

const OWNER_ID = "user-muqeet";
const ORG_ID = "org-1";
const OTHER_OWNER_ID = "user-other";

type PipelineFixture = {
  id: string;
  organizationId: string;
  ownerId: string;
  leadId: string;
  queueDate: Date;
  sheetRow: number;
  status: string;
  externalKey: string;
  timeLabel: string;
  contactName: string | null;
  company: string;
  actionLabel: string;
  kind: string;
  channel: "email";
  linkKind: string;
  linkUrl: string | null;
  mailtoTo: string | null;
  mailtoSubject: string | null;
  message: string;
  sheetDone: boolean;
  outcomeMode: string;
  intel: string;
  connectNoNote: boolean;
  lead: ReturnType<typeof leadRecord>;
};

type QueueFixture = {
  lead: ReturnType<typeof leadRecord> & { touches: [] };
  campaign: ReturnType<typeof leadRecord>["campaign"];
  label: string;
};

type ReplyFixture = {
  id: string;
  leadId: string;
  channel: "email";
  text: string;
  responseDraft: string | null;
  receivedAt: Date;
  lead: ReturnType<typeof leadRecord>;
};

const { state } = vi.hoisted(() => ({
  state: {
    owner: null as { id: string; fullName: string } | null,
    rows: [] as PipelineFixture[],
    queue: [] as QueueFixture[],
    replies: [] as ReplyFixture[],
    queueCalls: [] as { ownerId: string; limit?: number }[],
  },
}));

vi.mock("@/server/db", () => ({
  prisma: {
    pipelineTodayRow: {
      count: (args: { where?: PipelineWhere }) => matchingRows(args.where).length,
      findMany: (args: { where?: PipelineWhere; orderBy?: { sheetRow?: "asc" | "desc" } }) => {
        const rows = matchingRows(args.where);
        if (args.orderBy?.sheetRow === "asc") rows.sort((a, b) => a.sheetRow - b.sheetRow);
        if (args.orderBy?.sheetRow === "desc") rows.sort((a, b) => b.sheetRow - a.sheetRow);
        return rows;
      },
    },
    auditLog: { findFirst: async () => null },
    touch: { findMany: async () => [] },
    reply: { findMany: async () => state.replies },
    lead: { findMany: async () => [] },
  },
}));

vi.mock("@/server/focusTodayOwner", () => ({
  resolveFocusTodayOwner: async () => state.owner,
}));

vi.mock("@/server/queue", () => ({
  getQueueForUser: async (ownerId: string, limit?: number) => {
    state.queueCalls.push({ ownerId, limit });
    return state.queue;
  },
}));

import { loadFocusBoard } from "@/server/todayBoard";

type PipelineWhere = {
  organizationId?: string;
  ownerId?: string;
  queueDate?: Date;
  status?: string;
};

function matchingRows(where: PipelineWhere | undefined) {
  return state.rows.filter((row) => {
    if (!where) return true;
    if (where.organizationId && row.organizationId !== where.organizationId) return false;
    if (where.ownerId && row.ownerId !== where.ownerId) return false;
    if (where.status && row.status !== where.status) return false;
    if (where.queueDate && row.queueDate.getTime() !== where.queueDate.getTime()) return false;
    return true;
  });
}

function leadRecord(id: string, name: string) {
  return {
    id,
    businessName: `${name} Co`,
    contactName: name,
    contactRole: "Owner",
    city: "Austin",
    region: "TX",
    country: "US",
    cadenceStep: 0,
    nextChannelOverride: null,
    signals: {},
    phone: null,
    email: `${id}@example.com`,
    instagramUrl: null,
    linkedinUrl: null,
    website: null,
    sourceUrl: null,
    fitScore: 80,
    fitReasons: ["Reviews mention a CSR opening"],
    fitFlags: [] as string[],
    source: "manual" as const,
    campaign: {
      id: "camp-1",
      name: "HVAC",
      strategy: {},
      product: { name: "NerdFlow" },
    },
  };
}

function pipelineRow(input: {
  id: string;
  sheetRow: number;
  status: string;
  leadId?: string;
  ownerId?: string;
  queueDate?: Date;
}): PipelineFixture {
  const leadId = input.leadId ?? input.id;
  const lead = leadRecord(leadId, input.id);
  return {
    id: input.id,
    organizationId: ORG_ID,
    ownerId: input.ownerId ?? OWNER_ID,
    leadId,
    queueDate: input.queueDate ?? queueDateAsUtc(pktDateStamp()),
    sheetRow: input.sheetRow,
    externalKey: input.id,
    timeLabel: "5:00 PM PKT",
    contactName: lead.contactName,
    company: lead.businessName,
    actionLabel: "Send email",
    kind: "send_email",
    channel: "email",
    linkKind: "mailto",
    linkUrl: null,
    mailtoTo: lead.email,
    mailtoSubject: "Hello",
    message: "Hi",
    sheetDone: input.status !== "open",
    status: input.status,
    outcomeMode: "done_skip",
    intel: "Open in Titan and send it yourself.",
    connectNoNote: false,
    lead,
  };
}

function queueItem(id: string, name: string): QueueFixture {
  const lead = { ...leadRecord(id, name), touches: [] as [] };
  return { lead, campaign: lead.campaign, label: "Hot" };
}

function replyItem(id: string, leadId: string, name: string): ReplyFixture {
  return {
    id,
    leadId,
    channel: "email",
    text: "Can we talk Thursday?",
    responseDraft: null,
    receivedAt: new Date("2026-10-02T12:00:00.000Z"),
    lead: leadRecord(leadId, name),
  };
}

describe("loadFocusBoard", () => {
  beforeEach(() => {
    state.owner = { id: OWNER_ID, fullName: "Muqeet Shah" };
    state.rows = [];
    state.queue = [queueItem("lead-queue", "Ada")];
    state.replies = [replyItem("reply-1", "lead-reply", "Grace")];
    state.queueCalls = [];
  });

  it("puts open pipeline cards ahead of the Focus queue and open replies", async () => {
    state.rows = [
      pipelineRow({ id: "pipe-later", sheetRow: 4, status: "open", leadId: "lead-pipe-2" }),
      pipelineRow({ id: "pipe-done", sheetRow: 2, status: "done", leadId: "lead-done" }),
      pipelineRow({ id: "pipe-dropped", sheetRow: 3, status: "dropped", leadId: "lead-dropped" }),
      pipelineRow({ id: "pipe-first", sheetRow: 1, status: "open", leadId: "lead-pipe-1" }),
      pipelineRow({
        id: "pipe-other-owner",
        sheetRow: 1,
        status: "open",
        leadId: "lead-other",
        ownerId: OTHER_OWNER_ID,
      }),
      pipelineRow({
        id: "pipe-yesterday",
        sheetRow: 1,
        status: "open",
        leadId: "lead-yesterday",
        queueDate: queueDateAsUtc("2020-01-01"),
      }),
    ];

    const board = await loadFocusBoard(OWNER_ID, ORG_ID);

    expect(state.queueCalls).toEqual([{ ownerId: OWNER_ID, limit: 50 }]);
    expect(board.cards.map((card) => card.lead.id)).toEqual([
      "lead-pipe-1",
      "lead-pipe-2",
      "lead-queue",
      "lead-reply",
    ]);
    expect(board.cards[0]?.pipeline?.rowId).toBe("pipe-first");
    expect(board.cards[1]?.pipeline?.rowId).toBe("pipe-later");
    expect(board.cards[2]?.pipeline).toBeUndefined();
    expect(board.cards[2]?.label).toBe("Hot");
    expect(board.cards[3]?.replyOnly).toBe(true);
    expect(board.cards[3]?.label).toBe("Reply");
    expect(board.cards[3]?.openReplies.map((reply) => reply.id)).toEqual(["reply-1"]);
    expect(board.cards.some((card) => card.pipeline?.rowId === "pipe-done")).toBe(false);
    expect(board.cards.some((card) => card.pipeline?.rowId === "pipe-dropped")).toBe(false);
    expect(board.suppressCall).toBe(true);
  });

  it("keeps the regular queue when today's pipeline rows are only done or dropped", async () => {
    state.rows = [
      pipelineRow({ id: "pipe-done", sheetRow: 1, status: "done", leadId: "lead-done" }),
      pipelineRow({ id: "pipe-skipped", sheetRow: 2, status: "skipped", leadId: "lead-skipped" }),
      pipelineRow({ id: "pipe-follow", sheetRow: 3, status: "follow_up", leadId: "lead-follow" }),
      pipelineRow({ id: "pipe-dropped", sheetRow: 4, status: "dropped", leadId: "lead-dropped" }),
    ];

    const board = await loadFocusBoard(OWNER_ID, ORG_ID);

    expect(state.queueCalls).toEqual([{ ownerId: OWNER_ID, limit: 50 }]);
    expect(board.cards.map((card) => ({ id: card.lead.id, pipeline: Boolean(card.pipeline), replyOnly: card.replyOnly === true }))).toEqual([
      { id: "lead-queue", pipeline: false, replyOnly: false },
      { id: "lead-reply", pipeline: false, replyOnly: true },
    ]);
    expect(board.cards[1]?.openReplies.map((reply) => reply.id)).toEqual(["reply-1"]);
  });

  it("leaves queue and replies unchanged when no pipeline rows exist", async () => {
    const board = await loadFocusBoard(OWNER_ID, ORG_ID);

    expect(state.queueCalls).toEqual([{ ownerId: OWNER_ID, limit: 50 }]);
    expect(board.cards.map((card) => card.lead.id)).toEqual(["lead-queue", "lead-reply"]);
    expect(board.cards[0]?.pipeline).toBeUndefined();
    expect(board.cards[1]?.replyOnly).toBe(true);
    expect(board.cards[1]?.openReplies[0]?.text).toBe("Can we talk Thursday?");
  });

  it("does not prepend pipeline cards for a rep who is not the Focus owner", async () => {
    state.owner = { id: OWNER_ID, fullName: "Muqeet Shah" };
    state.rows = [pipelineRow({ id: "pipe-open", sheetRow: 1, status: "open", leadId: "lead-pipe", ownerId: "rep-2" })];

    const board = await loadFocusBoard("rep-2", ORG_ID);

    expect(state.queueCalls).toEqual([{ ownerId: "rep-2", limit: 50 }]);
    expect(board.suppressCall).toBe(false);
    expect(board.cards.map((card) => card.lead.id)).toEqual(["lead-queue", "lead-reply"]);
    expect(board.cards.some((card) => card.pipeline)).toBe(false);
    expect(board.sync).toBeNull();
  });
});
