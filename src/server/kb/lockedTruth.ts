import type { KbSeedEntry } from "@/server/kb/types";

/** Locked Product Truth. Overrides the empty 08-product-truth.md on every seed. */
export const LOCKED_ONE_LINER = "ReceptAI is your after-hours ops layer — answer, capture the job, notify you.";

export const LOCKED_OFFER_LINE = "Free for 1 week on your after-hours line. Switch it off anytime.";

export const LOCKED_E1_A = `Hi [first name],

Saw [Company] is hiring [a dispatcher / an overnight dispatcher / a customer service rep].

Until that seat's filled, what happens to a call that comes in at 9pm? If it hits voicemail, ReceptAI can answer it, capture the job, and email you a summary.

${LOCKED_OFFER_LINE}

Want the details?

[Sender name]`;

export const LOCKED_L1_A =
  "Hi [first name], saw you're hiring [role]. Until that seat's filled, want ReceptAI to answer those after-hours calls free for 1 week? It captures the job and emails you a summary. Switch it off anytime.";

export const LOCKED_F3_A =
  "Hi [first name], one more thing: [one Safe-to-quote stat, with the source named]. Still happy to set up the free 1 week if it's useful.";

const LOCKED_CLAIMS: { key: string; title: string; body: string; claim: "yes" | "roadmap" | "commercial" }[] = [
  { key: "product_truth:one_liner", title: "One-liner", body: LOCKED_ONE_LINER, claim: "yes" },
  {
    key: "product_truth:brand",
    title: "Cold-copy brand",
    body: "Use ReceptAI in cold copy. NerdFlow belongs in the signature or company line only.",
    claim: "yes",
  },
  {
    key: "product_truth:after_hours_answer",
    title: "After-hours answer",
    body: "Yes. ReceptAI answers after-hours calls.",
    claim: "yes",
  },
  {
    key: "product_truth:job_capture",
    title: "Job capture",
    body: "Yes. It captures the job: caller name, phone, address, and problem.",
    claim: "yes",
  },
  {
    key: "product_truth:owner_email",
    title: "Owner email summary",
    body: "Yes. It emails the owner a summary of the call.",
    claim: "yes",
  },
  {
    key: "product_truth:forward_greeting",
    title: "Forward and greeting",
    body: "Yes. It uses the business's existing number via call forwarding, with a custom greeting.",
    claim: "yes",
  },
  {
    key: "product_truth:switch_off",
    title: "Switch off",
    body: "Yes. The customer can switch it off anytime.",
    claim: "yes",
  },
  {
    key: "product_truth:text_on_call_tech",
    title: "Text the on-call tech",
    body: "Roadmap. Never claim that ReceptAI texts the on-call tech.",
    claim: "roadmap",
  },
  {
    key: "product_truth:fsm_booking",
    title: "FSM or calendar booking",
    body: "Roadmap. Never claim booking into a calendar or any FSM (ServiceTitan, Housecall Pro, Jobber, FieldEdge, or similar).",
    claim: "roadmap",
  },
  {
    key: "product_truth:pilot",
    title: "Pilot",
    body: "1 week free (7 days) on the after-hours line.",
    claim: "commercial",
  },
  {
    key: "product_truth:price",
    title: "Price",
    body: "$497/mo after the free week, for after-hours.",
    claim: "commercial",
  },
  {
    key: "product_truth:setup_fee",
    title: "Setup fee",
    body: "No setup fee.",
    claim: "commercial",
  },
  { key: "product_truth:offer_line", title: "Offer line", body: LOCKED_OFFER_LINE, claim: "commercial" },
];

const MESSAGE_OVERRIDES: Record<string, { body: string; status?: KbSeedEntry["status"] }> = {
  "message_version:E1-A": { body: LOCKED_E1_A, status: "approved" },
  "message_version:L1-A": { body: LOCKED_L1_A, status: "approved" },
  "message_version:F3-A": { body: LOCKED_F3_A, status: "approved" },
  "message_version:E1-B": {
    status: "pending",
    body: `${LOCKED_E1_A.replace("Want the details?", "Want the demo number? Call it and pretend a unit just died.")}\n\nDemo line is not live. Do not send this version.`,
  },
};

function conflictsWithLock(body: string): boolean {
  return (
    /\bbooks?\s+(?:the\s+)?job\b/i.test(body) ||
    /\btext(?:s|ing)?\b[^.\n]{0,48}\b(?:on-?call\s+)?tech\b/i.test(body) ||
    /\b(?:2|two)\s+weeks\b/i.test(body) ||
    /\b14[-\s]?days?\b/i.test(body)
  );
}

export function applyProductLocks(entries: KbSeedEntry[]): KbSeedEntry[] {
  const withoutParsedTruth = entries.filter((entry) => entry.kind !== "product_truth");
  const lockedTruth: KbSeedEntry[] = LOCKED_CLAIMS.map((claim) => ({
    key: claim.key,
    layer: "core",
    kind: "product_truth",
    icp: null,
    scope: "universal",
    status: "approved",
    title: claim.title,
    body: claim.body,
    payload: { claim: claim.claim, tasks: ["write_outreach", "answer_reply", "talk_price", "quote_stat", "customer_story"], locked: true },
    sourcePath: "outreach-kb/08-product-truth.md",
    sourceLink: null,
    version: 1,
  }));

  const adjusted = withoutParsedTruth.map((entry) => {
    const override = MESSAGE_OVERRIDES[entry.key];
    let next = override ? { ...entry, body: override.body, status: override.status ?? entry.status } : entry;
    if (next.kind === "principle" && /offer/i.test(next.title)) {
      next = { ...next, body: `Offer: "${LOCKED_OFFER_LINE}" Wording must match Product Truth. The pilot is 1 week, then $497/mo, no setup fee.` };
    }
    if (
      next.status === "approved" &&
      next.kind !== "product_truth" &&
      next.kind !== "banned_phrase" &&
      next.kind !== "message_version" &&
      next.kind !== "market_fact" &&
      conflictsWithLock(next.body)
    ) {
      next = {
        ...next,
        status: "pending",
        payload: { ...next.payload, withheldReason: "Conflicts with locked Product Truth until rewritten." },
      };
    }
    return next;
  });

  return [...adjusted, ...lockedTruth];
}
