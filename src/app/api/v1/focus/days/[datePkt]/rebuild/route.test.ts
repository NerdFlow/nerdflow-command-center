import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FocusIngestError } from "@/server/pipelineTodayOutcome";

const { applyFocusIngestRebuild } = vi.hoisted(() => ({
  applyFocusIngestRebuild: vi.fn(),
}));

vi.mock("@/server/focusIngest", () => ({
  applyFocusIngestRebuild,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { PUT } from "@/app/api/v1/focus/days/[datePkt]/rebuild/route";

const SECRET = "ingest-test-secret";

function request() {
  return new NextRequest("https://sales.nerdflow.cloud/api/v1/focus/days/2026-10-02/rebuild", {
    method: "PUT",
    headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({
      owner: "muqeet",
      datePkt: "2026-10-02",
      source: "today-rebuild",
      cards: [
        {
          cardId: "2026-10-02-hphs-lee-li",
          name: "Lee Kurtas",
          company: "High Performance Home Systems",
          action: "LinkedIn request",
          link: { kind: "linkedin_profile", url: "https://www.linkedin.com/in/lee-kurtas-7790b225" },
          message: "Hi Lee, secret outreach body",
        },
      ],
    }),
  });
}

describe("focus rebuild route errors", () => {
  beforeEach(() => {
    process.env.FOCUS_INGEST_SECRET = SECRET;
    applyFocusIngestRebuild.mockReset();
  });

  it("logs the Prisma code and message without the card body, and returns db_busy", async () => {
    const err = new Error(
      "Invalid `prisma.pipelineTodayRow.upsert()` invocation:\n{\n  message: \"Hi Lee, secret outreach body\"\n}\nTransaction API error: Transaction already closed. The timeout for this transaction was 5000 ms, however 5900 ms passed since the start of the transaction.",
    );
    err.name = "PrismaClientKnownRequestError";
    Object.assign(err, { code: "P2028", clientVersion: "5.20.0" });
    applyFocusIngestRebuild.mockRejectedValue(err);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await PUT(request(), { params: { datePkt: "2026-10-02" } });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Couldn't save the Today queue", code: "db_busy" });
    expect(spy).toHaveBeenCalledWith(
      "[focus-ingest] rebuild failed",
      expect.objectContaining({ code: "P2028", name: "PrismaClientKnownRequestError" }),
    );
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("5000 ms");
    expect(logged).not.toContain("secret outreach");
    spy.mockRestore();
  });

  it("returns save_failed for a non-database error", async () => {
    applyFocusIngestRebuild.mockRejectedValue(new Error("column missing"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await PUT(request(), { params: { datePkt: "2026-10-02" } });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Couldn't save the Today queue", code: "save_failed" });
    expect(spy).toHaveBeenCalledWith(
      "[focus-ingest] rebuild failed",
      expect.objectContaining({ code: null, message: "column missing" }),
    );
    spy.mockRestore();
  });

  it("still returns FocusIngestError status without the generic save body", async () => {
    applyFocusIngestRebuild.mockRejectedValue(new FocusIngestError(409, "Card already belongs to 2026-10-01", { cardId: "x" }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await PUT(request(), { params: { datePkt: "2026-10-02" } });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Card already belongs to 2026-10-01", cardId: "x" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
