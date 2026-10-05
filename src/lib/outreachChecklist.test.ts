import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fallbackOutreachDraft } from "@/lib/outreachFallback";
import {
  FALLBACK_BANNED_PHRASES,
  runPreSendChecklist,
  type ChecklistCatalog,
  type ChecklistSettings,
} from "@/lib/outreachChecklist";
import { LOCKED_E1_A, LOCKED_L1_A, LOCKED_ONE_LINER, LOCKED_OFFER_LINE } from "@/server/kb/lockedTruth";
import { getKbContext } from "@/server/kb/context";
import { parseOutreachKbFiles } from "@/server/kb/parseOutreachKb";

const emptySettings: ChecklistSettings = {
  mailboxOwnerName: null,
  signatureText: null,
  postalAddress: null,
  optOutLine: null,
};

const catalog: ChecklistCatalog = {
  bannedPhrases: FALLBACK_BANNED_PHRASES,
  safeQuotes: [
    {
      text: "In CallRail's 2025 survey of 1,000 US consumers, 78% said they've given up on a business after an unanswered call.",
      sources: ["CallRail"],
    },
  ],
  doNotQuote: ["62% of calls to small businesses go unanswered"],
};

function check(overrides: Partial<Parameters<typeof runPreSendChecklist>[0]>) {
  return runPreSendChecklist({
    channel: "email",
    subject: "your dispatcher opening",
    body: cleanBody(),
    companyName: "Bartlett Heating",
    openerSourceUrl: "https://example.com/jobs/dispatcher",
    emailStep: "first",
    subjectRequired: true,
    dnc: false,
    catalog,
    settings: emptySettings,
    ...overrides,
  });
}

function cleanBody() {
  return `Hi Sam,

What happens to a call that comes in after hours at Bartlett?

ReceptAI can answer it, capture the job, and email you a summary.

${LOCKED_OFFER_LINE}

Want the details?

Sam`;
}

describe("pre-send checklist", () => {
  it("passes a clean first email and only warns when postal and signature are unset", () => {
    const result = check({});
    expect(result.ok).toBe(true);
    expect(result.blocks).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toEqual(["signature", "postal", "opt_out"]);
  });

  it("blocks with the exact reason for each failure", () => {
    const result = check({
      subject: "Re: NerdFlow 🚀",
      body: "Hope this finds you well {{firstName}}. We book the job and text your on-call tech. Free for 2 weeks. https://cal.com/x Want a call? Or worth a look?",
      openerSourceUrl: null,
      dnc: true,
    });
    const reasons = result.blocks.map((item) => item.reason);
    expect(reasons).toContain("Do not contact. Send is blocked.");
    expect(reasons).toContain("Subject uses a fake Re:.");
    expect(reasons).toContain("Subject contains NerdFlow.");
    expect(reasons).toContain("Subject contains an emoji.");
    expect(reasons).toContain('Banned phrase: "hope this finds you well".');
    expect(reasons).toContain("Unfilled merge field: {{firstName}}.");
    expect(reasons).toContain("Claim is not in Product Truth: booking the job or a calendar.");
    expect(reasons).toContain("Claim is not in Product Truth: texting the on-call tech.");
    expect(reasons).toContain("Offer does not match Product Truth. The pilot is 1 week.");
    expect(reasons).toContain("Email 1 cannot contain a link.");
    expect(reasons).toContain("More than one call to action.");
    expect(reasons).toContain("Opener needs a source URL. No source, no send.");
    expect(result.ok).toBe(false);
  });

  it("blocks a too-long subject, a missing postal address once set, and a stat without its source", () => {
    const longSubject = check({ subject: "your overnight dispatcher opening this week please" });
    expect(longSubject.blocks.map((item) => item.reason)).toContain("Subject has 7 words; it needs 2 to 6.");

    const postal = check({
      settings: { ...emptySettings, postalAddress: "123 Main St, Cheyenne, WY 82001", optOutLine: "Reply stop to opt out." },
    });
    expect(postal.blocks.map((item) => item.reason)).toEqual([
      "Postal address is missing from the email.",
      "Opt-out line is missing from the email.",
    ]);

    const stat = check({
      body: `${cleanBody()}\n\nIn a survey, 78% gave up.`,
    });
    expect(stat.blocks.map((item) => item.reason)).toContain('Stat "78%" is not on the Safe-to-quote list with its source named.');
  });

  it("allows a safe stat when the source is named, and blocks a do-not-quote line", () => {
    const ok = check({
      body: `${cleanBody()} In CallRail's 2025 survey, 78% said they've given up on a business after an unanswered call.`,
    });
    expect(ok.blocks.filter((item) => item.code === "stat")).toEqual([]);

    const banned = check({
      body: `${cleanBody()} 62% of calls to small businesses go unanswered.`,
    });
    expect(banned.blocks.some((item) => item.reason.startsWith("Stat is on the do-not-quote list"))).toBe(true);
  });

  it("caps LinkedIn notes at 250 characters", () => {
    const result = check({
      channel: "linkedin",
      subject: "",
      subjectRequired: false,
      body: "Hi there. ".repeat(40),
    });
    expect(result.blocks.some((item) => item.reason.startsWith("LinkedIn note is"))).toBe(true);
  });
});

