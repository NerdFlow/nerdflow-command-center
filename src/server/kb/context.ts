import type { KbContextRow, KbTask } from "@/server/kb/types";

const WRITE_KINDS = new Set(["product_truth", "banned_phrase", "message_version", "market_fact", "principle", "learning"]);

/**
 * Approved rows for one task, one ICP, and one channel.
 * Universal rows stay. A different ICP's rows stay out. The rest of the KB stays out.
 */
export function getKbContext(input: {
  entries: KbContextRow[];
  task: KbTask;
  icp?: string | null;
  channel?: "email" | "linkedin" | "call" | null;
}): KbContextRow[] {
  const icp = input.icp?.trim().toLowerCase() || null;
  return input.entries.filter((entry) => {
    if (entry.status !== "approved") return false;
    if (!icpMatches(entry, icp)) return false;
    if (!taskMatches(entry, input.task, input.channel ?? null)) return false;
    return true;
  });
}

export function renderKbContext(rows: KbContextRow[], maxChars = 14000): string {
  const parts: string[] = [];
  let used = 0;
  for (const row of rows) {
    const chunk = `## ${row.kind}: ${row.title}\n${row.body.trim()}\n`;
    if (used + chunk.length > maxChars) break;
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join("\n");
}

function icpMatches(entry: KbContextRow, icp: string | null): boolean {
  if (entry.scope === "universal" || !entry.icp) return true;
  if (!icp) return false;
  return entry.icp.trim().toLowerCase() === icp;
}

function taskMatches(entry: KbContextRow, task: KbTask, channel: "email" | "linkedin" | "call" | null): boolean {
  const payload = entry.payload ?? {};
  const tasks = Array.isArray(payload.tasks) ? payload.tasks.map(String) : [];
  if (task === "write_outreach") {
    if (!WRITE_KINDS.has(entry.kind)) return false;
    if (entry.kind === "market_fact" && payload.safeToQuote !== true && payload.doNotQuote !== true) return false;
    if (entry.kind === "message_version" && !versionMatchesChannel(payload.channel, channel)) return false;
    if (entry.kind === "principle" || entry.kind === "learning") return tasks.includes("write_outreach");
    if (entry.kind === "product_truth" || entry.kind === "banned_phrase") return true;
    if (entry.kind === "market_fact" || entry.kind === "message_version") return tasks.length === 0 || tasks.includes("write_outreach");
    return false;
  }
  if (task === "quote_stat") return entry.kind === "market_fact" && payload.safeToQuote === true;
  if (task === "customer_story") return entry.kind === "proof" && payload.permissionToName === true;
  if (task === "score_leads") return entry.kind === "buying_signal" && tasks.includes("score_leads");
  if (task === "answer_reply") {
    if (entry.kind === "product_truth") return true;
    if (entry.kind === "objection" || entry.kind === "principle" || entry.kind === "banned_phrase") return tasks.includes("answer_reply");
    return false;
  }
  if (task === "talk_price") {
    if (entry.kind === "product_truth") return true;
    return (entry.kind === "competitor" || entry.kind === "principle") && tasks.includes("talk_price");
  }
  if (task === "prep_discovery") {
    return (entry.kind === "buyer_profile" || entry.kind === "principle") && tasks.includes("prep_discovery");
  }
  return false;
}

function versionMatchesChannel(value: unknown, channel: "email" | "linkedin" | "call" | null): boolean {
  const versionChannel = typeof value === "string" ? value : "";
  if (!channel || channel === "call") return versionChannel === "email" || versionChannel === "subject";
  if (channel === "linkedin") return versionChannel === "linkedin";
  return versionChannel === "email" || versionChannel === "subject";
}
