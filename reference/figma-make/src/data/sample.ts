export const currentUser = {
  name: 'Baryal',
  role: 'rep' as const,
  streak: 7,
  avatar: 'BY',
};

export const campaigns = [
  {
    id: 'c1',
    name: 'HostCo -- Florida STR Managers',
    product: 'HostCo',
    status: 'live' as const,
    leads: 186,
    touched: 94,
    replies: 12,
    meetings: 3,
    geography: 'Florida, US',
    channels: ['Call', 'Email', 'Instagram'],
    goal: 'Book demo',
    leadTarget: 300,
  },
  {
    id: 'c2',
    name: 'ReceptAI -- Hotel Front Desks',
    product: 'ReceptAI',
    status: 'pending' as const,
    leads: 0,
    touched: 0,
    replies: 0,
    meetings: 0,
    geography: 'Southeast US',
    channels: ['Email', 'LinkedIn'],
    goal: 'Free trial',
    leadTarget: 200,
  },
];

// Leads awaiting a reply (outbound sent, no reply yet) -- 8 leads
export const awaitingReply: AwaitingReplyLead[] = [
  {
    id: 'ar1',
    business: 'Suncoast Stays',
    contact: 'Marcus Webb',
    channel: 'Email',
    messagedDaysAgo: 2,
    preview: 'Hi Marcus, I noticed Suncoast Stays manages properties in Orlando -- we work with STR managers who were struggling with after-hours guest issues...',
    campaign: 'HostCo',
    email: 'marcus@suncoaststays.com',
  },
  {
    id: 'ar2',
    business: 'Palmetto Property Partners',
    contact: 'Serena Diaz',
    channel: 'Email',
    messagedDaysAgo: 4,
    preview: 'Hi Serena, quick one -- we help vacation rental managers in Florida handle after-hours guest issues automatically. Worth 10 minutes?',
    campaign: 'HostCo',
    email: 'serena@palmettoprop.com',
  },
  {
    id: 'ar3',
    business: 'Gulf Coast Getaways',
    contact: 'Ray Okonkwo',
    channel: 'Instagram',
    messagedDaysAgo: 1,
    preview: "Hey Ray! Love what you're doing with Gulf Coast Getaways. We help STR managers handle guest messages 24/7 without hiring staff. Open to a quick chat?",
    campaign: 'HostCo',
    instagram: '@gulfcoastgetaways',
  },
  {
    id: 'ar4',
    business: 'Blue Wave Vacation Homes',
    contact: 'Jamie Torres',
    channel: 'Instagram',
    messagedDaysAgo: 3,
    preview: 'Hi Jamie, saw your Blue Wave listings -- really clean properties. We work with managers your size on after-hours guest support. Interested?',
    campaign: 'HostCo',
    instagram: '@bluewavevh',
  },
  {
    id: 'ar5',
    business: 'Coastal Nest Properties',
    contact: 'Nina Park',
    channel: 'LinkedIn',
    messagedDaysAgo: 5,
    preview: "Hi Nina, I came across Coastal Nest and noticed you're growing fast in Tampa. We've helped similar operators cut guest complaint rates by 40%...",
    campaign: 'HostCo',
    linkedin: 'linkedin.com/in/ninapark',
  },
  {
    id: 'ar6',
    business: 'Harbor Light Hospitality',
    contact: 'Dean Russo',
    channel: 'LinkedIn',
    messagedDaysAgo: 6,
    preview: 'Dean, congrats on the recent expansion to Clearwater. We work with hospitality operators to automate guest communication overnight...',
    campaign: 'ReceptAI',
    linkedin: 'linkedin.com/in/deanrusso',
  },
  {
    id: 'ar7',
    business: 'TropicStay Management',
    contact: 'Hadi Nazari',
    channel: 'Email',
    messagedDaysAgo: 7,
    preview: 'Hi Hadi, following up on my earlier note. ReceptAI helps hotels and boutique properties handle front-desk overflow automatically...',
    campaign: 'ReceptAI',
    email: 'hadi@tropicstay.com',
  },
  {
    id: 'ar8',
    business: 'Sunridge Hotel Group',
    contact: 'Priya Mehta',
    channel: 'Email',
    messagedDaysAgo: 2,
    preview: "Hi Priya, saw Sunridge just opened its second property -- congrats! ReceptAI handles overnight front-desk queries so your team isn't on call 24/7...",
    campaign: 'ReceptAI',
    email: 'priya@sunridgehotels.com',
  },
];

