import { TITAN_FROM } from "@/lib/pipelineToday";

export type MailboxSignature = { name: string; signature: string };

export type MailboxSignatureMap = Record<string, MailboxSignature>;

export function parseMailboxSignatures(value: unknown): MailboxSignatureMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: MailboxSignatureMap = {};
  for (const [email, raw] of Object.entries(value)) {
    if (!email.includes("@") || !raw || typeof raw !== "object") continue;
    const record = raw as { name?: unknown; signature?: unknown };
    out[email.toLowerCase()] = {
      name: typeof record.name === "string" ? record.name.trim() : "",
      signature: typeof record.signature === "string" ? record.signature.trim() : "",
    };
  }
  return out;
}

export function sendingMailbox(input: { channel: string; pipeline: boolean; repEmail: string }): string {
  if (input.pipeline && input.channel === "email") return TITAN_FROM;
  return input.repEmail;
}

export function signatureForMailbox(map: MailboxSignatureMap, mailbox: string | null | undefined): MailboxSignature | null {
  if (!mailbox) return null;
  return map[mailbox.toLowerCase()] ?? null;
}
