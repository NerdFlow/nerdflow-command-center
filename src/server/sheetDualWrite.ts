/**
 * TODO(sheet-dual-write): Sales Pipeline Google Sheet write is not wired.
 * This repo has no Sheets client. App DB + audit_log are the source of truth.
 *
 * When a client exists, append one row per Done, Skip, and Flow coach confirm:
 * date, time_pkt, action, lead_id, contact_name, business_name, channel,
 * outcome (done | skip | coach_logged), actor_id, note, next_step
 *
 * Do not send the message from that job. The rep still sends from Titan or LinkedIn.
 */
export const SHEET_DUAL_WRITE_TODO = "not_configured";

export type SheetDualWriteEvent = {
  action: string;
  leadId: string;
  channel: string;
  outcome: string;
  actorId: string;
  nextStep?: string | null;
};

export function sheetDualWrite(_event: SheetDualWriteEvent): { wrote: false; todo: typeof SHEET_DUAL_WRITE_TODO } {
  return { wrote: false, todo: SHEET_DUAL_WRITE_TODO };
}
