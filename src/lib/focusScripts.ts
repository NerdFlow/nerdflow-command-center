import {
  DETAILING_CALL_SCRIPTS,
  DETAILING_EMAIL_SCRIPTS,
  DETAILING_OBJECTIONS,
  isAutoDetailingText,
  isRestaurantText,
} from "@/lib/playbooks/autoDetailing";

export type ScriptVariant = "a" | "b";
export type ScriptRating = "helpful" | "meh" | "bad";

export type ScriptStrategy = {
  summary?: string;
  icp?: { buyer?: string; business?: string };
  call_scripts?: [string, string] | string[] | null;
  email_scripts?: [string, string] | string[] | null;
  messages?: Partial<Record<string, { first?: string; follow?: string }>>;
  objections?: { question: string; answer: string }[];
};

const RESTAURANT_COPY = /\b(receptai|dinner rush|kitchen(?:'s| is) slammed|missed-call|missed call audit|restaurants?)\b/i;

const NEUTRAL_CALL = "Hi {name}, this is {me}. I had a short question about {biz} in {city}. Do you have two minutes?";
const NEUTRAL_EMAIL =
  "Subject: {biz}\n\nHi {name},\n\nI had a short question about {biz} in {city}. Worth 10 minutes this week?\n\n{me}";

const NEUTRAL_OBJECTIONS = [
  { question: "Not a good time.", answer: "Ask when to call back, then set the next touch before you hang up." },
  { question: "Send me something.", answer: "Agree, then ask what they would need to see and book the follow-up." },
];

/** Stable A/B assignment. The rep does not pick. */
export function assignScriptVariant(leadId: string): ScriptVariant {
  let hash = 0;
  for (let i = 0; i < leadId.length; i++) {
    hash = (Math.imul(hash, 31) + leadId.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? "a" : "b";
}

export function scriptIdFor(channel: string, variant: ScriptVariant): string {
  return `${channel}_${variant}`;
}

export function variantFromTouch(scriptUsed: string | null | undefined, scriptId: string | null | undefined): ScriptVariant | null {
  if (scriptUsed === "a" || scriptUsed === "b") return scriptUsed;
  if (scriptId?.endsWith("_a")) return "a";
  if (scriptId?.endsWith("_b")) return "b";
  return null;
}

export type FocusTemplateValues = {
  name: string;
  biz: string;
  city: string;
  me: string;
  product: string;
  role?: string;
};

/** First name when we have one. A blank call name becomes the role, or "the owner". */
export function callPlaceholderName(contactName: string | null | undefined, role?: string | null): string {
  const first = contactName?.trim().split(/\s+/)[0];
  if (first) return first;
  const roleText = role?.trim();
  if (!roleText) return "the owner";
  return /^the\s+/i.test(roleText) ? roleText : `the ${roleText.toLowerCase()}`;
}

/**
 * Replace every {token}. Known aliases map to stored fields.
 * A blank city drops "in {city}" instead of leaving a hole. Unknown tokens are removed.
 */
export function fillFocusTemplate(template: string, values: FocusTemplateValues): string {
  const name = values.name.trim() ? callPlaceholderName(values.name) : callPlaceholderName("", values.role);
  const biz = values.biz.trim();
  const city = values.city.trim();
  const me = values.me.trim();
  const product = values.product.trim();
  let text = template;
  if (!city) text = text.replace(/\s+in\s+\{city\}/gi, "");
  const map: Record<string, string> = {
    name,
    firstname: name,
    first_name: name,
    contact: name,
    contact_name: name,
    biz,
    business: biz,
    company: biz,
    business_name: biz,
    city,
    me,
    myname: me,
    product,
    productname: product,
    product_name: product,
    role: values.role?.trim() || "",
  };
  text = text.replace(/\{(\w+)\}/g, (_, key: string) => map[key.toLowerCase()] ?? "");
  return text.replace(/[ \t]{2,}/g, " ").replace(/\s+([?.!,])/g, "$1").trim();
}

export function hasTemplateHole(text: string): boolean {
  return /\{[a-z0-9_]+\}/i.test(text);
}

function pair(scripts: [string, string] | string[] | null | undefined): [string, string] {
  if (!scripts || scripts.length < 2) return [scripts?.[0] ?? "", ""];
  return [scripts[0] ?? "", scripts[1] ?? ""];
}

export function restaurantCopyAllowed(productName: string, icpText: string): boolean {
  if (isAutoDetailingText(`${productName} ${icpText}`)) return false;
  return isRestaurantText(icpText) || isRestaurantText(productName);
}

function icpBlob(strategy: ScriptStrategy): string {
  return `${strategy.icp?.business ?? ""} ${strategy.icp?.buyer ?? ""} ${strategy.summary ?? ""}`;
}

function safeTemplate(channel: "call" | "email" | "other", productName: string, strategy: ScriptStrategy, variant: ScriptVariant): string | null {
  if (restaurantCopyAllowed(productName, icpBlob(strategy))) return null;
  if (isAutoDetailingText(`${productName} ${icpBlob(strategy)}`)) {
    const scripts = channel === "email" ? DETAILING_EMAIL_SCRIPTS : DETAILING_CALL_SCRIPTS;
    return scripts[variant === "a" ? 0 : 1];
  }
  if (channel === "email") return NEUTRAL_EMAIL;
  return NEUTRAL_CALL;
}

export function firstSentences(text: string, max = 3): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/(?<=[.!?])\s+/);
  if (parts.length <= max) return trimmed;
  return parts.slice(0, max).join(" ");
}

/** Keep a subject line and a {me} sign-off, and cap the spoken opener at a few sentences. */
export function presentOpener(raw: string): string {
  const trimmed = raw.trim();
  const subjectMatch = /^(Subject:[^\n]*)\n+([\s\S]*)$/i.exec(trimmed);
  if (!subjectMatch) return firstSentences(trimmed, 3);
  const subject = subjectMatch[1] ?? "";
  let body = subjectMatch[2] ?? "";
  const signoff = body.match(/\n+\{me\}\s*$/);
  if (signoff) body = body.slice(0, body.length - signoff[0].length);
  const spoken = firstSentences(body.trim(), 3);
  return `${subject}\n\n${spoken}${signoff ? "\n\n{me}" : ""}`.trim();
}

export function resolveFocusOpener(input: {
  channel: "call" | "email" | "linkedin" | "instagram";
  leadId: string;
  productName: string;
  strategy: ScriptStrategy;
  values: FocusTemplateValues;
}): { text: string; variant: ScriptVariant; scriptId: string } {
  const variant = assignScriptVariant(input.leadId);
  const scriptId = scriptIdFor(input.channel, variant);
  const idx = variant === "a" ? 0 : 1;
  const message = input.strategy.messages?.[input.channel];
  const fallback = (message?.first || message?.follow || "").trim();

  let raw = "";
  if (input.channel === "call") {
    const scripts = pair(input.strategy.call_scripts);
    raw = (scripts[idx] || scripts[0] || fallback).trim();
  } else if (input.channel === "email") {
    const scripts = pair(input.strategy.email_scripts);
    raw = (scripts[idx] || scripts[0] || fallback).trim();
  } else {
    raw = fallback;
  }

  const allowed = restaurantCopyAllowed(input.productName, icpBlob(input.strategy));
  if (raw && RESTAURANT_COPY.test(raw) && !allowed) {
    const replacement = safeTemplate(input.channel === "email" ? "email" : "call", input.productName, input.strategy, variant);
    if (replacement) raw = replacement;
  }
  if (!raw) {
    raw = safeTemplate(input.channel === "email" ? "email" : "call", input.productName, input.strategy, variant) || NEUTRAL_CALL;
  }

  const filled = fillFocusTemplate(presentOpener(raw), input.values);
  return { text: filled, variant, scriptId };
}

export function resolveFocusObjections(
  strategy: ScriptStrategy,
  productName: string,
  values: FocusTemplateValues,
): { question: string; answer: string }[] {
  return focusObjections(strategy, productName).map((item) => ({
    question: fillFocusTemplate(item.question, values),
    answer: fillFocusTemplate(item.answer, values),
  }));
}

export function focusObjections(
  strategy: ScriptStrategy,
  productName: string,
): { question: string; answer: string }[] {
  const raw = (strategy.objections ?? []).filter((o) => o.question.trim() && o.answer.trim()).slice(0, 2);
  const blob = raw.map((o) => `${o.question} ${o.answer}`).join(" ");
  const allowed = restaurantCopyAllowed(productName, icpBlob(strategy));
  if (raw.length === 2 && (allowed || !RESTAURANT_COPY.test(blob))) return raw;
  if (isAutoDetailingText(`${productName} ${icpBlob(strategy)}`)) return DETAILING_OBJECTIONS.slice(0, 2);
  if (raw.length > 0 && !RESTAURANT_COPY.test(blob)) return raw;
  return NEUTRAL_OBJECTIONS;
}

const POSITIVE_OUTCOMES = new Set(["interested", "meeting_booked", "replied"]);

export type WeekTouch = {
  channel: string;
  outcome: string;
  occurredAt: Date;
  scriptUsed?: string | null;
  scriptId?: string | null;
};

export type ScriptWeekRow = {
  channel: "call" | "email";
  variant: ScriptVariant;
  touches: number;
  positive: number;
  /** Interested or other positive outcomes per 100 touches. Null when there are no touches. */
  per100: number | null;
};

/** Monday 00:00 UTC of the week containing `now`. */
export function startOfIsoWeek(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const delta = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - delta);
  return d;
}

export function weeklyScriptComparison(touches: WeekTouch[], now = new Date()): ScriptWeekRow[] {
  const start = startOfIsoWeek(now).getTime();
  const buckets: Record<"call" | "email", Record<ScriptVariant, { touches: number; positive: number }>> = {
    call: { a: { touches: 0, positive: 0 }, b: { touches: 0, positive: 0 } },
    email: { a: { touches: 0, positive: 0 }, b: { touches: 0, positive: 0 } },
  };

  for (const touch of touches) {
    if (touch.occurredAt.getTime() < start) continue;
    if (touch.channel !== "call" && touch.channel !== "email") continue;
    const variant = variantFromTouch(touch.scriptUsed, touch.scriptId);
    if (!variant) continue;
    const bucket = buckets[touch.channel][variant];
    bucket.touches += 1;
    if (POSITIVE_OUTCOMES.has(touch.outcome)) bucket.positive += 1;
  }

  const rows: ScriptWeekRow[] = [];
  for (const channel of ["call", "email"] as const) {
    for (const variant of ["a", "b"] as const) {
      const bucket = buckets[channel][variant];
      rows.push({
        channel,
        variant,
        touches: bucket.touches,
        positive: bucket.positive,
        per100: bucket.touches === 0 ? null : Math.round((bucket.positive / bucket.touches) * 100),
      });
    }
  }
  return rows;
}
