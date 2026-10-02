import { mailtoUrl } from "@/lib/outreachLinks";

/** Sales Pipeline workbook. Today tab is the queue; Tonight is not read. */
export const PIPELINE_SPREADSHEET_ID = "1u5D8vGJJGKLDPbkPHVeg1KtXTL_ieMQ-1_69UxJd7zY";
export const PIPELINE_TODAY_SHEET_ID = 525866747;
export const PIPELINE_WRITEBACK_TAB = "Flow writeback";
/** Titan account the rep sends from. Mailto never sets From and never sends. */
export const TITAN_FROM = "muqeet@nerdflow.tech";

export const PIPELINE_COLUMNS = ["Time", "Name", "Company", "Action", "Link", "Message", "Done"] as const;

export type PipelineLinkKind = "mailto" | "linkedin_profile" | "contact_form" | "none";

export type PipelineActionKind =
  | "send_email"
  | "linkedin_request"
  | "reply"
  | "contact_form"
  | "follow_up"
  | "next_action";

/** Cold rows are Done/Skip. Reply and follow-up add Needs follow-up. Next actions are Done plus Needs follow-up. */
export type PipelineOutcomeMode = "done_skip" | "done_skip_followup" | "done_followup";

export const OUTCOME_DONE = "Done";
export const OUTCOME_SKIP = "Skip";
export const OUTCOME_FOLLOW_UP = "Needs follow-up";

export function outcomeLabels(mode: PipelineOutcomeMode): string[] {
  if (mode === "done_followup") return [OUTCOME_DONE, OUTCOME_FOLLOW_UP];
  if (mode === "done_skip_followup") return [OUTCOME_DONE, OUTCOME_SKIP, OUTCOME_FOLLOW_UP];
  return [OUTCOME_DONE, OUTCOME_SKIP];
}

export type ParsedMailto = { to: string; subject: string; body: string };

export type MappedPipelineRow = {
  sheetRow: number;
  timeLabel: string;
  contactName: string;
  company: string;
  actionLabel: string;
  kind: PipelineActionKind;
  channel: "email" | "linkedin";
  linkKind: PipelineLinkKind;
  linkUrl: string | null;
  mailtoTo: string | null;
  mailtoSubject: string | null;
  message: string;
  blankMessage: boolean;
  connectNoNote: boolean;
  outcomeMode: PipelineOutcomeMode;
  intel: string;
  sheetDone: boolean;
};

export type PipelineGridResult = {
  rows: MappedPipelineRow[];
  filteredCalls: number;
  blankSkipped: number;
};

/** What Focus renders for one synced row. */
export type PipelineCardView = {
  rowId: string;
  sheetRow: number;
  timeLabel: string;
  actionLabel: string;
  kind: PipelineActionKind;
  channel: "email" | "linkedin";
  linkKind: PipelineLinkKind;
  linkUrl: string | null;
  mailtoTo: string | null;
  mailtoSubject: string | null;
  message: string;
  blankMessage: boolean;
  connectNoNote: boolean;
  outcomeMode: PipelineOutcomeMode;
  intel: string;
  company: string;
};

