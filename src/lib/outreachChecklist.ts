/**
 * Pre-send checklist for Focus email and LinkedIn cards.
 * Failures are exact sentences the card shows. Blocks stop copy, Titan, and Done.
 * Postal address, opt-out, and mailbox signature only block after Settings has a value.
 */

export type OutreachChannel = "email" | "linkedin";

export type EmailStep = "first" | "later" | "reply";

export type ChecklistIssue = {
  code: string;
  severity: "block" | "warn";
  reason: string;
};

export type SafeQuote = {
  text: string;
  sources: string[];
};

export type ChecklistCatalog = {
  bannedPhrases: string[];
  safeQuotes: SafeQuote[];
  doNotQuote: string[];
};

export type ChecklistSettings = {
  mailboxOwnerName: string | null;
  signatureText: string | null;
  postalAddress: string | null;
  optOutLine: string | null;
};

export type ChecklistInput = {
  channel: OutreachChannel;
  /** Email subject. LinkedIn notes do not need one. */
  subject: string;
  body: string;
  companyName: string;
  openerSourceUrl: string | null;
  emailStep: EmailStep;
  subjectRequired: boolean;
  dnc: boolean;
  catalog: ChecklistCatalog;
  settings: ChecklistSettings;
};

export type ChecklistResult = {
  ok: boolean;
  blocks: ChecklistIssue[];
  warnings: ChecklistIssue[];
};

export const MAX_REGENERATIONS = 3;
export const DEFAULT_DRAFT_DAILY_CAP = 60;

/** Used when the knowledge base has not been seeded yet. Same list the seed writes. */
export const FALLBACK_BANNED_PHRASES = [
  "just checking in",
  "just following up",
  "bumping this up",
  "bumping this",
  "i hope this email finds you well",
  "hope this finds you well",
  "hope you're doing well",
  "hope you are doing well",
  "i'm reaching out because",
  "my name is",
  "revolutionize",
  "game-changer",
  "disrupt",
  "cutting-edge",
  "state-of-the-art",
  "next-generation",
  "synergy",
  "leverage",
  "unlock",
  "empower",
  "seamless",
  "robust",
  "holistic",
  "best-in-class",
  "world-class",
  "all-in-one",
  "end-to-end solution",
  "circle back",
  "touch base",
  "move the needle",
  "low-hanging fruit",
  "quick call",
  "15 minutes of your time",
  "did you get a chance to look at my last email",
  "sorry to bother you",
  "i'd love to pick your brain",
  "act now",
  "limited time",
  "last chance",
  "guaranteed results",
  "100%",
  "never miss a call again",
  "ai-powered",
  "streamline",
];

const EMOJI = /\p{Extended_Pictographic}/u;

const FORBIDDEN: { reason: string; test: (text: string) => boolean }[] = [
  {
    reason: "Claim is not in Product Truth: booking the job or a calendar.",
    test: (text) =>
      /\bbooks?\s+(?:the\s+)?job\b/i.test(text) ||
      /\bbook(?:ing)?\s+into\b/i.test(text) ||
      /\bbook(?:s|ing)?\s+(?:it\s+)?(?:on\s+)?(?:a\s+|your\s+)?calendar\b/i.test(text),
  },
  {
    reason: "Claim is not in Product Truth: texting the on-call tech.",
    test: (text) => /\btext(?:s|ing)?\b[^.\n]{0,48}\b(?:on-?call\s+)?tech\b/i.test(text),
  },
  {
    reason: "Claim is not in Product Truth: FSM or calendar booking.",
    test: (text) =>
      /\b(?:integrat(?:e|es|ion)|books?\s+into|sync(?:s|ing)?\s+with)\b[^.\n]{0,48}\b(?:ServiceTitan|Housecall Pro|Jobber|FieldEdge)\b/i.test(text),
  },
  {
    reason: "Claim is not in Product Truth: answering 24/7.",
    test: (text) => /\b24\s*\/\s*7\b|\b24-7\b|\baround the clock\b/i.test(text),
  },
  {
    reason: "Offer does not match Product Truth. The pilot is 1 week.",
    test: (text) => /\b(?:2|two)\s+weeks\b|\b14[-\s]?days?\b/i.test(text),
  },
];

const CTA_VERB = /\b(want|worth|reply|open to|can i|could i|mind if|interested|let me know|send me|should i)\b/i;

export function checklistApplies(input: {
  channel: string;
  kind: string;
  blankMessage?: boolean;
}): boolean {
  if (input.channel === "call" || input.channel === "instagram") return false;
  if (input.kind === "call" || input.kind === "instagram" || input.kind === "needs_contact" || input.kind === "contact_form") return false;
  if (input.channel === "linkedin" && (input.blankMessage || input.kind === "linkedin_request")) return false;
  if (input.channel === "email") return input.kind === "send_email" || input.kind === "follow_up" || input.kind === "reply" || input.kind === "next_action";
  if (input.channel === "linkedin") return input.kind === "follow_up" || input.kind === "reply" || input.kind === "next_action";
  return false;
}

