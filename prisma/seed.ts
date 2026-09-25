import { PrismaClient, type Role } from "@prisma/client";
import type { CampaignStrategy } from "../src/server/strategy";
import { computeDedupeKey } from "../src/server/leads";
import { hashPassword } from "../src/server/password";

const prisma = new PrismaClient();

const DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || "nerdflow.tech";

const receptAiStrategy: CampaignStrategy = {
  summary:
    "Find independent restaurants in Austin that miss calls at peak hours, prove it with a missed-call audit, and book a 10-minute demo.",
  icp: {
    buyer: "Owner or general manager",
    business: "Independent restaurants that take phone orders or reservations",
    location: "Austin, TX",
    size: "1 to 3 locations",
    triggers: [
      "Calls go unanswered during peak hours",
      "Reviews mention nobody picks up the phone",
      "Busy Instagram but slow replies",
    ],
    disqualifiers: [
      "Chains with a central call center",
      "Already using an answering service or AI",
      "Dine-in only with no phone orders",
    ],
  },
  channels: [
    { channel: "call", why: "An unanswered call at peak hours proves the problem and becomes the opening line." },
    { channel: "instagram", why: "Independent owners read their DMs. It is where they already talk to customers." },
    { channel: "email", why: "Carries the missed-call audit and keeps a written trail for follow-ups." },
  ],
  cadence: [
    { day: 0, channel: "call", purpose: "Missed-call test during the rush. If someone answers, keep it to 30 seconds.", tip: "Lead with what you observed, not what you sell." },
    { day: 1, channel: "email", purpose: "Send the missed-call audit.", tip: "Ask for one small yes: do they want the audit?" },
    { day: 3, channel: "instagram", purpose: "Friendly nudge where the owner actually hangs out.", tip: "Mention something real from their page first. Stay under 40 words." },
    { day: 6, channel: "email", purpose: "Follow-up that adds one new thing: estimated orders lost.", tip: "Never just 'bumping this' — bring something new." },
    { day: 10, channel: "call", purpose: "Final call at a quiet hour to book 10 minutes.", tip: "Call between 2 and 4pm. Ask for 10 minutes, not 'a demo'." },
  ],
  messages: {
    call: {
      first:
        "Hi, is this {name}? This is {me} from ReceptAI.\n\nI called {biz} a few times Friday around dinner and couldn't get through. Totally normal when the kitchen's slammed, but those are usually orders going to the place down the street.\n\nWe set up an AI that picks up every call, takes the order or booking, and sends it to you. Could I show you what it would have caught last Friday? Ten minutes.",
      follow: "Hi {name}, {me} from ReceptAI again. I sent over the missed-call audit for {biz}. Do you have 10 minutes this week?",
    },
    email: {
      first:
        "Subject: We called {biz} on Friday\n\nHi {name},\n\nWe called {biz} during Friday dinner rush and nobody could pick up. Not a criticism — your team was clearly busy.\n\nReceptAI answers every call, takes the order or reservation, and sends it straight to you. Want the missed-call audit?\n\n{me}",
      follow:
        "Subject: Re: {biz} Friday calls\n\nHi {name},\n\nOne number I should have led with: every missed call at rush hour is usually a lost order. Worth a 10-minute look?\n\n{me}",
    },
    instagram: {
      first:
        "Hey {name}! Love what you're doing at {biz}. Quick one: we tried calling during Friday dinner rush and couldn't get through. Want the free missed-call audit for your place?",
      follow: "Hey {name}, circling back. Happy to send the missed-call numbers for {biz}, no strings. Want them?",
    },
    linkedin: { first: "", follow: "" },
  },
  objections: [
    { question: "We already have someone answering the phone.", answer: "Great — this covers what they can't: rush hour, after close, when they're on another call." },
    { question: "Customers want a real person.", answer: "Most customers just want the order taken right and fast. Offer the demo call so they hear it themselves." },
    { question: "Too expensive.", answer: "Ask what an average order is worth, then compare the price to one lost order a day." },
  ],
  lead_gen: {
    sources: ["Google Maps", "Review sites", "Instagram"],
    search_queries: ["independent restaurants Austin TX", "takeout restaurants Austin", "family owned restaurant Austin"],
    must_have: ["Not a chain", "Public phone number", "Takes phone orders or reservations"],
    score_boost: ["Reviews mention missed calls", "Instagram post in the last 14 days"],
  },
  kill_rule: "Pause at 150 touches if reply rate is under 1% or bounce rate is over 5%.",
};

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: { id: "00000000-0000-0000-0000-000000000001", name: "NerdFlow" },
  });

  await prisma.orgSettings.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      allowedEmailDomain: DOMAIN,
      assistantName: "Flow",
    },
  });

  const seededLogins: { name: string; email: string; role: Role; password: string | null }[] = [];

  async function upsertSeedUser(input: { name: string; role: Role; password: string }) {
    const email = `${input.name.toLowerCase()}@${DOMAIN}`;
    const existing = await prisma.user.findUnique({ where: { email } });
    const passwordHash = existing?.passwordHash ?? (await hashPassword(input.password));
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        fullName: input.name,
        role: input.role,
        status: existing?.status === "deactivated" ? "deactivated" : "active",
        ...(existing?.passwordHash ? {} : { passwordHash }),
      },
      create: {
        organizationId: org.id,
        email,
        fullName: input.name,
        role: input.role,
        status: "active",
        passwordHash,
      },
    });
    seededLogins.push({
      name: input.name,
      email,
      role: input.role,
      password: existing?.passwordHash ? null : input.password,
    });
    return user;
  }

  const muqeet = await upsertSeedUser({ name: "Muqeet", role: "lead", password: "cedar-orbit-4821" });
  const hadi = await upsertSeedUser({ name: "Hadi", role: "lead", password: "flint-raven-7394" });
  const baryal = await upsertSeedUser({ name: "Baryal", role: "rep", password: "amber-birch-1562" });

  const targetDefaults: { metric: "leads_verified" | "emails" | "calls" | "instagram_dms" | "linkedin_messages"; dailyValue: number }[] = [
    { metric: "leads_verified", dailyValue: 5 },
    { metric: "emails", dailyValue: 15 },
    { metric: "calls", dailyValue: 10 },
    { metric: "instagram_dms", dailyValue: 8 },
    { metric: "linkedin_messages", dailyValue: 3 },
  ];
  for (const t of targetDefaults) {
    const existing = await prisma.target.findFirst({ where: { userId: baryal.id, metric: t.metric } });
    if (!existing) {
      await prisma.target.create({
        data: { organizationId: org.id, userId: baryal.id, metric: t.metric, dailyValue: t.dailyValue, effectiveFrom: new Date(), setById: hadi.id },
      });
    }
  }

  let receptAi = await prisma.product.findFirst({ where: { organizationId: org.id, name: "ReceptAI" } });
  if (!receptAi) {
    receptAi = await prisma.product.create({
      data: {
        organizationId: org.id,
        name: "ReceptAI",
        type: "product",
        summary: "An AI receptionist that answers every restaurant call, takes the order or booking, and sends it to the owner.",
        isDemo: true,
      },
    });
  }

  let campaign = await prisma.campaign.findFirst({ where: { organizationId: org.id, name: "Restaurants: missed-call angle" } });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        organizationId: org.id,
        productId: receptAi.id,
        name: "Restaurants: missed-call angle",
        ownerId: baryal.id,
        status: "active",
        goal: "Book 10 demos this month",
        location: "Austin, TX",
        strategy: receptAiStrategy as unknown as object,
        approvedById: hadi.id,
        approvedAt: new Date(),
        isDemo: true,
      },
    });
  }

  const demoLeads: {
    businessName: string;
    contactName: string;
    contactRole: string;
    city: string;
    phone?: string;
    email?: string;
    instagramUrl?: string;
    website?: string;
    fitScore: number;
    signals: Record<string, boolean>;
    status: "inbox" | "queued" | "in_cadence" | "replied";
    cadenceStep?: number;
  }[] = [
    {
      businessName: "Terrazas Kitchen",
      contactName: "Rosa Terrazas",
      contactRole: "Owner",
      city: "Austin",
      phone: "+15125550101",
      email: "rosa@terrazaskitchen.example",
      instagramUrl: "https://instagram.com/terrazaskitchen",
      fitScore: 88,
      signals: { instagram_active_14d: true, reviews_mention_missed_calls: true },
      status: "inbox",
    },
    {
      businessName: "Blue Oak Diner",
      contactName: "Sam Oakley",
      contactRole: "GM",
      city: "Austin",
      phone: "+15125550102",
      website: "https://blueoakdiner.example",
      fitScore: 74,
      signals: { instagram_active_14d: true },
      status: "inbox",
    },
    {
      businessName: "Pho Sunrise",
      contactName: "Linh Tran",
      contactRole: "Owner",
      city: "Round Rock",
      phone: "+15125550103",
      fitScore: 52,
      signals: {},
      status: "inbox",
    },
    {
      businessName: "Comal Street Tacos",
      contactName: "Miguel Reyes",
      contactRole: "Owner",
      city: "Austin",
      phone: "+15125550104",
      email: "miguel@comalstreet.example",
      fitScore: 91,
      signals: { reviews_mention_missed_calls: true, instagram_active_14d: true },
      status: "queued",
    },
    {
      businessName: "Green Table Cafe",
      contactName: "Priya Shah",
      contactRole: "Manager",
      city: "Austin",
      email: "priya@greentablecafe.example",
      fitScore: 68,
      signals: { instagram_active_14d: true },
      status: "in_cadence",
      cadenceStep: 1,
    },
    {
      businessName: "Riverbend BBQ",
      contactName: "Jake Holt",
      contactRole: "Owner",
      city: "Austin",
      phone: "+15125550106",
      email: "jake@riverbendbbq.example",
      fitScore: 82,
      signals: { reviews_mention_missed_calls: true },
      status: "replied",
    },
  ];

  for (const l of demoLeads) {
    const dedupeKey = computeDedupeKey({ business_name: l.businessName, city: l.city, phone: l.phone, website: l.website });
    const exists = await prisma.lead.findFirst({ where: { organizationId: org.id, dedupeKey } });
    if (exists) continue;
    await prisma.lead.create({
      data: {
        organizationId: org.id,
        campaignId: campaign.id,
        ownerId: baryal.id,
        status: l.status,
        businessName: l.businessName,
        contactName: l.contactName,
        contactRole: l.contactRole,
        city: l.city,
        region: "TX",
        country: "US",
        phone: l.phone,
        email: l.email,
        instagramUrl: l.instagramUrl,
        website: l.website,
        signals: l.signals,
        source: "manual",
        fitScore: l.fitScore,
        fitReasons: Object.keys(l.signals),
        fitFlags: [],
        dedupeKey,
        cadenceStep: l.cadenceStep ?? 0,
        nextTouchAt: l.status === "queued" || l.status === "in_cadence" ? new Date() : null,
        isDemo: true,
      },
    });
  }

  console.log("Seed complete. Sign in at /login:");
  for (const login of seededLogins) {
    const password = login.password ?? "already set (not reset)";
    console.log(`  ${login.email}  ${login.role}  ${password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
