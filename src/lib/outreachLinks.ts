/** Opens a Gmail compose window. The app never sends the message. */
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/** Opens the LinkedIn profile, or a people search when no profile URL is stored. */
export function linkedinOpenUrl(lead: {
  linkedinUrl?: string | null;
  contactName?: string | null;
  businessName: string;
}): string {
  const raw = lead.linkedinUrl?.trim();
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  const keywords = [lead.contactName?.trim(), lead.businessName.trim()].filter(Boolean).join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}