export interface AwaitingReplyLead {
  id: string;
  business: string;
  contact: string;
  channel: 'Email' | 'Instagram' | 'LinkedIn';
  messagedDaysAgo: number;
  preview: string;
  campaign: string;
  email?: string;
  instagram?: string;
  linkedin?: string;
}

export type ReplyLabel =
  | 'Interested'
  | 'Asked a question'
  | 'Objection'
  | 'Not now'
  | 'Not interested'
  | 'Wrong person';

export interface LoggedReply {
  id: string;
  business: string;
  contact: string;
  channel: 'Email' | 'Instagram' | 'LinkedIn';
  label: ReplyLabel;
  text: string;
  receivedAt: Date; // when the reply came in (used for urgency)
  status: 'open' | 'handled' | 'snoozed';
  campaign: string;
  email?: string;
  instagram?: string;
  linkedin?: string;
  touchHistory: { channel: string; outcome: string; date: Date; note?: string }[];
  draftResponse: string;
}

// 4 logged replies: 1 red (>24h), 1 amber (4-24h), 2 green (<4h)
export const loggedReplies: LoggedReply[] = [
  {
    id: 'lr1',
    business: 'Sunshine Property Management',
    contact: 'Dana Kim',
    channel: 'Email',
    label: 'Interested',
    text: "Thanks for reaching out. We've actually been looking at guest messaging tools for a while. Can you send over pricing? We manage about 35 properties right now and after-hours calls are killing us.",
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 31), // 31h ago -- RED
    status: 'open',
    campaign: 'HostCo',
    email: 'dana@sunshinepm.com',
    touchHistory: [
      { channel: 'Email', outcome: 'Sent', date: new Date(Date.now() - 1000 * 60 * 60 * 56), note: 'Intro email' },
      { channel: 'Email', outcome: 'Replied', date: new Date(Date.now() - 1000 * 60 * 60 * 31) },
    ],
    draftResponse: "Hi Dana, great to hear -- and 35 properties with after-hours calls sounds exhausting. Our pricing is per listing, most managers your size pay $8-12/listing/month. That's usually less than one hour of your time handling a midnight guest issue.\n\nHappy to run through an exact number and show you a 5-minute demo of how it works. Does Thursday morning work?",
  },
  {
    id: 'lr2',
    business: 'Gulf Coast Getaways',
    contact: 'Ray Okonkwo',
    channel: 'Instagram',
    label: 'Asked a question',
    text: "What does this actually do differently from just turning on auto-replies in Instagram? We already have that set up",
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 9), // 9h ago -- AMBER
    status: 'open',
    campaign: 'HostCo',
    instagram: '@gulfcoastgetaways',
    touchHistory: [
      { channel: 'Instagram', outcome: 'DM sent', date: new Date(Date.now() - 1000 * 60 * 60 * 24), note: 'First DM' },
      { channel: 'Instagram', outcome: 'Replied', date: new Date(Date.now() - 1000 * 60 * 60 * 9) },
    ],
    draftResponse: "Great question -- auto-replies just acknowledge the message. HostCo actually resolves the issue. If a guest says the WiFi is down at 1am, we troubleshoot it, contact the host if needed, and follow up until it's fixed. Auto-replies just say 'we'll get back to you' and leave the guest hanging.\n\nMost of our managers describe it as having a night manager without hiring one. Worth a 10-min call to see if it fits?",
  },
  {
    id: 'lr3',
    business: 'Palmetto Property Partners',
    contact: 'Serena Diaz',
    channel: 'Email',
    label: 'Objection',
    text: "We looked at something similar last year and it was way too expensive for what it did. What makes this different from the other tools out there?",
    receivedAt: new Date(Date.now() - 1000 * 60 * 90), // 90min ago -- GREEN
    status: 'open',
    campaign: 'HostCo',
    email: 'serena@palmettoprop.com',
    touchHistory: [
      { channel: 'Email', outcome: 'Sent', date: new Date(Date.now() - 1000 * 60 * 60 * 96), note: 'Intro email' },
      { channel: 'Email', outcome: 'Replied', date: new Date(Date.now() - 1000 * 60 * 90) },
    ],
    draftResponse: "Totally fair -- a lot of tools in this space are expensive and don't do enough. Two things are different here:\n\n1. We're per-listing, not per-seat. At 25 properties you'd pay around $200-300/month -- likely less than what one bad-review weekend costs you.\n2. We actually handle the issue end-to-end, not just route the message. Your team stops getting woken up.\n\nI can show you exactly what it would cost for Palmetto's property count in 10 minutes. When works?",
  },
  {
    id: 'lr4',
    business: 'TropicStay Management',
    contact: 'Hadi Nazari',
    channel: 'Email',
    label: 'Not now',
    text: "Not the right time for us honestly. We're going through a bit of a restructure and don't want to add new tools right now. Maybe in Q1.",
    receivedAt: new Date(Date.now() - 1000 * 60 * 45), // 45min ago -- GREEN
    status: 'open',
    campaign: 'ReceptAI',
    email: 'hadi@tropicstay.com',
    touchHistory: [
      { channel: 'Email', outcome: 'Sent', date: new Date(Date.now() - 1000 * 60 * 60 * 168), note: 'Follow-up' },
      { channel: 'Email', outcome: 'Replied', date: new Date(Date.now() - 1000 * 60 * 45) },
    ],
    draftResponse: "Completely understand -- a restructure is exactly the wrong time to evaluate new tools. I'll reach out in January when things have settled.\n\nOne thing worth keeping in mind: Q1 is peak booking season for most hospitality operators, so that's actually when guest communication volume spikes. Happy to time a conversation for when it's useful.\n\nGood luck with the restructure.",
  },
];

