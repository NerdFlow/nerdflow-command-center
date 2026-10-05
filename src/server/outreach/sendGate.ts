import { parseMailboxSignatures, sendingMailbox, signatureForMailbox } from "@/lib/mailboxSignature";
import { checklistApplies, emailStepFor, firstHttpUrl, runPreSendChecklist } from "@/lib/outreachChecklist";
import { outreachBlockReason } from "@/lib/replyLog";
import { prisma } from "@/server/db";
import { catalogFromEntries } from "@/server/kb/load";

export class OutreachSendBlocked extends Error {
  reasons: string[];

  constructor(reasons: string[]) {
    super(reasons.join(" "));
    this.name = "OutreachSendBlocked";
    this.reasons = reasons;
  }
}

export async function assertOutreachSendable(input: {
  organizationId: string;
  mailbox: string;
  channel: string;
  kind: string;
  cadenceStep: number;
  blankMessage?: boolean;
  subject: string;
  body: string;
  companyName: string;
  openerSourceUrl: string | null;
  lead: { status?: string | null; signals?: unknown; sourceUrl?: string | null };
  intel?: string | null;
}): Promise<void> {
  if (!checklistApplies({ channel: input.channel, kind: input.kind, blankMessage: input.blankMessage })) return;
  if (input.channel !== "email" && input.channel !== "linkedin") return;

  const [settings, entries] = await Promise.all([
    prisma.orgSettings.findUnique({ where: { organizationId: input.organizationId } }),
    prisma.outreachKbEntry.findMany({
      where: { organizationId: input.organizationId, status: "approved", kind: { in: ["banned_phrase", "market_fact"] } },
    }),
  ]);
  const catalog = catalogFromEntries(entries);
  const signatures = parseMailboxSignatures(settings?.mailboxSignatures);
  const signature = signatureForMailbox(signatures, input.mailbox);
  const opener = firstHttpUrl(input.openerSourceUrl, input.lead.sourceUrl, input.intel);
  const result = runPreSendChecklist({
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    companyName: input.companyName,
    openerSourceUrl: opener,
    emailStep: emailStepFor(input.kind, input.cadenceStep),
    subjectRequired: input.channel === "email" && input.kind !== "reply",
    dnc: outreachBlockReason(input.lead) !== null,
    catalog,
    settings: {
      mailboxOwnerName: signature?.name || null,
      signatureText: signature?.signature || null,
      postalAddress: settings?.postalAddress ?? null,
      optOutLine: settings?.optOutLine ?? null,
    },
  });
  if (result.blocks.length > 0) throw new OutreachSendBlocked(result.blocks.map((item) => item.reason));
}

export { sendingMailbox };
