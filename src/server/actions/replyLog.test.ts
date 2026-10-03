import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user-1", role: "rep", organizationId: "org-1" };

const { state } = vi.hoisted(() => ({
  state: {
    lead: null as Record<string, unknown> | null,
    reply: null as Record<string, unknown> | null,
    deals: [] as Record<string, unknown>[],
    rows: [] as { id: string; status: string; leadId: string; organizationId: string }[],
    audits: [] as { action: string; entityId?: string | null; after?: unknown }[],
  },
}));

vi.mock("react", () => ({ cache: (fn: (...args: unknown[]) => unknown) => fn }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireUser: async () => user }));
vi.mock("@/server/db", () => ({
  prisma: {
    reply: {
      findFirst: async () => (state.reply ? { ...state.reply, lead: leadView() } : null),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.reply!, data);
        return state.reply;
      },
      delete: async () => {
        state.reply = null;
      },
    },
    lead: {
      findUniqueOrThrow: async () => state.lead,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.lead!, data);
        return state.lead;
      },
    },
    deal: {
      findFirst: async () => openDeal(),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const deal = {
          id: "deal-1",
          people: [],
          checklist: {},
          stage: "interested",
          updatedAt: new Date(),
          nextStepAt: null,
          nextStepText: null,
          ...data,
        };
        state.deals.push(deal);
        return deal;
      },
      findUniqueOrThrow: async () => ({ ...openDeal(), people: [] }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.deals[0]!, data);
        return state.deals[0];
      },
    },
    pipelineTodayRow: {
      findFirst: async () => null,
      updateMany: async ({ data }: { data: { status: string } }) => {
        let count = 0;
        for (const row of state.rows) {
          if (row.status === "open" && row.organizationId === user.organizationId) {
            row.status = data.status;
            count += 1;
          }
        }
        return { count };
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string; entityId?: string | null; after?: unknown } }) => {
        state.audits.push(data);
        return data;
      },
    },
  },
}));

import { confirmLoggedReply } from "@/server/actions/replies";

function leadView() {
  return {
    ...state.lead,
    campaign: {
      id: "camp-1",
      productId: "prod-1",
      strategy: {},
      product: { name: "NerdFlow", summary: "Sites" },
    },
    owner: { id: "user-1", timezone: "Asia/Karachi", workingHours: { start: "09:00", end: "17:00" } },
  };
}

function openDeal() {
  return state.deals.find((deal) => deal.stage !== "won" && deal.stage !== "lost") ?? null;
}

describe("confirmLoggedReply", () => {
  beforeEach(() => {
    state.lead = {
      id: "lead-1",
      ownerId: "user-1",
      organizationId: "org-1",
      campaignId: "camp-1",
      status: "in_cadence",
      signals: {},
      nextTouchAt: new Date(),
      nextChannelOverride: "email",
    };
    state.reply = {
      id: "reply-1",
      organizationId: "org-1",
      leadId: "lead-1",
      channel: "email",
      text: "Can we talk next month?",
      label: null,
      status: "open",
      responseDraft: null,
    };
    state.deals = [];
    state.rows = [{ id: "row-1", status: "open", leadId: "lead-1", organizationId: "org-1" }];
    state.audits = [];
  });

  it("marks not now as finished, drops the open card, and audits the reply", async () => {
    const result = await confirmLoggedReply({ replyId: "reply-1", label: "not_now" });

    expect(result.status).toBe("finished");
    expect(state.lead?.status).toBe("finished");
    expect(state.lead?.signals).toMatchObject({ stopOutreach: true });
    expect(state.lead?.nextTouchAt).toBeNull();
    expect(state.rows[0]?.status).toBe("dropped");
    expect(state.reply?.status).toBe("handled");
    expect(state.deals).toHaveLength(0);
    expect(state.audits.map((entry) => entry.action)).toContain("reply_logged");
  });

  it("marks unsubscribe as do not contact", async () => {
    await confirmLoggedReply({ replyId: "reply-1", label: "unsubscribe" });

    expect(state.lead?.status).toBe("do_not_contact");
    expect(state.rows[0]?.status).toBe("dropped");
    expect(state.reply?.status).toBe("handled");
    expect(state.audits.map((entry) => entry.action)).toEqual(["lead_do_not_contact", "reply_logged"]);
  });

  it("opens a deal for interested and leaves the reply for a human to send", async () => {
    const result = await confirmLoggedReply({ replyId: "reply-1", label: "interested" });

    expect(result.status).toBe("deal");
    expect(state.lead?.status).toBe("deal");
    expect(state.deals).toHaveLength(1);
    expect(state.deals[0]?.stage).toBe("interested");
    expect(state.reply?.status).toBe("open");
    expect(state.rows[0]?.status).toBe("dropped");
    expect((state.lead?.signals as { stopOutreach?: boolean }).stopOutreach).toBe(true);
  });

  it("books a meeting through the existing deal flow", async () => {
    const when = "2026-10-08T15:00:00.000Z";
    await confirmLoggedReply({ replyId: "reply-1", label: "interested", meetingAt: when, meetingNote: "Demo" });

    expect(state.lead?.status).toBe("deal");
    expect(state.deals[0]?.nextStepText).toBe("Demo");
    expect(state.deals[0]?.nextStepAt).toEqual(new Date(when));
    expect(state.reply?.status).toBe("handled");
    expect(state.rows[0]?.status).toBe("dropped");
  });

  it("keeps a question as replied and still removes the card", async () => {
    await confirmLoggedReply({ replyId: "reply-1", label: "question" });

    expect(state.lead?.status).toBe("replied");
    expect(state.reply?.label).toBe("question");
    expect(state.reply?.status).toBe("open");
    expect(state.rows[0]?.status).toBe("dropped");
    expect(state.deals).toHaveLength(0);
  });
});