export const leads = [
  {
    id: 'l1',
    business: 'Suncoast Stays',
    city: 'Orlando, FL',
    contact: 'Marcus Webb',
    title: 'Founder',
    phone: '+1 407 555 0182',
    email: 'marcus@suncoaststays.com',
    instagram: '@suncoaststays',
    linkedin: null,
    fitScore: 92,
    status: 'queued' as const,
    channel: 'Call' as const,
    signals: ['Uses Guesty', '~40 listings', 'Instagram active', 'Has website'],
    gaps: ['No 24/7 listed'],
    flowReason: '~40 listings, uses Guesty, no night support listed. Strong fit.',
    campaign: 'c1',
    cadenceStep: 1,
    nextAction: new Date(Date.now() + 1000 * 60 * 30),
    touchHistory: [],
  },
  {
    id: 'l2',
    business: 'Palmetto Property Partners',
    city: 'Miami, FL',
    contact: 'Serena Diaz',
    title: 'Operations Manager',
    phone: '+1 305 555 0241',
    email: 'serena@palmettoprop.com',
    instagram: '@palmettoprop',
    linkedin: null,
    fitScore: 78,
    status: 'queued' as const,
    channel: 'Email' as const,
    signals: ['~25 listings', 'Has website', 'Operations Manager on site'],
    gaps: ['No Guesty mention', 'Size unclear'],
    flowReason: '~25 listings, professional ops team. Likely open to tools.',
    campaign: 'c1',
    cadenceStep: 1,
    nextAction: new Date(Date.now() + 1000 * 60 * 60),
    touchHistory: [],
  },
  {
    id: 'l3',
    business: 'Gulf Coast Getaways',
    city: 'Tampa, FL',
    contact: 'Ray Okonkwo',
    title: 'Owner',
    phone: '+1 813 555 0309',
    email: null,
    instagram: '@gulfcoastgetaways',
    linkedin: 'linkedin.com/in/rayokonkwo',
    fitScore: 85,
    status: 'queued' as const,
    channel: 'Instagram' as const,
    signals: ['~60 listings', 'Instagram active', 'Mentions after-hours'],
    gaps: ['No email found'],
    flowReason: '~60 listings, active on Instagram, mentions guest issues. Perfect fit.',
    campaign: 'c1',
    cadenceStep: 1,
    nextAction: new Date(Date.now() + 1000 * 60 * 90),
    touchHistory: [],
  },
];