export function pktDateStamp(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function queueDateAsUtc(stamp: string): Date {
  return new Date(`${stamp}T00:00:00.000Z`);
}

export function pipelinePersonKey(company: string, name: string): string {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return `pipeline:${normalize(company)}|${normalize(name)}`;
}

export function pipelineExternalKey(queueDate: string, sheetRow: number): string {
  return `${PIPELINE_SPREADSHEET_ID}:${PIPELINE_TODAY_SHEET_ID}:${queueDate}:${sheetRow}`;
}

/** Sheet-synced rows use this prefix. API card ids do not, so a sheet sync can leave them alone. */
export function isSheetExternalKey(externalKey: string): boolean {
  return externalKey.startsWith(`${PIPELINE_SPREADSHEET_ID}:${PIPELINE_TODAY_SHEET_ID}:`);
}

export function dateStampFromDb(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Column G writeback only for a real Today-tab row. API cards store a display order, not a sheet row. */
export function sheetRowForWriteback(externalKey: string, sheetRow: number): number | null {
  if (!isSheetExternalKey(externalKey) || sheetRow <= 0) return null;
  return sheetRow;
}

export function focusTodayOwnerCandidates(domain: string | null | undefined, envEmail: string | null | undefined): string[] {
  const emails = [envEmail, domain ? `muqeet@${domain.trim().toLowerCase()}` : null, "muqeet@nerdflow.tech"];
  const unique = new Set<string>();
  for (const email of emails) {
    const cleaned = email?.trim().toLowerCase();
    if (cleaned) unique.add(cleaned);
  }
  return [...unique];
}

export function pickFocusTodayOwner<T extends { email: string; fullName: string }>(users: T[], candidates: string[]): T | null {
  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  for (const email of candidates) {
    const hit = byEmail.get(email);
    if (hit) return hit;
  }
  const local = users.find((user) => user.email.toLowerCase().startsWith("muqeet@"));
  if (local) return local;
  return users.find((user) => user.fullName.trim().toLowerCase() === "muqeet") ?? null;
}

export function formatPktChip(raw: string): string {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text || text === "—" || text === "-" || text === "–") return "—";
  if (/PKT/i.test(text)) return text.replace(/pkt/gi, "PKT");
  return `${text} PKT`;
}

export function pipelineTimeChip(kind: PipelineActionKind, timeLabel: string, actionLabel: string): string {
  if (kind === "send_email" || kind === "contact_form") return `Emails · ${timeLabel}`;
  if (kind === "linkedin_request") return `LinkedIn · ${timeLabel}`;
  if (kind === "reply") return `Reply · ${timeLabel}`;
  if (kind === "follow_up") return `Follow-up · ${timeLabel}`;
  const label = actionLabel.trim() || "Next";
  return `${label} · ${timeLabel}`;
}

export function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

export function parseSheetDone(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const text = String(value).trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1" || text === "x" || text === "done";
}

function firstHyperlinkArg(raw: string): string | null {
  const match = raw.match(/HYPERLINK\(\s*"((?:[^"]|"")*)"|HYPERLINK\(\s*'((?:[^']|'')*)'/i);
  if (!match) return null;
  const value = match[1] ?? match[2] ?? "";
  return value.replace(/""/g, '"').replace(/''/g, "'");
}

