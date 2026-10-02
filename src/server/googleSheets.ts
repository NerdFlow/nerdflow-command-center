import { readFileSync } from "fs";
import { createSign } from "crypto";
import {
  PIPELINE_SPREADSHEET_ID,
  PIPELINE_TODAY_SHEET_ID,
  PIPELINE_WRITEBACK_TAB,
  cellToString,
} from "@/lib/pipelineToday";

type ServiceAccount = { client_email: string; private_key: string };

export type SheetsConfigStatus =
  | { configured: true; email: string }
  | { configured: false; reason: string };

let tokenCache: { token: string; exp: number } | null = null;

export function sheetsConfigStatus(): SheetsConfigStatus {
  const inline = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline?.trim()) {
    try {
      const parsed = JSON.parse(inline) as Partial<ServiceAccount>;
      if (!parsed.client_email || !parsed.private_key?.includes("BEGIN")) {
        return { configured: false, reason: "Service account JSON is missing client_email or private_key." };
      }
      return { configured: true, email: parsed.client_email };
    } catch {
      return { configured: false, reason: "GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON is not valid JSON." };
    }
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (path) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ServiceAccount>;
      if (!parsed.client_email || !parsed.private_key?.includes("BEGIN")) {
        return { configured: false, reason: "Service account file is missing client_email or private_key." };
      }
      return { configured: true, email: parsed.client_email };
    } catch {
      return { configured: false, reason: "GOOGLE_APPLICATION_CREDENTIALS could not be read." };
    }
  }
  return { configured: false, reason: "No Google Sheets service account is configured." };
}

export function sheetsConfigured(): boolean {
  return sheetsConfigStatus().configured;
}

function loadServiceAccount(): ServiceAccount | null {
  const status = sheetsConfigStatus();
  if (!status.configured) return null;
  const inline = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline?.trim()) return JSON.parse(inline) as ServiceAccount;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8")) as ServiceAccount;
}

function signServiceJwt(account: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  return `${data}.${signer.sign(account.private_key).toString("base64url")}`;
}

async function accessToken(): Promise<string> {
  const account = loadServiceAccount();
  if (!account) throw new Error("Sheets credentials are not configured");
  const now = Date.now();
  if (tokenCache && tokenCache.exp > now + 60_000) return tokenCache.token;
  const assertion = signServiceJwt(account);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Google token response had no access_token");
  tokenCache = { token: json.access_token, exp: now + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

function quoteTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

type SheetTab = { sheetId: number; title: string };

async function listTabs(token: string): Promise<SheetTab[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${PIPELINE_SPREADSHEET_ID}?fields=sheets.properties(sheetId,title)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets metadata HTTP ${res.status}`);
  const json = (await res.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  const tabs: SheetTab[] = [];
  for (const sheet of json.sheets ?? []) {
    const sheetId = sheet.properties?.sheetId;
    const title = sheet.properties?.title;
    if (typeof sheetId === "number" && title) tabs.push({ sheetId, title });
  }
  return tabs;
}

export async function resolveTodayTabTitle(token?: string): Promise<string> {
  const auth = token ?? (await accessToken());
  const tabs = await listTabs(auth);
  const today = tabs.find((tab) => tab.sheetId === PIPELINE_TODAY_SHEET_ID);
  if (!today) throw new Error(`Today tab ${PIPELINE_TODAY_SHEET_ID} was not on the spreadsheet.`);
  return today.title;
}

/**
 * Read the Today tab with FORMULA render so mailto HYPERLINK targets survive.
 * The Tonight tab is never requested.
 */
export async function readPipelineTodayGrid(): Promise<{ ok: true; grid: string[][] } | { ok: false; reason: string }> {
  const status = sheetsConfigStatus();
  if (!status.configured) return { ok: false, reason: status.reason };
  try {
    const token = await accessToken();
    const title = await resolveTodayTabTitle(token);
    const range = encodeURIComponent(`${quoteTitle(title)}!A:G`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${PIPELINE_SPREADSHEET_ID}/values/${range}?valueRenderOption=FORMULA&majorDimension=ROWS`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      return {
        ok: false,
        reason: `Could not read the Today tab (HTTP ${res.status}). Share the sheet with ${status.email}.`,
      };
    }
    const json = (await res.json()) as { values?: unknown[][] };
    const grid = (json.values ?? []).map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return Array.from({ length: 7 }, (_, index) => cellToString(cells[index]));
    });
    return { ok: true, grid };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sheets read failed";
    return { ok: false, reason: message };
  }
}

export async function appendWritebackRow(values: string[]): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (!sheetsConfigured()) return { ok: false, detail: "not_configured" };
  try {
    const token = await accessToken();
    const range = encodeURIComponent(`${quoteTitle(PIPELINE_WRITEBACK_TAB)}!A:A`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${PIPELINE_SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [values] }),
    });
    if (!res.ok) return { ok: false, detail: `append HTTP ${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, detail: "append failed" };
  }
}

export async function markTodayRowDone(sheetRow: number): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (!Number.isInteger(sheetRow) || sheetRow < 1) return { ok: false, detail: "bad sheet row" };
  if (!sheetsConfigured()) return { ok: false, detail: "not_configured" };
  try {
    const token = await accessToken();
    const title = await resolveTodayTabTitle(token);
    const range = encodeURIComponent(`${quoteTitle(title)}!G${sheetRow}`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${PIPELINE_SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [["TRUE"]] }),
    });
    if (!res.ok) return { ok: false, detail: `done cell HTTP ${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, detail: "done cell failed" };
  }
}
