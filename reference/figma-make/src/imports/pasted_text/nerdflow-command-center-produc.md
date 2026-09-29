NerdFlow Command Center — Product Doc v2
24 Sept 2026 · @Muqeet
Overview
The Command Center is a daily sales cockpit where AI finds the leads and Flow, the assistant, walks any team member through every touch. A rep should be able to sit down, pick "calls for the next hour", and have everything they need on one screen.
The core loop: Campaign → Market Research (AI) → ICP (AI) → Lead Generation (AI scraping from Google) → Lead review → Focus mode → Outcome → Follow-up.
flowchart LR
  A[Create campaign] --> B[AI market research]
  B --> C[AI ICP]
  C --> D[AI lead scraping]
  D --> E[Review & approve]
  E --> F[Focus mode]
  F --> G[Log outcome]
  G --> H[Follow-up / Replies]
  H --> F
Every AI step ends in a human approval before the next one starts.
Why v1 missed: it was a generic CRM skeleton. It shipped no lead generation, AI that only rewrote one summary, heavy admin tooling for a three-person team, and a flat, spreadsheet-like look.
Success looks like:
• A non-sales team member completes a one-hour Focus session on day one without asking anyone for help.
• A new campaign goes from idea to an approved lead queue in one sitting, with no CSV uploads.
• Reps open the app every working day because the queue is full and good.
• No replied lead is ever lost; every reply sits in a queue until someone acts on it.
Products in scope: HostCo and ReceptAI campaigns first.
Users & roles
Three roles, kept deliberately simple. The primary user is a rep with little or no sales experience.
Role
Who
Main screens
Can do
Rep
Anyone doing outreach, including non-sales staff
Today, Focus mode, Replies, Deals (own)
Work the queue, log outcomes, draft campaigns (need approval), chat with Flow
Manager
Sales lead (CSO)
Everything a rep sees + Lead Generation, Lead review, Team
Approve campaigns and ICPs, launch scraping runs, approve leads, see team numbers
Admin
Founder
Everything + Settings
Add people, set targets, set AI budget
One login screen, email + password. No invite ceremony, audit log or multi-step tour in v2.
Look & feel
It should feel like stepping into a cockpit with a co-pilot, not opening a spreadsheet. Dark-first, calm, and rewarding to use every day.
Principles
• Flow is the home screen. The assistant greets you and tells you what to do, instead of a grid of widgets.
• One thing at a time. Focus mode shows one lead and one action. Tables only live on manager screens.
• Show the AI working. Research, ICP building and scraping show live progress (steps ticking, leads appearing), so users trust and enjoy it.
• Make progress visible. Streaks, daily target rings and small wins ("3 conversations today") on every screen.
• Big, friendly type. The next action should be readable from arm's length while on a call.
Brand tokens (dark mode default, light mode supported)
Token
Dark
Light
Background
#050807
#F5FAF8
Surface / card
#0B1210
#FFFFFF
Secondary surface
#121A17
#E8F2EE
Border / muted
#1D2925
#B8C9C2
Primary accent
#34E0A1
#20B982
Primary hover
#20B982
#087A57
Tint / highlight
#087A57 at low opacity
#D8FAED
Headings
#FFFFFF
#050807
Body text
#B8C9C2
#42524C
Font: Sora. Use the glasses mark from the NerdFlow logo as Flow's avatar, with a subtle glow or pulse when it is thinking.
Status colors (add to the palette): hot lead = primary green, warm = amber, cold = muted gray, risk = soft red. Use each for at most one meaning.
Navigation & screen map
A slim left sidebar with seven items, plus Flow available everywhere as a docked panel (right side, collapsible, shortcut /).
#
Screen
Who
Purpose
1
Today
All
Flow's daily brief and the "start a session" button
2
Focus mode
All
Work leads one at a time by channel
3
Replies
All
Every lead who replied, until someone acts
4
Campaigns
All (create), Manager (approve)
Campaign wizard, research, ICP, playbook
5
Lead Generation
Manager, Admin (reps view only)
Live AI scraping runs per campaign and ICP
6
Deals
All
Board of interested leads moving to close
7
Team
Manager, Admin
Scoreboard and targets
Sidebar footer: user avatar, streak counter, settings (admin only), theme toggle.
The sidebar badge counts: Focus = leads due now, Replies = unhandled replies, Lead Generation = runs in progress or leads awaiting review.
Flow, the assistant
Flow is a Jarvis-style co-pilot whose job is to turn a non-sales person into a competent salesperson. It always knows the context: which screen you're on, which campaign, which lead, and how your day is going.
Personality: calm, direct, encouraging, a little witty. It speaks like a senior sales mentor sitting next to you, not a chatbot. Short sentences, always ending in a clear next action.
Where Flow appears
• Docked panel on every screen: chat input, suggested prompts that change per screen, and a voice-style "thinking" state.
• Inline cards inside screens (e.g. "Flow's tip" in Focus mode). These are the main way users meet Flow; most never need to type.
• Home screen greeting on Today.
What Flow does, by screen
Screen
Flow's job
Today
Morning brief in plain words, sets the plan for the day, celebrates yesterday's wins
Campaigns
Runs market research, drafts the ICP, writes the playbook, messages and objection answers
Lead Generation
Narrates the run live ("Found 42 property managers in Orlando, 18 match the ICP")
Lead review
Explains each lead's fit score and gaps in one line
Focus mode (before touch)
Lead summary, the angle to use, opener, likely objections with answers
Focus mode (during call)
Rep types or taps what the lead said ("too expensive", "send me an email"); Flow replies instantly with what to say
Focus mode (after touch)
Suggests the outcome, drafts the follow-up message, schedules the next step
Replies
Reads the reply, labels it (interested, question, objection, not now), drafts the response
Deals
Tells you the single next move to push the deal forward
Practice (from Flow panel)
Role-plays a prospect from any campaign so reps can rehearse
Rules for Flow
• Never sends anything on its own. It drafts; the rep copies or approves.
• Every suggestion has a one-tap "use this" action.
• If AI is unavailable or the budget is hit, Flow falls back to the campaign's saved scripts and says so plainly.
Prototype note: design the panel in three states (idle with suggested prompts, thinking, answered with action buttons) and the inline tip card in two sizes.
Today (home)
Today answers one question: what should I do right now? Flow leads the screen and one big button starts a session.
Layout, top to bottom
1. Flow greeting (large): "Morning, Baryal. 24 leads are ready, 3 people replied overnight, and you're 2 calls from beating yesterday. Start with replies."
2. Primary action: "Start a Focus session" button, plus a secondary "Handle 3 replies" button when replies exist.
3. Today's targets: progress rings for Calls, Emails, DMs and Conversations (actual / target), plus the streak flame.
4. Ready now: channel chips with counts (Call 12 · Email 8 · Instagram 3 · LinkedIn 1); tapping one jumps into Focus mode with that filter.
5. Wins strip: yesterday's positive outcomes and team highlights ("Hadi booked a demo with a 60-listing PM").
6. End-of-day card (after 5pm in the rep's timezone): "Close out your day" with a 30-second recap Flow writes for you.
Fields shown: user first name, leads due by channel, unhandled replies count, target vs. actual per metric, streak days, top win of yesterday.
States: first day (Flow introduces itself and offers a 2-minute walkthrough), normal day, empty queue (Flow suggests launching a scraping run or asks a manager to), all targets hit (celebration).
Campaigns
A campaign is created through a four-step wizard where Flow does the research and writing and the user approves each step. The wizard's progress bar reads: Brief → Research → ICP → Playbook.
Step 1: Brief (user fills in)
Field
Type
Example
Campaign name
Text
HostCo — Florida STR managers
Product
Dropdown (HostCo, ReceptAI, + add)
HostCo
Target market in plain words
Text area
Short-term rental property managers in Florida using Guesty
Geography
Country, state/region, cities (multi)
US → Florida → Orlando, Miami, Tampa
Channels allowed
Multi-select: Call, Email, Instagram, LinkedIn
Call, Email, Instagram
Goal
Dropdown: Book demo, Free trial, Reply
Book demo
Lead target
Number
300 leads
Anything Flow should know
Text area, optional
We charge per listing; strong in after-hours guest messaging
Button: "Let Flow research this".
Step 2: Market Research (AI)
Flow researches the market on the web and shows live progress, then a research card. The user can edit any part or ask Flow to dig deeper on one point.
• Progress checklist (animated): Sizing the market → Finding who buys → Reading reviews and forums → Checking competitors → Writing summary.
• Output card sections: market snapshot (size, key players), who buys and why, top 5 pain points in their own words, competitors and how we differ, best channels to reach them, suggested angles (3).
• Each finding shows its source links.
• Actions: Approve research · Ask Flow a follow-up · Redo.
Step 3: ICP (AI)
Flow turns the research into a structured ICP the scraper will use. Every field is editable.
ICP field
Type
Example
Business type
Tags
Vacation rental management company
Search keywords for Google
Tags
vacation rental management, Airbnb management, STR co-host
Size signals
Range + text
10–200 listings; 3–50 staff
Must-have signals
Tags
Has website; lists properties; operates in target city
Nice-to-have signals
Tags
Mentions Guesty; 24/7 guest support; Instagram active
Disqualifiers
Tags
Single-owner host; hotel chain; franchise HQ
Decision-maker titles
Tags
Owner, Founder, Operations Manager
Scoring weights
Sliders per signal
Mentions Guesty = high
Actions: Approve ICP · Save as reusable ICP. A campaign can have more than one ICP (e.g. small vs. large managers).
Step 4: Playbook (AI)
Flow writes: the day-by-day cadence per channel, message templates per channel, call opener and short talk track, top objections with answers, and a kill rule (e.g. stop after 5 touches with no reply). All editable, versioned.
Approval: a rep's campaign goes to a manager before going live; a manager's campaign goes live on approval of step 4.
Campaign detail page tabs: Overview (stats: leads, touched, replies, meetings) · Research · ICPs · Playbook · Lead Generation runs · Notes.
States to design: wizard steps 1–4, research in progress, research done, ICP editing, pending approval, live, paused.
Lead Generation
Lead Generation is a live control room where you watch the AI find, enrich and score leads for a specific campaign and ICP. This is the screen that should make people want to open the app.
Page layout
1. Header: "Lead Generation" + "New run" button + filters (Campaign, ICP, Status, Date).
2. Active runs (cards, top): one card per running job.
3. Run history (list below): past runs with results.
4. Run detail (opens when a card is clicked): full live view.
Active run card shows
• Campaign name + ICP name (e.g. HostCo Florida → "Mid-size STR managers")
• Current location and keyword being searched ("Orlando · vacation rental management")
• Pipeline counters with a progress bar: Found → Enriched → Matched ICP → Duplicates removed → Ready for review
• Flow's one-line narration, updating live
• Started time, ETA, AI cost so far
• Actions: Pause · Stop · View live
Run detail (live view)
flowchart LR
  A[Google search<br/>by city + keyword] --> B[Visit website<br/>& socials]
  B --> C[Extract contacts<br/>& signals]
  C --> D[Score vs ICP]
  D --> E[Dedupe]
  E --> F[Ready for review]
• Stage strip across the top matching the diagram, each stage with a live count.
• Live feed below: leads appearing one by one as rows, each with business name, city, fit score badge, found channels (phone, email, Instagram, LinkedIn icons) and Flow's one-line reason ("Manages ~40 listings, mentions Guesty, Instagram active").
• Side panel: search plan (cities × keywords grid, ticking off as done), and the run settings.
• Button when done: "Review 86 leads" → Lead review.
New run modal (fields)
Field
Type
Campaign
Dropdown (live campaigns only)
ICP
Dropdown (from that campaign)
Locations
Pre-filled from campaign, editable
Keywords
Pre-filled from ICP, editable
Max leads
Number (default 100)
Min fit score to keep
Slider (default 50)
Schedule
Run once · Daily · Weekly
Auto-approve leads above
Optional slider (e.g. 85)
Footer of the modal: estimated time and estimated AI cost for the run.
Run history row: campaign, ICP, date, leads found, leads matched, approved, reply rate so far, cost. Clicking opens the run's leads.
States to design: no runs yet (Flow: "Pick a campaign and I'll go find your first leads"), running, paused, completed, failed (with plain reason and retry), budget hit.
Lead review
Scraped leads wait here until a manager approves them into the queue. It's a fast, swipe-like review, not a spreadsheet. Reached from a finished run or the Lead Generation badge.
Layout: list on the left (sorted by fit score), selected lead's card on the right.
Lead card shows: business name, logo/screenshot of website, city, fit score (0–100) with Flow's one-line reason, matched ICP signals (green chips), gaps (gray chips, e.g. "No email found", "Size unclear"), contact person + title if found, available channels with the actual phone / email / Instagram / LinkedIn, and a link to the source.
Actions: Approve (A) · Reject with reason (R) · Skip (S) · bulk "Approve all above 80". Reject reasons are a short list (Wrong type, Too small, Too big, Bad data, Already a customer) and feed the next run's scoring.
Result: approved leads enter Focus mode for that campaign, starting at cadence step 1.
Focus mode
Focus mode is a distraction-free session: the rep picks a channel and a time block, the app goes full-screen, and every lead arrives with everything needed to make that touch a success. Calls are dialed manually in the rep's own dialer (no CallHippo integration in this version).
1. Session setup
A modal from Today or the sidebar.
Field
Type
Example
Channel
Big single-select tiles with counts: Call · Email · Instagram DM · LinkedIn DM
Call (12 ready)
Session length
30 min · 1 hr · 2 hr · Until queue empty
1 hr
Campaign
All or pick one
All
Session goal
Auto-suggested by Flow, editable
15 calls, 3 conversations
Button: "Start session". The sidebar and nav collapse; only a thin top bar remains.
2. Session top bar (always visible)
Channel icon · timer counting down · progress ("6 / 15 calls") · conversations so far · Pause · End session.
3. The lead screen (Call version)
Three columns so the rep can glance at it mid-call.
Left: Who you're calling
• Business name, city, local time for the lead (with a warning if outside business hours)
• Contact name and title (or "Ask for the owner" if unknown)
• Phone number, large, with a Copy button (shortcut C)
• Other channels found (email, Instagram, LinkedIn) as small links
• Fit score + matched signals + gaps ("No decision-maker name", "Size unknown")
• Touch history: previous attempts, dates and outcomes, last notes
• Source link and website link
Center: Your call plan (Flow)
• Why this lead: one line ("~40 listings, uses Guesty, no night support listed")
• Opener: 2–3 sentences to read out, personalised to this lead
• Questions to ask (3 discovery questions, tick as asked)
• Talk track: short bullets for the pitch
• The ask: what to close on ("Book a 15-min demo this week")
Right: Live help (Flow)
• Quick-tap objection buttons: "Too expensive" · "Already have a tool" · "Send me an email" · "Not the decision maker" · "Bad time" · "Not interested"
• Tapping one instantly shows Flow's suggested response in large type
• Free-text box: "They said…" → Flow answers in one or two lines
• Notes field (auto-saves), used by Flow for the follow-up
4. Outcome panel (after the touch)
Appears at the bottom as a bar of big buttons with keyboard shortcuts.
Call outcomes: No answer (1) · Voicemail (2) · Not interested (3) · Follow-up (4) · Interested / meeting booked (5) · Wrong number / bad data (6)
Email, Instagram, LinkedIn outcomes: Sent (1) · Can't send / no access (2) · Skip (S). Replies are logged later from the Replies screen.
What happens after each outcome
Outcome
Extra fields shown
What the system does
No answer / Voicemail
None
Schedules the next cadence step in working hours; may switch channel per playbook
Not interested
Reason: dropdown (Price, Has a tool, No need, Timing, Other)
Closes lead; reason feeds campaign learning
Follow-up
Next action: Call again · Send email · Send DM · Send info; When: Today later · Tomorrow · Pick date/time; Note for next time
Creates the follow-up task; Flow drafts the follow-up message if it's email or DM
Interested / meeting booked
Meeting date/time, attendees, what they care about
Creates a Deal; Flow drafts a confirmation email
Wrong number / bad data
Optional correction
Flags lead; sends back to review
Sent (email/DM)
None
Starts waiting period per cadence
After saving, Flow shows a 3-second micro-coaching line ("Nice, you asked about their listing count early. Keep doing that.") and the next lead slides in.
5. Email / Instagram / LinkedIn versions
Same three columns, but the center shows Flow's drafted message for that channel (subject + body for email), editable, with Copy (C) and "Open Gmail / Instagram / LinkedIn profile" buttons. The right column offers "Make it shorter", "More casual", "Different angle" rewrites.
6. Queue order within a session
Due follow-ups first (oldest first), then hot new leads (fit ≥ 70), then other new leads. Leads outside their business hours are skipped for calls.
7. Session end screen
Summary: touches, conversations, meetings, best moment, and one thing to improve, written by Flow. Buttons: "Another 30 min" · "Back to Today".
States to design: setup modal, call screen (default), objection tapped, outcome panel for each outcome type, follow-up scheduling, email variant, DM variant, empty queue, session summary.
Replies
Every lead who replied sits here until a rep acts on it, so no reply is ever lost. It's the fix for v1's biggest gap.
Adding a reply: from any lead (or a "Log a reply" button here), the rep pastes the reply text and picks the channel. Flow labels it automatically; the rep can change the label.
Reply labels: Interested · Question · Objection · Not now (with a date) · Not interested · Wrong person (with referral).
List row shows: lead name, channel icon, label chip, first line of the reply, time since reply (turns amber after 4 hours, red after 24).
Detail view: the full reply, the lead's history, and Flow's drafted response (editable, Copy button). Actions: Mark as sent · Book meeting (creates Deal) · Snooze until date · Close lead.
Empty state: "All caught up. Nobody's waiting on you."
Deals & Team
Both screens stay light in v2; the energy goes into lead generation and Focus mode.
Deals board: columns Interested → Demo booked → Demo done → Proposal → Won / Lost. Each card: business, contact, monthly value, days in stage, Flow's next move ("Send the pricing one-pager today"), and a red dot if nothing happened in 7 days. Opening a card shows people, timeline, next step with date, and a Flow panel for prep before a demo.
Team (manager/admin): one row per rep for the chosen week: calls, emails, DMs, conversations, meetings, deals won, streak, and target % as a progress bar. Click a rep to see their sessions and Flow's coaching notes. Targets are set per rep from here.
Settings (admin): people (add, change role, deactivate), monthly AI budget, working hours defaults. Nothing else.
Core data objects
Ten objects cover everything above. Field lists are for the prototype's realistic sample data and for developers later.
Object
Key fields
Links to
User
name, email, role, timezone, working hours, daily targets, streak
Sessions, Touches
Campaign
name, product, market description, geography, channels, goal, lead target, status (draft, pending, live, paused), playbook version
Research, ICPs, Runs, Leads
Research
snapshot, buyers, pain points, competitors, channels, angles, sources, approved by
Campaign
ICP
name, business types, keywords, size signals, must-haves, nice-to-haves, disqualifiers, titles, weights
Campaign, Runs
Lead Generation Run
campaign, ICP, locations, keywords, max leads, min score, schedule, status, counts per stage, cost, started/ended
Leads
Lead
business, city, website, phone, email, Instagram, LinkedIn, contact name/title, fit score, matched signals, gaps, Flow reason, status (review, queued, in cadence, replied, deal, closed), cadence step, next action + due time
Campaign, Run, Touches, Replies
Touch
lead, user, channel, outcome, reason, notes, next action, created at
Lead, Session
Reply
lead, channel, text, label, status (open, handled, snoozed), response draft
Lead
Deal
lead, stage, monthly value, next step + date, people, lost reason
Lead
Session
user, channel, length, goal, touches, conversations, summary
Touches
Out of scope for now
• CallHippo or any dialer integration (reps copy numbers into their own dialer)
• Call recording, transcription and post-call AI review
• Sending email or DMs from the app (copy-and-send only)
• Gmail / inbox sync (replies are pasted in)
• Slack notifications
• Audit logs, invite flows, multi-step product tours
• CSV import (kept as a hidden fallback only, not in the nav)
Figma prototype checklist
Build around two click-through stories; they cover every screen that matters. Desktop 1440px first, dark mode first.
Story A — Manager launches a campaign: Today → Campaigns → wizard Brief → Research in progress → Research done → ICP → Playbook → Lead Generation new run modal → Run live view → Lead review → approve.
Story B — Rep's call hour: Today → Session setup (Call, 1 hr) → Call screen → tap "Too expensive" → Flow answer → Outcome: Follow-up → schedule tomorrow → coaching line → next lead → Outcome: Interested → meeting fields → End session summary → Replies → draft response.
Frames
[ ] Design tokens page (colors, Sora type scale, spacing, status colors)
[ ] Components: sidebar, Flow panel (idle, thinking, answered), Flow tip card, lead card, fit score badge, channel chips, outcome button bar, progress ring, stage strip
[ ] Login
[ ] Today: first day, normal, empty queue, all targets hit
[ ] Campaign wizard: 4 steps + research in progress + pending approval
[ ] Campaign detail tabs
[ ] Lead Generation: empty, active runs, run live view, new run modal, failed run
[ ] Lead review
[ ] Focus mode: setup modal, call screen, objection tapped, each outcome panel, follow-up scheduling, email variant, DM variant, empty queue, session summary
[ ] Replies: list, detail, empty
[ ] Deals board + deal detail
[ ] Team scoreboard
[ ] Light-mode versions of Today and the call screen
Sample data to use: HostCo campaign targeting Florida STR managers, ReceptAI as a second campaign, three users (admin, manager, rep), about 20 realistic leads.