function decodeMailtoPart(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

/** Formula or raw mailto. Display text such as "Open in Titan → ada@…" is not a URL. */
export function parseMailtoTarget(raw: string): ParsedMailto | null {
  const text = raw.trim();
  if (!text) return null;
  const fromFormula = firstHyperlinkArg(text);
  const source = fromFormula ?? text;
  const embedded = source.match(/mailto:[^\s"']+/i);
  if (!embedded) {
    const display = text.match(/Open in Titan\s*(?:→|->)\s*([^\s"'<>]+@[^\s"'<>]+)/i);
    if (!display?.[1]) return null;
    return { to: display[1].replace(/[).,]+$/, ""), subject: "", body: "" };
  }
  const withoutScheme = embedded[0].replace(/^mailto:/i, "");
  const splitAt = withoutScheme.indexOf("?");
  const addrPart = splitAt === -1 ? withoutScheme : withoutScheme.slice(0, splitAt);
  const query = splitAt === -1 ? "" : withoutScheme.slice(splitAt + 1);
  const to = decodeMailtoPart(addrPart).trim();
  if (!to.includes("@")) return null;
  const params = new URLSearchParams(query);
  return {
    to,
    subject: params.get("subject") ?? "",
    body: params.get("body") ?? "",
  };
}

function extractHttpUrl(raw: string): string | null {
  const source = firstHyperlinkArg(raw) ?? raw;
  if (/^mailto:/i.test(source.trim())) return null;
  const match = source.match(/https?:\/\/[^\s"')]+/i);
  if (!match?.[0]) return null;
  return match[0].replace(/[),]+$/, "");
}

export function inspectLink(raw: string): { linkKind: PipelineLinkKind; url: string | null; mailto: ParsedMailto | null } {
  const mailto = parseMailtoTarget(raw);
  if (mailto && /mailto:/i.test(firstHyperlinkArg(raw) ?? raw)) {
    return { linkKind: "mailto", url: null, mailto };
  }
  const http = extractHttpUrl(raw);
  if (http && /linkedin\.com/i.test(http)) return { linkKind: "linkedin_profile", url: http, mailto: null };
  if (http) return { linkKind: "contact_form", url: http, mailto: null };
  if (mailto) return { linkKind: "mailto", url: null, mailto };
  return { linkKind: "none", url: null, mailto: null };
}

function normalizeAction(action: string): string {
  return action.trim().toLowerCase().replace(/\s+/g, " ");
}

function isCallAction(action: string): boolean {
  return /^call\b/.test(action) || action === "phone" || action.includes("phone call");
}

export function pipelineMailtoHref(row: Pick<MappedPipelineRow, "linkKind" | "mailtoTo" | "mailtoSubject" | "message" | "company">): string | null {
  if (row.linkKind !== "mailto" || !row.mailtoTo?.includes("@")) return null;
  const subject = row.mailtoSubject?.trim() || `Note for ${row.company}`;
  return mailtoUrl(row.mailtoTo, subject, row.message.trim(), 1800);
}

function intelFor(kind: PipelineActionKind, actionLabel: string, linkKind: PipelineLinkKind): string {
  if (kind === "linkedin_request") return "Connect with no note. The message stays blank.";
  if (kind === "send_email") return "Open in Titan and send it yourself.";
  if (kind === "contact_form") return "Open the form and paste the message.";
  if (kind === "reply") return "Reply with the draft. This is not a connection request.";
  if (kind === "follow_up") {
    if (linkKind === "mailto") return "Follow-up by email.";
    if (linkKind === "linkedin_profile") return "Follow-up on their LinkedIn profile.";
    if (linkKind === "contact_form") return "Follow-up on the contact form.";
    return actionLabel || "Follow-up";
  }
  return "Pipeline next action. No call from here.";
}

function mapDataRow(sheetRow: number, cells: string[]): MappedPipelineRow | "call" | "blank" {
  const time = cells[0] ?? "";
  const name = (cells[1] ?? "").trim();
  const companyRaw = (cells[2] ?? "").trim();
  const actionRaw = (cells[3] ?? "").trim();
  const linkRaw = cells[4] ?? "";
  const messageRaw = (cells[5] ?? "").trim();
  const done = parseSheetDone(cells[6] ?? "");
  const action = normalizeAction(actionRaw);
  if (!name && !companyRaw && !action) return "blank";
  if (isCallAction(action)) return "call";

  const company = companyRaw || name || "Unknown";
  const link = inspectLink(linkRaw);
  let kind: PipelineActionKind = "next_action";
  if (action.includes("linkedin request") || action === "connection request" || action.includes("connect on linkedin")) {
    kind = "linkedin_request";
  } else if (action.startsWith("reply") || action.includes("reply to")) {
    kind = "reply";
  } else if (action.includes("follow-up") || action.includes("follow up") || action.includes("followup")) {
    kind = "follow_up";
  } else if (action.includes("contact form")) {
    kind = "contact_form";
  } else if (action.includes("send email") || action === "email" || action.startsWith("email ")) {
    kind = link.linkKind === "contact_form" ? "contact_form" : "send_email";
  }

  let linkKind = link.linkKind;
  let message = messageRaw;
  let connectNoNote = false;
  let blankMessage = false;
  let channel: "email" | "linkedin" = "email";

  if (kind === "linkedin_request") {
    linkKind = "linkedin_profile";
    message = "";
    connectNoNote = true;
    blankMessage = true;
    channel = "linkedin";
  } else if (kind === "send_email") {
    linkKind = link.linkKind === "mailto" ? "mailto" : "none";
    if (!message && link.mailto?.body) message = link.mailto.body.trim();
    channel = "email";
  } else if (kind === "contact_form") {
    linkKind = link.linkKind === "contact_form" ? "contact_form" : link.linkKind === "mailto" ? "mailto" : "contact_form";
    if (linkKind === "mailto" && !message && link.mailto?.body) message = link.mailto.body.trim();
    channel = "email";
  } else if (kind === "reply") {
    connectNoNote = false;
    if (link.linkKind === "mailto") {
      linkKind = "mailto";
      channel = "email";
      if (!message && link.mailto?.body) message = link.mailto.body.trim();
    } else {
      linkKind = "linkedin_profile";
      channel = "linkedin";
    }
  } else if (kind === "follow_up") {
    if (link.linkKind === "mailto") {
      linkKind = "mailto";
      channel = "email";
      if (!message && link.mailto?.body) message = link.mailto.body.trim();
    } else if (link.linkKind === "linkedin_profile") {
      linkKind = "linkedin_profile";
      channel = "linkedin";
    } else if (link.linkKind === "contact_form") {
      linkKind = "contact_form";
      channel = "email";
    } else {
      linkKind = "none";
      channel = "email";
    }
  } else {
    linkKind = "none";
    channel = "email";
  }

  const outcomeMode: PipelineOutcomeMode =
    kind === "reply" || kind === "follow_up" ? "done_skip_followup" : kind === "next_action" ? "done_followup" : "done_skip";

  const linkUrl = linkKind === "linkedin_profile" || linkKind === "contact_form" ? link.url : null;

  return {
    sheetRow,
    timeLabel: formatPktChip(time),
    contactName: name,
    company,
    actionLabel: actionRaw || kind,
    kind,
    channel,
    linkKind,
    linkUrl,
    mailtoTo: linkKind === "mailto" ? link.mailto?.to ?? null : null,
    mailtoSubject: linkKind === "mailto" ? link.mailto?.subject ?? null : null,
    message,
    blankMessage,
    connectNoNote,
    outcomeMode,
    intel: intelFor(kind, actionRaw, linkKind),
    sheetDone: done,
  };
}

function looksLikeHeader(cells: string[]): boolean {
  const a = (cells[0] ?? "").trim().toLowerCase();
  const b = (cells[1] ?? "").trim().toLowerCase();
  const d = (cells[3] ?? "").trim().toLowerCase();
  return a === "time" && (b === "name" || d === "action");
}

/** Today tab columns A–G. Header row optional. Call rows are removed. Done rows stay so sync can hide them. */
export function mapPipelineGrid(grid: string[][]): PipelineGridResult {
  const rows: MappedPipelineRow[] = [];
  let filteredCalls = 0;
  let blankSkipped = 0;
  const start = grid.length > 0 && looksLikeHeader(grid[0] ?? []) ? 1 : 0;
  for (let index = start; index < grid.length; index += 1) {
    const cells = grid[index] ?? [];
    const mapped = mapDataRow(index + 1, cells);
    if (mapped === "blank") {
      blankSkipped += 1;
      continue;
    }
    if (mapped === "call") {
      filteredCalls += 1;
      continue;
    }
    rows.push(mapped);
  }
  return { rows, filteredCalls, blankSkipped };
}

export function parseTable(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "").trim();
  if (!source) return [];
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] ?? "";
    const next = source[i + 1] ?? "";
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function viewFromMapped(rowId: string, row: MappedPipelineRow): PipelineCardView {
  return {
    rowId,
    sheetRow: row.sheetRow,
    timeLabel: row.timeLabel,
    actionLabel: row.actionLabel,
    kind: row.kind,
    channel: row.channel,
    linkKind: row.linkKind,
    linkUrl: row.linkUrl,
    mailtoTo: row.mailtoTo,
    mailtoSubject: row.mailtoSubject,
    message: row.message,
    blankMessage: row.blankMessage,
    connectNoNote: row.connectNoNote,
    outcomeMode: row.outcomeMode,
    intel: row.intel,
    company: row.company,
  };
}
