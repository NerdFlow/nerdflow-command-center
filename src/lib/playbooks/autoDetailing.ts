/**
 * Starter playbook for auto-detailing shops. ICP and scripts are detailing-specific
 * so a shop never inherits restaurant / ReceptAI rush copy. A person can paste
 * the final ICP and Script A/B over these fields later.
 */
export type DetailingStarterInput = {
  productName: string;
  location?: string;
  buyerGuess?: string;
};

export const DETAILING_CALL_SCRIPTS: [string, string] = [
  "Hi, is this {name}? This is {me}, and I work with auto detailing shops in {city}. When the bay at {biz} is full, who catches the next booking?",
  "Hi {name}, {me} here. Shops like {biz} miss Saturday bookings when the phone rings mid-detail. Are you the person who handles that?",
];

export const DETAILING_EMAIL_SCRIPTS: [string, string] = [
  "Subject: Booking at {biz}\n\nHi {name},\n\nDetailing shops in {city} say the same thing: the phone rings while a car is in the bay, and that job walks. {product} is built for that gap at {biz}. Worth a 10-minute look this week?\n\n{me}",
  "Subject: {biz} Saturday bookings\n\nHi {name},\n\nQuick note for {biz}. When you are mid-detail, who picks up the next booking? {product} takes that call so the calendar stays full. Open to a short conversation?\n\n{me}",
];

export const DETAILING_OBJECTIONS: { question: string; answer: string }[] = [
  {
    question: "We are already booked out.",
    answer: "Ask what happens to calls that come in while a car is in the bay. Those are the jobs that never make the calendar.",
  },
  {
    question: "Just send me some info.",
    answer: "Agree, then ask which days the bay is full and book a 10-minute follow-up before you hang up.",
  },
];

export function isAutoDetailingText(text: string): boolean {
  return /\b(auto[\s-]?detail(?:ing)?|detail(?:ing)? shops?|car wash|ceramic coat(?:ing)?)\b/i.test(text);
}

export function isRestaurantText(text: string): boolean {
  return /\b(restaurants?|diners?|cafés?|cafes?|pizzerias?|food service)\b/i.test(text);
}

export function autoDetailingStarter(input: DetailingStarterInput) {
  const loc = input.location || "your city";
  const buyer = input.buyerGuess || "Owner or shop manager";
  return {
    summary: `Find independent auto detailing shops in ${loc} that miss bookings when the bay is full, and book a short conversation about ${input.productName}.`,
    icp: {
      buyer,
      business: "Independent auto detailing shops that book jobs by phone",
      location: loc,
      size: "1 to 3 bays",
      triggers: [
        "Phone rings while a car is in the bay",
        "Reviews mention no callback or a missed appointment",
        "No online booking, or booking that still depends on a person answering",
      ],
      disqualifiers: ["Dealer group or multi-brand collision chain", "Already using a shop system that answers and books calls"],
    },
    channels: [
      { channel: "call" as const, why: "The owner is usually on the floor. A short call reaches them the same day." },
      { channel: "email" as const, why: "Leaves the booking point in writing after the call." },
    ],
    cadence: [
      { day: 0, channel: "call" as const, purpose: "Ask who handles bookings when the bay is full.", tip: "Ask for the owner. Keep it to the next booking, not a product tour." },
      { day: 1, channel: "email" as const, purpose: "Send the same point in writing.", tip: "One ask: 10 minutes this week." },
      { day: 4, channel: "call" as const, purpose: "Second call if the first did not connect.", tip: "Reference the bay, not a generic follow-up." },
    ],
    messages: {
      email: { first: DETAILING_EMAIL_SCRIPTS[0], follow: DETAILING_EMAIL_SCRIPTS[1] },
      call: { first: DETAILING_CALL_SCRIPTS[0], follow: DETAILING_CALL_SCRIPTS[1] },
      instagram: {
        first: "Hey {name} — quick question about bookings at {biz} when the bay is full. Want the short version?",
        follow: "Hey {name}, still happy to share how detailing shops keep the next job on the calendar.",
      },
      linkedin: {
        first: "Hi {name}, I work with auto detailing shops in {city}. Worth a short note about how {biz} catches bookings mid-detail?",
        follow: "Hi {name}, circling back on {biz}. Open to 10 minutes this week?",
      },
    },
    objections: DETAILING_OBJECTIONS,
    lead_gen: {
      sources: ["Google Maps", "Manual list"],
      search_queries: [`auto detailing ${loc}`, `car detailing shop ${loc}`],
      must_have: ["Public phone number", "Independent detailing shop"],
      score_boost: ["Reviews mention missed calls or booking trouble"],
    },
    kill_rule: "Pause at 150 touches if reply rate is under 1% or bounce rate is over 5%.",
    call_scripts: DETAILING_CALL_SCRIPTS,
    email_scripts: DETAILING_EMAIL_SCRIPTS,
  };
}

type StrategySlice = {
  summary: string;
  icp: {
    buyer: string;
    business: string;
    location: string;
    size: string;
    triggers: string[];
    disqualifiers: string[];
  };
  messages: Record<string, { first: string; follow: string }>;
  objections: { question: string; answer: string }[];
  call_scripts?: [string, string] | string[];
  email_scripts?: [string, string] | string[];
};

/** Overlay the detailing starter onto an existing playbook. Cadence and channels stay. */
export function applyAutoDetailingStarter<T extends StrategySlice>(current: T, productName: string, location?: string): T {
  const starter = autoDetailingStarter({
    productName,
    location: location || current.icp.location,
    buyerGuess: current.icp.buyer,
  });
  return {
    ...current,
    summary: starter.summary,
    icp: starter.icp,
    objections: starter.objections,
    call_scripts: starter.call_scripts,
    email_scripts: starter.email_scripts,
    messages: {
      ...current.messages,
      call: starter.messages.call,
      email: starter.messages.email,
      linkedin: starter.messages.linkedin,
    },
  };
}