export function emailStepFor(kind: string, cadenceStep: number): EmailStep {
  if (kind === "reply") return "reply";
  if (kind === "follow_up" || kind === "next_action" || cadenceStep > 0) return "later";
  return "first";
}

export function runPreSendChecklist(input: ChecklistInput): ChecklistResult {
  const blocks: ChecklistIssue[] = [];
  const warnings: ChecklistIssue[] = [];
  const body = input.body ?? "";
  const subject = input.subject ?? "";
  const phrases = input.catalog.bannedPhrases.length > 0 ? input.catalog.bannedPhrases : FALLBACK_BANNED_PHRASES;

  if (input.dnc) {
    blocks.push({ code: "dnc", severity: "block", reason: "Do not contact. Send is blocked." });
  }

  if (input.channel === "email" && input.subjectRequired && input.emailStep !== "reply") {
    checkSubject(subject, input.companyName, blocks);
  } else if (input.channel === "email" && subject.trim() && input.emailStep !== "reply") {
    checkSubject(subject, input.companyName, blocks);
  }

  if (input.channel === "email") {
    const words = wordCount(body);
    if (words > 90) {
      blocks.push({ code: "length", severity: "block", reason: `Email body is ${words} words; the limit is 90.` });
    }
  } else {
    const chars = body.trim().length;
    if (chars > 250) {
      blocks.push({ code: "length", severity: "block", reason: `LinkedIn note is ${chars} characters; the limit is 250.` });
    }
  }

  for (const phrase of phrases) {
    if (containsPhrase(body, phrase) || (subject && containsPhrase(subject, phrase))) {
      blocks.push({ code: "banned", severity: "block", reason: `Banned phrase: "${phrase}".` });
    }
  }

  for (const field of mergeFields(subject + "\n" + body)) {
    blocks.push({ code: "merge", severity: "block", reason: `Unfilled merge field: ${field}.` });
  }

  if (EMOJI.test(subject)) {
    blocks.push({ code: "emoji", severity: "block", reason: "Subject contains an emoji." });
  }
  if (EMOJI.test(body)) {
    blocks.push({ code: "emoji", severity: "block", reason: "Message contains an emoji." });
  }

  const signatureName = input.settings.mailboxOwnerName?.trim() || "";
  if (signatureName) {
    if (!containsPhrase(body, signatureName)) {
      blocks.push({
        code: "signature",
        severity: "block",
        reason: `Signature does not match the sending mailbox. Expected ${signatureName}.`,
      });
    }
  } else if (input.emailStep !== "reply") {
    warnings.push({
      code: "signature",
      severity: "warn",
      reason: "Mailbox signature is not set. This does not block send until you add one in Settings.",
    });
  }

  if (input.channel === "email") {
    const postal = input.settings.postalAddress?.trim() || "";
    const optOut = input.settings.optOutLine?.trim() || "";
    if (postal) {
      if (!body.toLowerCase().includes(postal.toLowerCase())) {
        blocks.push({ code: "postal", severity: "block", reason: "Postal address is missing from the email." });
      }
    } else {
      warnings.push({
        code: "postal",
        severity: "warn",
        reason: "Postal address is not set. This does not block send until you add one in Settings.",
      });
    }
    if (optOut) {
      if (!body.toLowerCase().includes(optOut.toLowerCase())) {
        blocks.push({ code: "opt_out", severity: "block", reason: "Opt-out line is missing from the email." });
      }
    } else {
      warnings.push({
        code: "opt_out",
        severity: "warn",
        reason: "Opt-out line is not set. This does not block send until you add one in Settings.",
      });
    }
  }

  const ctaCount = ctaSentences(body).length;
  if (input.emailStep !== "reply") {
    if (ctaCount === 0) blocks.push({ code: "cta", severity: "block", reason: "Needs one call to action." });
    if (ctaCount > 1) blocks.push({ code: "cta", severity: "block", reason: "More than one call to action." });
  }

  if (input.channel === "email" && input.emailStep === "first" && /(https?:\/\/|www\.)\S+/i.test(body)) {
    blocks.push({ code: "link", severity: "block", reason: "Email 1 cannot contain a link." });
  }

  checkStats(body, input.catalog, blocks);
  checkClaims(stripSignature(body, input.settings.signatureText), blocks);
  checkClaims(subject, blocks);

  if (/\bnerdflow\b/i.test(subject)) {
    blocks.push({ code: "brand", severity: "block", reason: "Subject contains NerdFlow." });
  }
  const bodyWithoutSignature = stripSignature(body, input.settings.signatureText);
  if (/\bnerdflow\b/i.test(bodyWithoutSignature)) {
    blocks.push({ code: "brand", severity: "block", reason: "Cold copy uses NerdFlow. Use ReceptAI." });
  }

  if (input.emailStep !== "reply" && !isHttpUrl(input.openerSourceUrl)) {
    blocks.push({ code: "opener", severity: "block", reason: "Opener needs a source URL. No source, no send." });
  }

  return { ok: blocks.length === 0, blocks, warnings };
}

