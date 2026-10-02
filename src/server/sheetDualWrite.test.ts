import { describe, expect, it } from "vitest";
import { SHEET_WRITEBACK_FIELDS, sheetDualWrite } from "@/server/sheetDualWrite";

describe("sheet dual write", () => {
  it("lists the writeback fields and does not pretend to write when Sheets is not configured", () => {
    const result = sheetDualWrite({
      action: "pipeline_today_outcome",
      leadId: "lead",
      channel: "email",
      outcome: "done",
      actorId: "muqeet",
      sheetRow: 4,
    });
    expect(result.wrote).toBe(false);
    expect(result.todo).toBe("not_configured");
    expect(result.fields).toEqual([
      "date",
      "time_pkt",
      "action",
      "lead_id",
      "contact_name",
      "business_name",
      "channel",
      "outcome",
      "actor_id",
      "note",
      "next_step",
      "sheet_row",
      "spreadsheet_id",
      "today_sheet_id",
      "done_cell",
    ]);
    expect(SHEET_WRITEBACK_FIELDS).not.toContain("message");
  });
});
