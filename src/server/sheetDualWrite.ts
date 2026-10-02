import { appendWritebackRow, markTodayRowDone, sheetsConfigured } from "@/server/googleSheets";
import { PIPELINE_SPREADSHEET_ID, PIPELINE_TODAY_SHEET_ID, pktDateStamp } from "@/lib/pipelineToday";

/**
 * Done / Skip / Needs follow-up writeback toward the Sales Pipeline sheet.
 *
 * Column order on the `Flow writeback` tab (create that tab and share the
 * workbook with the service account before this can append):
 * date, time_pkt, action, lead_id, contact_name, business_name, channel,
 * outcome (done | skip | needs_follow_up | coach_logged), actor_id, note,
 * next_step, sheet_row, spreadsheet_id, today_sheet_id, done_cell
 *
 * `note` is the action label, never the draft. Done also sets Today column G
 * to TRUE when sheet_row is known. A missing credential or a failed request
 * does not block the Focus outcome — the app row is already saved.
 */
export const SHEET_WRITEBACK_FIELDS = [
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
] as const;

export const SHEET_DUAL_WRITE_TODO = "not_configured";

export type SheetDualWriteEvent = {
  action: string;
  leadId: string;
  channel: string;
  outcome: string;
  actorId: string;
  nextStep?: string | null;
  contactName?: string | null;
  businessName?: string | null;
  note?: string | null;
  sheetRow?: number | null;
  timePkt?: string | null;
  queueDate?: string | null;
};

export type SheetDualWriteResult = {
  wrote: boolean;
  todo: "not_configured" | "written" | "failed";
  fields: readonly string[];
  detail?: string;
};

export function sheetDualWrite(_event: SheetDualWriteEvent): SheetDualWriteResult {
  return {
    wrote: false,
    todo: sheetsConfigured() ? "failed" : "not_configured",
    fields: SHEET_WRITEBACK_FIELDS,
    detail: sheetsConfigured() ? "use trySheetDualWrite" : SHEET_DUAL_WRITE_TODO,
  };
}

export async function trySheetDualWrite(event: SheetDualWriteEvent): Promise<SheetDualWriteResult> {
  if (!sheetsConfigured()) {
    return { wrote: false, todo: "not_configured", fields: SHEET_WRITEBACK_FIELDS, detail: SHEET_DUAL_WRITE_TODO };
  }
  const doneCell = event.outcome === "done" && event.sheetRow ? `G${event.sheetRow}` : "";
  const values = [
    event.queueDate || pktDateStamp(),
    event.timePkt || "",
    event.action,
    event.leadId,
    event.contactName || "",
    event.businessName || "",
    event.channel,
    event.outcome,
    event.actorId,
    event.note || "",
    event.nextStep || "",
    event.sheetRow ? String(event.sheetRow) : "",
    PIPELINE_SPREADSHEET_ID,
    String(PIPELINE_TODAY_SHEET_ID),
    doneCell,
  ];
  const appended = await appendWritebackRow(values);
  const marked = event.outcome === "done" && event.sheetRow ? await markTodayRowDone(event.sheetRow) : { ok: true as const };
  if (appended.ok && marked.ok) return { wrote: true, todo: "written", fields: SHEET_WRITEBACK_FIELDS };
  const detail = [appended.ok ? "" : appended.detail, "ok" in marked && marked.ok ? "" : "detail" in marked ? marked.detail : ""]
    .filter(Boolean)
    .join("; ");
  console.error(`[sheet-dual-write] ${detail || "failed"}`);
  if (appended.ok || marked.ok) {
    return { wrote: true, todo: "written", fields: SHEET_WRITEBACK_FIELDS, detail: detail || "partial" };
  }
  return { wrote: false, todo: "failed", fields: SHEET_WRITEBACK_FIELDS, detail: detail || "failed" };
}
