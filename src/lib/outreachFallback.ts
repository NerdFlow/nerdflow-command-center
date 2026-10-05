/** Rule-based draft when the model is off. No hiring claim, no booking, no texting the tech. */

const OFFER = "Free for 1 week on your after-hours line. Switch it off anytime.";

export function fallbackOutreachDraft(input: {
  channel: "email" | "linkedin";
  firstName: string;
  company: string;
  senderName: string;
}): { subject: string; body: string } {
  const first = input.firstName.trim() || "there";
  const company = input.company.trim() || "your shop";
  const sender = input.senderName.trim().split(/\s+/)[0] || "Me";
  const short = company.split(/\s+/)[0] || "you";
  if (input.channel === "linkedin") {
    const body = `Hi ${first}, what happens to after-hours calls at ${company}? ReceptAI can answer them, capture the job, and email you a summary. ${OFFER} Want the details?`;
    return { subject: "", body: body.length <= 250 ? body : `Hi ${first}, ReceptAI answers after-hours calls at ${company}, captures the job, and emails you a summary. ${OFFER}` };
  }
  const subject = `after-hours calls at ${short}`.slice(0, 49);
  const body = `Hi ${first},

What happens to a call that comes in after hours at ${company}?

ReceptAI can answer it, capture the job, and email you a summary.

${OFFER}

Want the details?

${sender}`;
  return { subject, body };
}
