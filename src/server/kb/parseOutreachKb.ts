import { applyProductLocks } from "@/server/kb/lockedTruth";
import type { KbLayerName, KbScopeName, KbSeedEntry, KbStatusName, KbTask } from "@/server/kb/types";

const ICP = "contractors";

type FileInput = { path: string; markdown: string };

export function parseOutreachKbFiles(files: FileInput[]): KbSeedEntry[] {
  const entries: KbSeedEntry[] = [];
  for (const file of files) {
    const name = file.path.split("/").pop() ?? file.path;
    if (name.startsWith("00-")) entries.push(...parseStartHere(file));
    else if (name.startsWith("01-")) entries.push(...parseSalesCraft(file));
    else if (name.startsWith("02-")) entries.push(...parseProspectLanguage(file));
    else if (name.startsWith("03-")) entries.push(...parseBuyerProfiles(file));
    else if (name.startsWith("04-")) entries.push(...parseCompetitors(file));
    else if (name.startsWith("05-")) entries.push(...parseObjections(file));
    else if (name.startsWith("06-")) entries.push(...parseBuyingSignals(file));
    else if (name.startsWith("07-")) entries.push(...parseMarketFacts(file));
    else if (name.startsWith("09-")) entries.push(...parseProof(file));
    else if (name.startsWith("10-")) entries.push(...parseMessagePrinciples(file));
    else if (name.startsWith("11-")) entries.push(...parseLearnings(file));
    else if (name.startsWith("12-")) entries.push(...parseTemplate(file));
  }
  return dedupe(applyProductLocks(entries));
}

function parseStartHere(file: FileInput): KbSeedEntry[] {
  const rules = sectionBody(file.markdown, "3. Non-negotiable rules")
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s+/, "").replace(/\*\*/g, "").trim())
    .filter((line) => line.length > 20 && !line.startsWith("#"));
  const rows = rules.map((rule, index) =>
    entry({
      key: `principle:start:${index + 1}`,
      layer: "sales_craft",
      kind: "principle",
      icp: null,
      scope: "universal",
      status: "approved",
      title: `Non-negotiable ${index + 1}`,
      body: rule,
      tasks: ["write_outreach", "answer_reply", "talk_price", "prep_discovery", "quote_stat", "customer_story", "score_leads"],
      sourcePath: file.path,
    }),
  );
  rows.push(
    entry({
      key: "principle:authority",
      layer: "sales_craft",
      kind: "principle",
      icp: null,
      scope: "universal",
      status: "approved",
      title: "Order of authority",
      body: "Product Truth wins. Then ethics and compliance. Then approved learnings. Then Message Principles. Then everything else. If Product Truth is silent, do not guess.",
      tasks: ["write_outreach", "answer_reply", "talk_price"],
      sourcePath: file.path,
    }),
  );
  return rows;
}

function parseSalesCraft(file: FileInput): KbSeedEntry[] {
  const rows: KbSeedEntry[] = [];
  for (const block of headingBlocks(file.markdown, 3)) {
    const section = block.heading.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? "";
    const tasks = tasksForSalesSection(section);
    const banned = /9\.2/.test(block.heading);
    rows.push(
      entry({
        key: `principle:sales:${slug(block.heading)}`,
        layer: "sales_craft",
        kind: "principle",
        icp: null,
        scope: "universal",
        status: banned ? "approved" : "approved",
        title: block.heading,
        body: block.body.trim(),
        tasks,
        sourcePath: file.path,
        extra: { section },
      }),
    );
    if (banned) rows.push(...bannedPhrases(block.body, file.path));
  }
  rows.push(...messagePrincipleBanned(file.path));
  return rows;
}

function tasksForSalesSection(section: string): KbTask[] {
  if (section.startsWith("2") || section.startsWith("9") || section.startsWith("10") || section.startsWith("1") || section === "7.1") {
    return ["write_outreach"];
  }
  if (section.startsWith("3")) return ["prep_discovery"];
  if (section.startsWith("4") || section.startsWith("8")) return ["answer_reply"];
  if (section.startsWith("5")) return ["talk_price"];
  return [];
}