export const deals = [
  {
    id: 'd1',
    business: 'Suncoast Stays',
    contact: 'Marcus Webb',
    stage: 'Demo booked' as const,
    value: 480,
    daysInStage: 2,
    nextStep: 'Demo call Friday 2pm',
    nextStepDate: new Date(Date.now() + 1000 * 60 * 60 * 48),
    flowMove: "Send a prep email tonight with what you'll cover. Include a one-paragraph case study from a similar Florida manager.",
    stale: false,
  },
  {
    id: 'd2',
    business: 'TropicStay Management',
    contact: 'Hadi Nazari',
    stage: 'Interested' as const,
    value: 720,
    daysInStage: 9,
    nextStep: 'Send pricing one-pager',
    nextStepDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
    flowMove: "Send the pricing one-pager today. It's been 9 days since their last message -- follow up or lose the deal.",
    stale: true,
  },
];

export const teamMembers = [
  { id: 'u1', name: 'Baryal Karimi', role: 'rep', calls: 18, emails: 24, dms: 11, conversations: 7, meetings: 2, deals: 0, streak: 7, targetPct: 72 },
  { id: 'u2', name: 'Hadi Nazari', role: 'rep', calls: 22, emails: 31, dms: 8, conversations: 11, meetings: 3, deals: 1, streak: 12, targetPct: 91 },
  { id: 'u3', name: 'Zara Ahmed', role: 'manager', calls: 5, emails: 12, dms: 3, conversations: 4, meetings: 2, deals: 0, streak: 4, targetPct: 48 },
];

export interface ProductFeature {
  feature: string;
  problem: string;
}

export interface CaseStudy {
  customer: string;
  result: string;
  quote: string;
  okToName: boolean;
}

export interface Competitor {
  name: string;
  howWeDiffer: string;
}

export interface Product {
  id: string;
  name: string;
  logoInitials: string;
  logoColor: string;
  website: string;
  description: string;
  idealCustomer: string;
  decisionMakers: string[];
  features: ProductFeature[];
  pricingModel: string;
  priceRange: string;
  freeTrial: boolean;
  caseStudies: CaseStudy[];
  competitors: Competitor[];
  knowledgeFiles: string[];
  donts: string;
  lastUpdated: string;
  campaignCount: number;
}

