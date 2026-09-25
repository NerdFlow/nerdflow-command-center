const FETCH_TIMEOUT_MS = 8_000;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;
const IGNORED_EMAIL_DOMAINS = ["sentry.io", "example.com", "wixpress.com", "godaddy.com"];

export type ExtractedSite = {
  title: string | null;
  email: string | null;
  phone: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  /** Plain-text sample of the page, used only as grounding context for the AI fit check — never shown as a fact by itself. */
  textSample: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-effort homepage fetch — many sites will fail (timeout, block, redirect loop); callers must tolerate null. */
export async function extractSiteContact(url: string): Promise<ExtractedSite | null> {
  try {
    const target = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(target, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NerdFlowLeadGen/1.0)" },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const emails = [...html.matchAll(EMAIL_RE)]
      .map((m) => m[0].toLowerCase())
      .filter((e) => !IGNORED_EMAIL_DOMAINS.some((d) => e.endsWith(`@${d}`)) && !e.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i));
    const phones = [...html.matchAll(PHONE_RE)].map((m) => m[0]);
    const instagram = html.match(/instagram\.com\/[A-Za-z0-9_.]+/i)?.[0];
    const linkedin = html.match(/linkedin\.com\/company\/[A-Za-z0-9\-]+/i)?.[0];

    return {
      title: titleMatch?.[1]?.trim() || null,
      email: emails[0] ?? null,
      phone: phones[0] ?? null,
      instagramUrl: instagram ? `https://${instagram}` : null,
      linkedinUrl: linkedin ? `https://${linkedin}` : null,
      textSample: stripHtml(html).slice(0, 1500),
    };
  } catch {
    return null;
  }
}