function bannedPhrases(body: string, sourcePath: string): KbSeedEntry[] {
  const phrases = new Set<string>();
  for (const line of body.split("\n")) {
    if (!line.trim().startsWith("-")) continue;
    const cleaned = line.replace(/^-\s+/, "").replace(/\*\*/g, "");
    const parts = cleaned.split("/").map((part) => part.replace(/\([^)]*\)/g, "").replace(/[“”"]/g, "").trim());
    for (let part of parts) {
      part = part.replace(/\.$/, "").trim();
      if (part.length < 3 || part.length > 80) continue;
      if (/^excessive /i.test(part)) continue;
      phrases.add(part);
    }
  }
  return [...phrases].map((phrase) =>
    entry({
      key: `banned_phrase:${slug(phrase)}`,
      layer: "sales_craft",
      kind: "banned_phrase",
      icp: null,
      scope: "universal",
      status: "approved",
      title: phrase,
      body: phrase,
      tasks: ["write_outreach", "answer_reply"],
      sourcePath,
    }),
  );
}

function messagePrincipleBanned(sourcePath: string): KbSeedEntry[] {
  return ["AI-powered", "streamline", "hope this finds you well"].map((phrase) =>
    entry({
      key: `banned_phrase:${slug(phrase)}`,
      layer: "sales_craft",
      kind: "banned_phrase",
      icp: null,
      scope: "universal",
      status: "approved",
      title: phrase,
      body: phrase,
      tasks: ["write_outreach", "answer_reply"],
      sourcePath,
    }),
  );
}

function parseProspectLanguage(file: FileInput): KbSeedEntry[] {
  const rows: KbSeedEntry[] = [];
  let theme = "general";
  for (const line of file.markdown.split("\n")) {
    const heading = /^##\s+(.+)/.exec(line);
    if (heading) theme = heading[1] ?? theme;
    const quote = /^\d+\.\s+(.+)$/.exec(line);
    if (!quote) continue;
    const text = quote[1] ?? "";
    const url = text.match(/https?:\/\/\S+/)?.[0]?.replace(/[).,]+$/, "") ?? null;
    rows.push(
      entry({
        key: `prospect_language:${slug(text).slice(0, 70)}`,
        layer: "icp",
        kind: "prospect_language",
        icp: ICP,
        scope: "icp",
        status: "pending",
        title: theme,
        body: text.replace(/https?:\/\/\S+/g, "").trim(),
        tasks: [],
        sourcePath: file.path,
        sourceLink: url,
        extra: { polarity: "quote", theme },
      }),
    );
  }
  return rows;
}

function parseBuyerProfiles(file: FileInput): KbSeedEntry[] {
  return headingBlocks(file.markdown, 3)
    .filter((block) => /profile/i.test(block.heading))
    .map((block) =>
      entry({
        key: `buyer_profile:${slug(block.heading)}`,
        layer: "icp",
        kind: "buyer_profile",
        icp: ICP,
        scope: "icp",
        status: "pending",
        title: block.heading,
        body: block.body.trim(),
        tasks: ["prep_discovery"],
        sourcePath: file.path,
      }),
    );
}

function parseCompetitors(file: FileInput): KbSeedEntry[] {
  return headingBlocks(file.markdown, 3)
    .filter((block) => !/pattern|how to talk|comparison/i.test(block.heading))
    .map((block) =>
      entry({
        key: `competitor:${slug(block.heading)}`,
        layer: "icp",
        kind: "competitor",
        icp: ICP,
        scope: "icp",
        status: "pending",
        title: block.heading,
        body: block.body.trim().slice(0, 4000),
        tasks: ["talk_price"],
        sourcePath: file.path,
      }),
    );
}

function parseObjections(file: FileInput): KbSeedEntry[] {
  return headingBlocks(file.markdown, 2)
    .filter((block) => /^\d+\./.test(block.heading))
    .map((block) =>
      entry({
        key: `objection:${slug(block.heading)}`,
        layer: "icp",
        kind: "objection",
        icp: ICP,
        scope: "icp",
        status: "pending",
        title: block.heading,
        body: block.body.trim().slice(0, 5000),
        tasks: ["answer_reply"],
        sourcePath: file.path,
      }),
    );
}

function parseBuyingSignals(file: FileInput): KbSeedEntry[] {
  return headingBlocks(file.markdown, 3).map((block) =>
    entry({
      key: `buying_signal:${slug(block.heading)}`,
      layer: "icp",
      kind: "buying_signal",
      icp: ICP,
      scope: "icp",
      status: "pending",
      title: block.heading,
      body: block.body.trim().slice(0, 2500),
      tasks: ["score_leads"],
      sourcePath: file.path,
    }),
  );
}

function parseMarketFacts(file: FileInput): KbSeedEntry[] {
  const rows: KbSeedEntry[] = [];
  const safe = sectionBody(file.markdown, "9. Safe to quote");
  const items = safe.split(/\n(?=\d+\.\s)/);
  for (const item of items) {
    const title = item.match(/\*\*([^*]+)\*\*/)?.[1]?.trim();
    const quoted = [...item.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "").filter(Boolean);
    if (!title || quoted.length === 0) continue;
    const text = quoted.join(" / ");
    rows.push(
      entry({
        key: `market_fact:safe:${slug(title)}`,
        layer: "icp",
        kind: "market_fact",
        icp: ICP,
        scope: "icp",
        status: "approved",
        title,
        body: text,
        tasks: ["write_outreach", "quote_stat"],
        sourcePath: file.path,
        extra: { safeToQuote: true, sources: sourcesIn(text) },
      }),
    );
  }
  const banned = sectionBody(file.markdown, "10. Do not quote");
  for (const row of tableRows(banned)) {
    const claim = row[0]?.replace(/\*\*/g, "").trim();
    const why = row[1]?.trim() ?? "";
    if (!claim || claim === "Claim") continue;
    rows.push(
      entry({
        key: `market_fact:dont:${slug(claim).slice(0, 60)}`,
        layer: "icp",
        kind: "market_fact",
        icp: ICP,
        scope: "icp",
        status: "approved",
        title: claim,
        body: why,
        tasks: ["write_outreach", "quote_stat"],
        sourcePath: file.path,
        extra: { safeToQuote: false, doNotQuote: true },
      }),
    );
  }
  for (const block of headingBlocks(file.markdown, 2)) {
    if (/safe to quote|do not quote|sources/i.test(block.heading)) continue;
    const bullets = block.body
      .split("\n")
      .map((line) => line.replace(/^-\s+/, "").trim())
      .filter((line) => line.startsWith("**") || /^\d/.test(line) || line.length > 40);
    bullets.slice(0, 8).forEach((bullet, index) => {
      rows.push(
        entry({
          key: `market_fact:research:${slug(block.heading)}:${index}`,
          layer: "icp",
          kind: "market_fact",
          icp: ICP,
          scope: "icp",
          status: "pending",
          title: block.heading,
          body: bullet.replace(/\*\*/g, "").slice(0, 1500),
          tasks: [],
          sourcePath: file.path,
          extra: { safeToQuote: false },
        }),
      );
    });
  }
  return rows;
}

function parseProof(file: FileInput): KbSeedEntry[] {
  const rows: KbSeedEntry[] = [];
  for (const row of tableRows(file.markdown)) {
    const id = row[0]?.trim();
    if (!id || id === "#" || id === "Date") continue;
    const proof = (row[1] ?? "").replace(/\*\*/g, "").trim();
    if (!proof) continue;
    const permission = (row[4] ?? row[3] ?? "").toLowerCase();
    const usable = permission.includes("yes");
    rows.push(
      entry({
        key: `proof:${slug(id)}`,
        layer: "core",
        kind: "proof",
        icp: null,
        scope: "universal",
        status: usable ? "approved" : "pending",
        title: `${id} ${proof}`.trim(),
        body: row.filter(Boolean).join(" · "),
        tasks: usable ? ["customer_story"] : [],
        sourcePath: file.path,
        extra: { permissionToName: usable },
      }),
    );
  }
  rows.push(
    entry({
      key: "principle:proof-use",
      layer: "core",
      kind: "principle",
      icp: null,
      scope: "universal",
      status: "approved",
      title: "How to use proof",
      body: "First email usually has no proof. Never invent customers, numbers, or permission to name someone. If it is not an approved Proof Bank row, leave it out.",
      tasks: ["write_outreach", "customer_story"],
      sourcePath: file.path,
    }),
  );
  return rows;
}

function parseMessagePrinciples(file: FileInput): KbSeedEntry[] {
  const rows: KbSeedEntry[] = [];
  for (const row of tableRows(sectionBody(file.markdown, "1. Components and specs"))) {
    const name = row[1]?.replace(/\*\*/g, "").trim();
    const spec = row[2]?.trim();
    if (!name || name === "Component") continue;
    rows.push(
      entry({
        key: `principle:message:${slug(name)}`,
        layer: "core",
        kind: "principle",
        icp: null,
        scope: "universal",
        status: "approved",
        title: name,
        body: `${name}: ${spec}`,
        tasks: ["write_outreach"],
        sourcePath: file.path,
      }),
    );
  }
  rows.push(
    entry({
      key: "principle:message:global-rules",
      layer: "core",
      kind: "principle",
      icp: null,
      scope: "universal",
      status: "approved",
      title: "Global message rules",
      body: sectionBody(file.markdown, "2. Global rules").trim(),
      tasks: ["write_outreach"],
      sourcePath: file.path,
    }),
  );

  const versions: { id: string; channel: "email" | "linkedin" | "subject"; status: KbStatusName; body: string }[] = [
    { id: "S-A", channel: "subject", status: "approved", body: "your dispatcher opening" },
    { id: "S-B", channel: "subject", status: "pending", body: "after-hours calls at [Company]" },
    { id: "E1-A", channel: "email", status: "approved", body: blockAfter(file.markdown, "**E1-A (Live)**", "**E1-B") },
    { id: "E1-B", channel: "email", status: "pending", body: blockAfter(file.markdown, "**E1-B", "### LinkedIn") },
    { id: "L1-A", channel: "linkedin", status: "approved", body: blockAfter(file.markdown, "**L1-A (Live)**", "### Follow-up day 3") },
    { id: "F3-A", channel: "email", status: "approved", body: blockAfter(file.markdown, "**F3-A (Live)**", "### Follow-up day 7") },
    { id: "F7-A", channel: "email", status: "approved", body: blockAfter(file.markdown, "**F7-A (Live)**", "## 5.") },
  ];
  for (const version of versions) {
    rows.push(
      entry({
        key: `message_version:${version.id}`,
        layer: "icp",
        kind: "message_version",
        icp: ICP,
        scope: "icp",
        status: version.status,
        title: version.id,
        body: version.body.replace(/^>\s?/gm, "").trim(),
        tasks: ["write_outreach"],
        sourcePath: file.path,
        extra: { channel: version.channel, versionId: version.id },
      }),
    );
  }
  return rows;
}

function parseLearnings(file: FileInput): KbSeedEntry[] {
  return [
    entry({
      key: "learning:none-approved",
      layer: "core",
      kind: "learning",
      icp: null,
      scope: "universal",
      status: "approved",
      title: "No approved learnings",
      body: "There are no approved learnings. Do not change message versions or principles from a proposed learning.",
      tasks: ["write_outreach"],
      sourcePath: file.path,
    }),
  ];
}

function parseTemplate(file: FileInput): KbSeedEntry[] {
  return [
    entry({
      key: "icp_template:module",
      layer: "icp",
      kind: "icp_template",
      icp: null,
      scope: "universal",
      status: "draft",
      title: "ICP module template",
      body: file.markdown.trim().slice(0, 4000),
      tasks: [],
      sourcePath: file.path,
    }),
  ];
}

function sourcesIn(text: string): string[] {
  const known = [
    "Search Engine Roundtable",
    "Google",
    "BLS",
    "CallRail",
    "Invoca",
    "ServiceTitan",
    "Angi",
    "Jobber",
    "Housecall Pro",
    "Harvard Business Review",
  ];
  return known.filter((name) => text.toLowerCase().includes(name.toLowerCase()));
}

function entry(input: {
  key: string;
  layer: KbLayerName;
  kind: string;
  icp: string | null;
  scope: KbScopeName;
  status: KbStatusName;
  title: string;
  body: string;
  tasks: KbTask[];
  sourcePath: string;
  sourceLink?: string | null;
  extra?: Record<string, unknown>;
}): KbSeedEntry {
  return {
    key: input.key,
    layer: input.layer,
    kind: input.kind,
    icp: input.icp,
    scope: input.scope,
    status: input.status,
    title: input.title.slice(0, 180),
    body: input.body.trim(),
    payload: { tasks: input.tasks, ...(input.extra ?? {}) },
    sourcePath: input.sourcePath,
    sourceLink: input.sourceLink ?? null,
    version: 1,
  };
}

function headingBlocks(markdown: string, level: number): { heading: string; body: string }[] {
  const lines = markdown.split("\n");
  const blocks: { heading: string; body: string }[] = [];
  let heading = "";
  let body: string[] = [];
  const marker = "#".repeat(level) + " ";
  const flush = () => {
    if (heading) blocks.push({ heading, body: body.join("\n").trim() });
  };
  for (const line of lines) {
    if (line.startsWith(marker) && !line.startsWith(marker + "#")) {
      flush();
      heading = line.slice(marker.length).trim();
      body = [];
      continue;
    }
    if (heading && line.startsWith("#") && line.split(" ")[0]!.length < level) {
      flush();
      heading = "";
      body = [];
      continue;
    }
    if (heading) body.push(line);
  }
  flush();
  return blocks;
}

function sectionBody(markdown: string, titlePart: string): string {
  const blocks = [...headingBlocks(markdown, 2), ...headingBlocks(markdown, 3)];
  return blocks.find((block) => block.heading.includes(titlePart))?.body ?? "";
}

function blockAfter(markdown: string, start: string, end: string): string {
  const from = markdown.indexOf(start);
  if (from === -1) return "";
  const slice = markdown.slice(from + start.length);
  const until = slice.indexOf(end);
  return (until === -1 ? slice : slice.slice(0, until)).trim();
}

function tableRows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((line) => line.trim().startsWith("|") && !/^\|\s*-+/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean) && !cells.every((cell) => /^-+$/.test(cell)));
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function dedupe(entries: KbSeedEntry[]): KbSeedEntry[] {
  const seen = new Map<string, KbSeedEntry>();
  for (const entry of entries) {
    if (!entry.body.trim()) continue;
    const existing = seen.get(entry.key);
    if (!existing) {
      seen.set(entry.key, entry);
      continue;
    }
    seen.set(entry.key, entry.body.length > existing.body.length ? entry : existing);
  }
  return [...seen.values()];
}