describe("fallback draft", () => {
  it("does not claim booking, texting, or a two-week pilot", () => {
    const email = fallbackOutreachDraft({ channel: "email", firstName: "Sam", company: "Bartlett Heating", senderName: "Muqeet" });
    const linkedin = fallbackOutreachDraft({ channel: "linkedin", firstName: "Sam", company: "Bartlett Heating", senderName: "Muqeet" });
    for (const draft of [email, linkedin]) {
      expect(draft.body.toLowerCase()).not.toMatch(/book the job|books the job|text your|two weeks|2 weeks/);
      expect(draft.body).toContain("ReceptAI");
      expect(draft.body).toContain("1 week");
    }
    expect(linkedin.body.length).toBeLessThanOrEqual(250);
    const checked = check({ subject: email.subject, body: email.body, companyName: "Bartlett Heating" });
    expect(checked.blocks).toEqual([]);
  });
});

describe("knowledge base seed", () => {
  const files = readdirSync(path.join(process.cwd(), "outreach-kb"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({ path: `outreach-kb/${name}`, markdown: readFileSync(path.join(process.cwd(), "outreach-kb", name), "utf8") }));
  const entries = parseOutreachKbFiles(files);

  it("locks product truth and live message versions", () => {
    const oneLiner = entries.find((entry) => entry.key === "product_truth:one_liner");
    expect(oneLiner?.status).toBe("approved");
    expect(oneLiner?.body).toBe(LOCKED_ONE_LINER);

    const email = entries.find((entry) => entry.key === "message_version:E1-A");
    const linkedin = entries.find((entry) => entry.key === "message_version:L1-A");
    expect(email?.status).toBe("approved");
    expect(linkedin?.status).toBe("approved");
    expect(email?.body).toBe(LOCKED_E1_A);
    expect(linkedin?.body).toBe(LOCKED_L1_A);
    expect(LOCKED_L1_A.length).toBeLessThanOrEqual(250);
    for (const body of [email?.body ?? "", linkedin?.body ?? ""]) {
      expect(body.toLowerCase()).not.toMatch(/book the job|books the job|text your on-call|texts your on-call|two weeks|2 weeks/);
    }
    expect(entries.filter((entry) => entry.kind === "banned_phrase" && entry.status === "approved").length).toBeGreaterThan(10);
    expect(entries.filter((entry) => entry.kind === "market_fact" && entry.payload.safeToQuote === true && entry.status === "approved").length).toBeGreaterThan(5);
  });

  it("gives write_outreach only the approved slice", () => {
    const rows = entries.map((entry) => ({ ...entry, payload: entry.payload }));
    const slice = getKbContext({ entries: rows, task: "write_outreach", icp: "contractors", channel: "email" });
    const keys = new Set(slice.map((row) => row.key));
    expect(keys.has("product_truth:one_liner")).toBe(true);
    expect(keys.has("message_version:E1-A")).toBe(true);
    expect(keys.has("message_version:L1-A")).toBe(false);
    expect(slice.some((row) => row.kind === "buyer_profile")).toBe(false);
    expect(slice.some((row) => row.kind === "objection")).toBe(false);
    expect(slice.some((row) => row.kind === "prospect_language")).toBe(false);
    const approved = entries.filter((entry) => entry.status === "approved");
    expect(slice.length).toBeGreaterThan(10);
    expect(slice.length).toBeLessThan(approved.length);
    expect(slice.length).toBeLessThan(entries.length);

    const otherIcp = getKbContext({ entries: rows, task: "write_outreach", icp: "restaurants", channel: "email" });
    expect(otherIcp.some((row) => row.key === "message_version:E1-A")).toBe(false);
    expect(otherIcp.some((row) => row.key === "product_truth:price")).toBe(true);

    const quotes = getKbContext({ entries: rows, task: "quote_stat", icp: "contractors" });
    expect(quotes.every((row) => row.payload.safeToQuote === true)).toBe(true);
    expect(quotes.length).toBeGreaterThan(0);
  });
});
