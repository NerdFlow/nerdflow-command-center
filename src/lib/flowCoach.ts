import type { Channel } from "@prisma/client";
import { leadShortCode } from "@/lib/todayCards";

export type CoachCandidate = {
  id: string;
  contactName: string | null;
  businessName: string;
  channel: Channel;
  shortCode: string;
};

const INTEREST = /\b(interested|demo|meeting|next week|book(?:ed| a)?|pricing|let's talk|lets talk)\b/i;

export function noteSignalsInterest(note: string): boolean {
  return INTEREST.test(note);
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

/** Rule match so Flow still proposes people when the model is down. Never invents a person. */
export function matchCoachCandidates(
  text: string,
  leads: Array<Omit<CoachCandidate, "shortCode"> & { shortCode?: string }>,
): CoachCandidate[] {
  const haystack = text.toLowerCase();
  const scored = leads
    .map((lead) => {
      let score = 0;
      const name = lead.contactName?.trim() ?? "";
      const parts = name.split(/\s+/).filter((part) => part.length >= 3);
      for (const part of parts) {
        if (haystack.includes(part.toLowerCase())) score += part.length >= 4 ? 3 : 1;
      }
      for (const token of tokens(lead.businessName)) {
        if (haystack.includes(token)) score += 2;
      }
      return { lead, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.lead.businessName.localeCompare(b.lead.businessName));

  const seen = new Set<string>();
  const matches: CoachCandidate[] = [];
  for (const row of scored) {
    if (seen.has(row.lead.id)) continue;
    seen.add(row.lead.id);
    matches.push({
      id: row.lead.id,
      contactName: row.lead.contactName,
      businessName: row.lead.businessName,
      channel: row.lead.channel,
      shortCode: row.lead.shortCode ?? leadShortCode(row.lead.id),
    });
    if (matches.length === 3) break;
  }
  return matches;
}

export function coachPrompt(candidates: CoachCandidate[]): { title: string; body: string } {
  if (candidates.length === 0) {
    return {
      title: "No match",
      body: "I couldn't match that to someone on your list. Nothing was logged.",
    };
  }
  const firsts = Array.from(
    new Set(candidates.map((candidate) => candidate.contactName?.trim().split(/\s+/)[0]).filter((name): name is string => Boolean(name))),
  );
  const title =
    candidates.length === 1
      ? `Log this for ${firsts[0] ?? candidates[0]!.businessName}?`
      : firsts.length === 1
        ? `Which ${firsts[0]}?`
        : "Which person?";
  return { title, body: "Confirm before I log this to Pipeline." };
}

export function channelLabel(channel: Channel): string {
  if (channel === "linkedin") return "LinkedIn";
  if (channel === "email") return "Email";
  if (channel === "call") return "Call";
  if (channel === "instagram") return "Instagram";
  return channel;
}

/** Stored playbook copy when we have it. Otherwise the approved blank-note follow-up. No invented results. */
export function coachReplyDraft(input: { stored: string; contactName: string | null; businessName: string }): string {
  const stored = input.stored.trim();
  if (stored) return stored;
  const name = input.contactName?.trim().split(/\s+/)[0] || "there";
  const business = input.businessName.trim() || "your team";
  return `Hey ${name} — thanks for connecting. Happy to share a short walkthrough of how we run ops for teams like ${business}.`;
}

export function inferCoachChannel(note: string, cadence: Channel, linkedinUrl: string | null | undefined): Channel {
  const text = note.toLowerCase();
  if (/\blinkedin\b|\bconnection\b|\bdm\b/.test(text)) return "linkedin";
  if (/\bemail\b|\binbox\b/.test(text)) return "email";
  if (/\binstagram\b/.test(text)) return "instagram";
  if (linkedinUrl?.trim()) return "linkedin";
  if (cadence === "call") return "email";
  return cadence;
}
