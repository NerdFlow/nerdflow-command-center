import type { CampaignStrategy } from "@/server/playbook";

/**
 * True when a campaign brief is about auto detailing (shops, mobile
 * detailers, ceramic coating), so the starter playbook can be used
 * instead of a generic or restaurant template.
 */
export function isAutoDetailingContext(parts: Array<string | null | undefined>): boolean {
  return parts.some((part) => Boolean(part && DETAILING_PATTERN.test(part)));
}

const DETAILING_PATTERN =
  /\b(auto[\s-]?detail(?:ing|er|ers)?|detail(?:ing)?\s+shops?|mobile\s+detail(?:er|ers|ing)?|ceramic\s+coat(?:ing)?|paint\s+correction|detailer|detailers|detailing)\b/i;

export function detailingStarterStrategy(input: {
  productName: string;
  productType: "product" | "service";
  productSummary: string;
  location?: string;
  buyerGuess?: string;
  goal?: string;
}): CampaignStrategy {
  const loc = input.location?.trim() || "your target area";
  const product = input.productName.trim() || "your product";
  const buyer = input.buyerGuess?.trim() || "The shop owner";
  const summaryLine = input.productSummary.trim();

  return {
    summary: `Find independent auto detailing shops in ${loc}. Ask for the owner, open with a booking or callback gap at their shop, and book a short conversation about ${product}.`,
    icp: {
      buyer,
      business: summaryLine
        ? `Independent auto detailing shops. ${summaryLine}`
        : "Independent auto detailing shops and mobile detailers",
      location: loc,
      size: "Owner-operated or a small crew",
      triggers: [
        "Reviews mention slow callbacks or missed bookings",
        "The crew is in a bay all day and new inquiries go quiet",
        "Quotes go out and never get a follow-up",
      ],
      disqualifiers: [
        "Dealership body shop with a central switchboard",
        "Already on a booking system they are happy with",
        "No public phone or email",
      ],
    },
    channels: [
      { channel: "call", why: "Owners are on the floor. A short call reaches them when email sits unread." },
      { channel: "email", why: "Leaves the offer in writing so they can read it between vehicles." },
      { channel: "linkedin", why: "Some owners check LinkedIn between jobs. A short note is enough." },
    ],
    cadence: [
      {
        day: 0,
        channel: "email",
        purpose: "Leave a short written note. Calls are not blocked on this step.",
        tip: "Keep it to a few sentences. You send it yourself.",
      },
      {
        day: 1,
        channel: "call",
        purpose: "Ask for the owner and open with the booking gap.",
        tip: "Ask who handles new bookings before you talk about the product.",
      },
      {
        day: 4,
        channel: "linkedin",
        purpose: "A short follow-up on their profile.",
        tip: "One specific line about the shop, then the ask.",
      },
    ],
    messages: {
      email: {
        first: `Subject: Bookings at {biz}\n\nHi {name},\n\nI was looking at {biz} in {city}. Detailing shops lose jobs when the phone rings and everyone is with a vehicle. ${product} catches those and puts them on the calendar.\n\nOpen to ten minutes this week?\n\n{me}`,
        follow: `Subject: Re: {biz}\n\nHi {name},\n\nFollowing up with one new thought: quotes that sit without a callback usually go to another shop. Worth ten minutes on ${product}?\n\n{me}`,
      },
      call: {
        first: `Hi, is this {name}? This is {me}. I was looking at {biz} in {city}. A lot of detailing shops miss new bookings while the team is in a bay. ${product} helps you catch those. Got two minutes?`,
        follow: `Hi {name}, {me} again about {biz}. Do you have ten minutes this week to look at how ${product} handles the bookings that come in while you are with a vehicle?`,
      },
      instagram: { first: "", follow: "" },
      linkedin: {
        first: `Hi {name} — saw {biz} in {city}. Detailing shops lose bookings when the crew is in a bay. ${product} catches those. Open to a short chat?`,
        follow: `Hi {name}, quick nudge on {biz}. Still worth ten minutes this week?`,
      },
    },
    objections: [
      {
        question: "We're already booked solid.",
        answer: "Ask what happens to inquiries that come in while the bay is full. Offer to cover those, not to replace the work they already have.",
      },
      {
        question: "Send me an email.",
        answer: "Agree, send the short note from your own inbox, and name a time to look at it before you hang up.",
      },
    ],
    lead_gen: {
      sources: ["Google Maps", "Manual research"],
      search_queries: [`auto detailing ${loc}`, `mobile detailer ${loc}`, `ceramic coating ${loc}`],
      must_have: ["Public phone or email", "Independent shop, not a dealer group"],
      score_boost: ["Reviews mention callbacks or booking"],
    },
    kill_rule: "Pause at 150 touches if the interested rate is under 1%.",
    call_scripts: [
      "Hi, is this {name}? This is {me}. I was looking at {biz} in {city}. A lot of detailing shops miss new bookings while the team is in a bay. {product} helps you catch those and get them on the calendar. Got two minutes?",
      "Hi {name}, {me} here. Quick one about {biz}. When a quote goes out and nobody follows up, that job usually goes to another shop. Worth a short look at how {product} handles that?",
    ],
    email_scripts: [
      "Subject: Bookings at {biz}\n\nHi {name},\n\nI was looking at {biz} in {city}. Detailing shops lose jobs when the phone rings and everyone is with a vehicle. {product} catches those and puts them on the calendar.\n\nOpen to a ten-minute look this week?\n\n{me}",
      "Subject: Quick note for {biz}\n\nHi {name},\n\nQuotes that sit without a follow-up are usually lost jobs. {product} was built for shops like {biz} that are busy in the bay and still want the next booking.\n\nWorth ten minutes?\n\n{me}",
    ],
  };
}