export const products: Product[] = [
  {
    id: 'p1',
    name: 'HostCo',
    logoInitials: 'HC',
    logoColor: '#34E0A1',
    website: 'https://hostco.io',
    description: 'AI guest communication for short-term rental managers -- handles after-hours issues so your team isn\'t on call 24/7.',
    idealCustomer: 'Vacation rental management companies with 10-200 listings that still handle guest issues manually, especially at night.',
    decisionMakers: ['Owner', 'Founder', 'Operations Manager'],
    features: [
      { feature: '24/7 AI guest messaging', problem: 'Owners get woken up at 2am for WiFi issues and check-in problems' },
      { feature: 'Guesty integration', problem: 'Property data is siloed; AI needs context to help guests' },
      { feature: 'Escalation to human', problem: 'Some issues genuinely need a person -- AI knows when to hand off' },
      { feature: 'Review protection alerts', problem: 'Bad reviews often come from unresolved issues that festered overnight' },
    ],
    pricingModel: 'Per listing',
    priceRange: '$8-12/listing/month',
    freeTrial: true,
    caseStudies: [
      { customer: 'Suncoast Stays', result: '40% fewer after-hours calls in first 30 days', quote: 'I slept through the night for the first time in 3 years.', okToName: true },
      { customer: 'Gulf Coast Getaways', result: 'Response time dropped from 4h to 4min', quote: 'Guests stopped complaining about response time in reviews.', okToName: false },
    ],
    competitors: [
      { name: 'Superhog', howWeDiffer: 'They focus on guest screening and damage protection -- we handle active communication and issue resolution.' },
      { name: 'Hostfully', howWeDiffer: 'Hostfully is a full PMS. We slot in alongside any PMS to handle the communication layer only.' },
      { name: 'NoiseAware', howWeDiffer: 'Hardware noise monitoring, not communication. Complementary, not competing.' },
    ],
    knowledgeFiles: ['HostCo_Overview_Deck.pdf', 'Pricing_Guide_2025.pdf'],
    donts: 'Never promise a specific response time SLA without checking with the customer\'s tier. Never say "unlimited" -- we have fair use limits. Don\'t compare directly to Airbnb\'s own tools; they\'re a partner, not a competitor.',
    lastUpdated: 'Sep 18, 2026',
    campaignCount: 1,
  },
  {
    id: 'p2',
    name: 'ReceptAI',
    logoInitials: 'RA',
    logoColor: '#60A5FA',
    website: 'https://receptai.com',
    description: 'AI front-desk overflow for hotels and boutique properties -- handles guest queries, bookings calls, and night-shift gaps.',
    idealCustomer: 'Independent hotels, boutique properties, and small hotel groups (20-200 rooms) without 24/7 front desk staffing.',
    decisionMakers: ['General Manager', 'Owner', 'Director of Operations'],
    features: [
      { feature: 'Overnight call handling', problem: 'Front desk staff go home; guests still call with questions and issues' },
      { feature: 'Booking inquiry capture', problem: 'Missed calls after hours mean lost direct bookings' },
      { feature: 'PMS integration (Opera, Mews)', problem: 'AI needs live reservation data to answer guest questions accurately' },
      { feature: 'Multilingual support', problem: 'International guests can\'t communicate in off-peak hours' },
    ],
    pricingModel: 'Flat monthly',
    priceRange: '$299-799/month',
    freeTrial: false,
    caseStudies: [
      { customer: 'The Willowbrook Inn', result: 'Captured 18 direct bookings in first month from after-hours calls', quote: 'It paid for itself in week two.', okToName: true },
    ],
    competitors: [
      { name: 'Cloudbeds AI', howWeDiffer: 'Cloudbeds is a full PMS with AI add-ons. We integrate with any PMS and focus entirely on the communication gap.' },
      { name: 'Apaleo', howWeDiffer: 'API-first PMS platform, not communication-focused. Different buyer, different budget.' },
    ],
    knowledgeFiles: ['ReceptAI_One_Pager.pdf'],
    donts: 'Never promise PMS integrations that aren\'t on the supported list. Don\'t position as a replacement for front desk staff -- it\'s overflow support, not a headcount cut.',
    lastUpdated: 'Sep 10, 2026',
    campaignCount: 1,
  },
];

export const runningLeadGenJobs = [
  {
    id: 'j1',
    campaign: 'HostCo -- Florida STR Managers',
    icp: 'Mid-size STR managers',
    location: 'Orlando · vacation rental management',
    found: 67,
    enriched: 52,
    matched: 38,
    deduped: 35,
    ready: 28,
    total: 100,
    startedAt: new Date(Date.now() - 1000 * 60 * 22),
    etaMinutes: 18,
    aiCost: 1.24,
    flowNarration: 'Found 67 vacation rental managers in Orlando. 38 match the ICP -- Guesty mentions and Instagram accounts are common here.',
    status: 'running' as const,
    autoRun: true,
    leadsReady: 28,
  },
];