export function firstHttpUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/https?:\/\/[^\s)]+/i);
    if (match && isHttpUrl(match[0])) return match[0].replace(/[.,]+$/, "");
  }
  return null;
}

export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function checkSubject(subject: string, companyName: string, blocks: ChecklistIssue[]) {
  const trimmed = subject.trim();
  if (!trimmed) {
    blocks.push({ code: "subject", severity: "block", reason: "Subject is missing." });
    return;
  }
  if (/[\r\n]/.test(subject)) {
    blocks.push({ code: "subject", severity: "block", reason: "Subject has a line break." });
  }
  if (/^re:\s/i.test(trimmed)) {
    blocks.push({ code: "subject", severity: "block", reason: "Subject uses a fake Re:." });
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) {
    blocks.push({ code: "subject", severity: "block", reason: `Subject has ${words.length} words; it needs 2 to 6.` });
  }
  if (trimmed.length >= 50) {
    blocks.push({ code: "subject", severity: "block", reason: `Subject is ${trimmed.length} characters; it must be under 50.` });
  }
  const company = companyName.trim();
  const aboutThem = /\byou(?:r|'re)?\b/i.test(trimmed) || (company.length >= 2 && trimmed.toLowerCase().includes(company.toLowerCase()));
  const firstWord = company.split(/\s+/)[0] ?? "";
  const aboutShort = firstWord.length >= 3 && trimmed.toLowerCase().includes(firstWord.toLowerCase());
  if (!aboutThem && !aboutShort) {
    blocks.push({ code: "subject", severity: "block", reason: "Subject is not about them." });
  }
}

function checkStats(body: string, catalog: ChecklistCatalog, blocks: ChecklistIssue[]) {
  const lowered = body.toLowerCase();
  for (const claim of catalog.doNotQuote) {
    const needle = claim.replace(/^["']|["']$/g, "").trim().toLowerCase();
    if (needle.length >= 24 && lowered.includes(needle)) {
      blocks.push({ code: "stat", severity: "block", reason: `Stat is on the do-not-quote list: "${claim}".` });
    }
  }
  const tokens = statTokens(body).filter((token) => !/^\$497\b/.test(token));
  for (const token of tokens) {
    const quote = catalog.safeQuotes.find((item) => item.text.toLowerCase().includes(token.toLowerCase()));
    const sourceNamed = quote?.sources.some((source) => source && lowered.includes(source.toLowerCase())) ?? false;
    if (!quote || !sourceNamed) {
      blocks.push({
        code: "stat",
        severity: "block",
        reason: `Stat "${token}" is not on the Safe-to-quote list with its source named.`,
      });
    }
  }
}

function checkClaims(text: string, blocks: ChecklistIssue[]) {
  for (const rule of FORBIDDEN) {
    if (rule.test(text)) blocks.push({ code: "claim", severity: "block", reason: rule.reason });
  }
}

function statTokens(text: string): string[] {
  const found = text.match(/\b\d+(?:\.\d+)?\s*%|\b\d+\s+in\s+\d+\b|\$\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\d+(?:\.\d+)?\s*[kK]\b/g) ?? [];
  return [...new Set(found.map((token) => token.replace(/\s+/g, " ").trim()))];
}

function ctaSentences(body: string): string[] {
  return body
    .split(/(?<=[?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.includes("?") && CTA_VERB.test(part));
}

function wordCount(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function mergeFields(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{[^{}\n]+\}\}/g)) found.add(match[0]);
  for (const match of text.matchAll(/\{(?:name|biz|city|me|product|role|firstName|first_name|company)\}/gi)) found.add(match[0]);
  for (const match of text.matchAll(/\[[^\]\n]{1,80}\]/g)) {
    const token = match[0];
    if (/name|company|sender|role|info|dispatcher|first/i.test(token)) found.add(token);
  }
  return [...found];
}

function containsPhrase(text: string, phrase: string): boolean {
  const needle = phrase.trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text);
}

function stripSignature(body: string, signature: string | null | undefined): string {
  const sig = signature?.trim();
  if (!sig) return body;
  const index = body.toLowerCase().lastIndexOf(sig.toLowerCase());
  if (index === -1) return body;
  return body.slice(0, index);
}
