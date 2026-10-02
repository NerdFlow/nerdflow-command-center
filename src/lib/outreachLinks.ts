/** Opens the OS mail handler (Titan, when that is the default on this Mac). The app never sends. */
export function mailtoUrl(to: string, subject: string, body: string, max = 700): string {
  const address = to.trim();
  const shortBody = shortenMailBody(body, max);
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shortBody)}`;
}

function shortenMailBody(body: string, max = 700): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return (lastBreak > 200 ? cut.slice(0, lastBreak + 1) : cut).trim();
}

/**
 * Profile URL when we have one. Otherwise a people search.
 * No invite note and no message prefill — connection requests stay blank.
 */
export function linkedinOpenUrl(lead: {
  linkedinUrl?: string | null;
  contactName?: string | null;
  businessName: string;
}): string {
  const raw = lead.linkedinUrl?.trim();
  if (raw && /^https?:\/\/(www\.)?linkedin\.com\/in\//i.test(raw)) return raw;
  if (raw && /^https?:\/\//i.test(raw) && /linkedin\.com\/in\//i.test(raw)) return raw;
  const keywords = [lead.contactName?.trim(), lead.businessName.trim()].filter(Boolean).join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}
