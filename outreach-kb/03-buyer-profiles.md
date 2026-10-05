# 03 — Buyer Profiles: US Specialty Contractors

> **Product claims warning:** any description in this doc of what ReceptAI does (booking, texting the tech, recordings, transfers, setup time, number forwarding, scripts) is illustrative only. Before using it with a prospect, confirm it in **Product Truth**. If Product Truth doesn't confirm it, leave it out.


**Product:** ReceptAI, an AI receptionist for after-hours and overflow calls. It books the job and texts the on-call tech.
**Offer:** free 2-week after-hours pilot, then about $497/month.
**Market:** US HVAC, plumbing, electrical, garage door, pest control, roofing and restoration companies with roughly 5-50 employees.

## How to read this file

- Every claim backed by a source has an inline URL.
- **(unverified)** means it's synthesized from general industry knowledge or vendor marketing and couldn't be confirmed against a primary source. Use it to shape tone. Never quote it to a prospect as a fact.
- Vendor stats (AI receptionist and answering-service blogs) are marked **(vendor stat)**. They lean toward big numbers. Prefer ServiceTitan's platform data where it exists.

---

## Part A: Market context (read first)

### A1. Typical team structure by size

| Size | Who's on the phones in the day | Who takes the phones after hours | Office roles |
|---|---|---|---|
| 1-4 techs | The owner's cell; office line forwarded to it | The owner's cell, or voicemail | Often a spouse or a part-time helper |
| 5-15 employees (3-8 trucks) | One office person (CSR, dispatcher and bookkeeper rolled into one) plus the owner | Owner, a rotating on-call tech, or an answering service | 1-2 office staff |
| 15-50 employees (8-25 trucks) | 1-3 CSRs, a separate dispatcher, sometimes a call center lead | Answering service or a rotating on-call CSR/dispatcher; tech on-call rotation | Office manager, CSRs, dispatcher, install coordinator, bookkeeper; sometimes a GM or ops manager |

Supporting points:
- Splitting the CSR and dispatcher roles "seems to happen around two and a half to three million of revenue." One dispatcher handles "35 to 40 jobs that day" across about 10 techs (Owned and Operated podcast). https://www.ownedandoperated.com/post/owned-and-operated-separating-dispatch-and-csr-roles-in-your-home-service-business
- A staffing firm's rule of thumb: dispatch needs a software system at 3+ techs, consider splitting CSR and dispatcher at 5-6 trucks, and "missed calls → hire CSR." The firm cites ServiceTitan data that nearly 60% of dispatchers manage fewer than 10 techs. https://virtuestaff.com/2026/09/25/first-office-hire-trades/
- Job postings show after-hours phone coverage gets pushed onto office staff: "Assist with after-hours dispatch responsibilities while serving on the on-call rotation" and "Willingness to participate in a rotating on-call schedule, including evenings, weekends, and holidays." https://cwsuter.com/job-openings-closed/residential-csr-hvac-dispatcher/
- Techs on call commonly rotate a "duty pager" weekly and get 1.5x pay for after-hours calls. https://forums.mikeholt.com/threads/how-you-handle-emergency-calls.49555/ and https://forums.mikeholt.com/threads/after-hours-charge.105106/

### A2. Common software stack

| Tool | Typical fit | Notes |
|---|---|---|
| **ServiceTitan** | Shops of roughly 10-50+ employees and $1M-$10M+ revenue, with dedicated CSRs and dispatch | Per-tech pricing estimated at $245-$500/month, implementation $5K-$50K+, 12-month minimum (estimates, not published). https://resources.rework.com/tools/field-service/servicetitan-vs-housecall-pro |
| **Housecall Pro** | 1-15 techs, under ~$2M | $59-$299/month published tiers. Says it serves 45,000+ businesses. https://resources.rework.com/tools/field-service/servicetitan-vs-housecall-pro |
| **Jobber** | Solo to ~15 techs; strong in lawn, cleaning, and smaller trades | (unverified on exact counts) |
| **FieldEdge** | HVAC/plumbing, often mid-size and long-tenured shops | (unverified) |
| **Workiz** | Garage door, locksmith, appliance, smaller HVAC/plumbing | Workiz launched its own AI answering product ("Genius Answering / Jessica"). https://www.achrnews.com/articles/163805-jessica-is-the-new-ai-answering-service-for-contractors |
| **Service Fusion, FieldPulse, Kickserv** | Smaller shops | (unverified) |
| **Pest-specific: PestPac, FieldRoutes (ServiceTitan), GorillaDesk** | Pest control | (unverified) |
| **Roofing: JobNimbus, AccuLynx, Roofr** | Roofing | (unverified) |
| **Restoration: DASH/Next Gear, Xcelerate, Albi** | Restoration | (unverified) |

ServiceTitan and Housecall Pro are both listed as the scheduling system in CSR/dispatcher job postings. https://www.chamber.conroe.org/jobs/info/administrative-support-clerical-residential-hvac-csr-customer-service-rep-dispatch-501

**How to use this:** Ask, or infer from their website's booking widget or careers page, which field service software (FSM) they run. Lead with "books into [their software]" only if ReceptAI really integrates with it. If it doesn't, say it books the slot and texts the details so the office can enter it.

### A3. Common phone setups

- **Owner's cell as the business line.** The office number is forwarded to a cell. "Simple answer, forward your office phone to your cell. I have had my office phone forwarded to my cell for four years." https://forums.mikeholt.com/threads/answering-service.48418/post-48418
- **Voicemail with an emergency option.** "If you call my office the voice message tells you to hit extension 19 for emergency... our phone system calls a cell phone and two pagers." https://forums.mikeholt.com/threads/how-you-handle-emergency-calls.49555/
- **Answering service after hours.** It takes a message and pages or calls the on-call tech, who calls the customer back. Callers notice: "After hours, many callers will flat out ask 'Is this an answering service?'" https://www.plumbingzone.com/threads/answering-service.1301/
- **VoIP or call tracking at larger shops.** RingCentral, Grasshopper, Nextiva, Dialpad, plus call tracking (CallRail) and ServiceTitan Phones Pro. (unverified as to share)
- **ReceptAI fit:** forwarding on no-answer, on a time-of-day rule, or for all after-hours calls is the simplest pilot setup. It needs no change to their main number.

### A4. Call and booking benchmarks

- **Average call booking rate is 42%.** By trade: plumbing 43%, electrical 41%, HVAC 38% (lower in summer), garage door 31% (ServiceTitan, 3,000+ businesses, 2022 data). https://www.servicetitan.com/blog/data-call-booking-rates
- **Booking rate falls off a cliff after 6pm, especially for small shops.** ServiceTitan's inbound booking rate for businesses with fewer than 5 techs drops from about 26% at peak to about 9% after 6pm. Large businesses go from about 61% to about 21%. https://www.servicetitan.com/blog/data-call-booking-rates (These figures are as extracted by an automated page reader. Re-check the page before quoting.)
- **After-hours share of HVAC calls by season:** 14.1% of inbound calls to residential HVAC shops came outside business hours in June 2025, against 9.8% in October. Weekend share peaked in August at 4.9%. The biggest spike is 5-9pm, with a second one at 6-8am (ServiceTitan State of the Trades). https://www.servicetitan.com/toolbox/state-of-the-trades/trends/hvac-summer-after-hours-call-spike
- A Podium/ACHR piece claims "35-45%" of HVAC calls arrive outside business hours **(vendor stat; conflicts with ServiceTitan's 10-14%. Use ServiceTitan's number.)** https://www.achrnews.com/articles/166041-crawl-walk-run-how-hvac-contractors-are-successfully-adopting-ai-in-2026
- Workiz's analysis of 150,000 calls: "on average, 40 percent of inbound calls go unanswered, and half of those clients have already booked with a competitor by the time they are called back" **(vendor stat)**. https://www.achrnews.com/articles/163805-jessica-is-the-new-ai-answering-service-for-contractors
- Benchmark tables (answer rate: 68% average, 91%+ top quartile; emergency-call booking 70%+) **(vendor/consultant stat)**. https://www.builtontenth.com/hvac-research/why-hvac-csrs-are-losing-you-300k-per-year

**How to use this:** The most defensible line is: "ServiceTitan's own data shows small shops book about 9% of calls after 6pm." Use it with ops managers and ServiceTitan shops. With owner-operators, skip the stats and tell the story of one missed water-heater call.

### A5. Seasonality by trade

| Trade | Peak | Why it matters for after-hours |
|---|---|---|
| HVAC | Summer heat waves (June-Aug) and winter cold snaps (Dec-Feb); slow spring and fall "shoulder seasons" | Searches for "AC repair" jump about 266% in July. Heating repair searches spike in January (WebFX). https://www.webfx.com/blog/home-services/seasonal-search-trends/ After-hours share peaks in June. https://www.servicetitan.com/toolbox/state-of-the-trades/trends/hvac-summer-after-hours-call-spike One owner took 297 calls in a single heat-wave Monday. https://www.cbsnews.com/amp/boston/news/hvac-massachusetts-air-conditioning-service |
| Plumbing | Fairly steady year-round. Frozen-pipe spike in January ("frozen pipe repair" up about 609%); "emergency plumber" up about 191% in July; holiday drain clogs | https://www.webfx.com/blog/home-services/seasonal-search-trends/ |
| Electrical | Most stable (about 20-34% variance). Spikes with storms and outages ("emergency electrician" up about 160%) | https://www.webfx.com/blog/home-services/seasonal-search-trends/ |
| Roofing | Storm-driven (hail and wind in spring and summer, hurricanes Aug-Oct); "roof repair near me" peaks in September | https://www.webfx.com/blog/home-services/seasonal-search-trends/ |
| Garage door | Steady, with cold-weather spring breaks in winter (unverified) | |
| Pest control | Spring through late summer (ants, termites swarming in spring, wasps in summer); rodents in fall and winter (unverified) | |
| Restoration | Winter freezes (burst pipes), storm and hurricane season, any time a pipe bursts. Emergency-heavy, and the first company to answer usually gets the job (unverified) | |

**How to use this:** Time outreach about 4-6 weeks before the trade's peak ("before the first heat wave," "before the first freeze," "before storm season"). Pitch the pilot as a peak-season stress test.

### A6. Economics: what one after-hours call is worth

| Trade | Typical emergency or after-hours job value | Source |
|---|---|---|
| HVAC repair | $350 average repair (range $100-$3,000). Service call fee $100-$250. After-hours adds $40-$80/hour. Compressor $800-$3,000. A system replacement lead is worth far more ($5K-$15K+, unverified) | Angi https://www.angi.com/articles/how-much-hvac-repair-cost.htm |
| Plumbing | Emergency plumbers average $170/hour (range $100-$500), up to $600/hour on holidays; 1.5x evenings, 2x weekends, 3x holidays. Water heater repair $225-$975. Sewer main clog $1,325-$5,000. Burst pipe $150-$5,000 | Angi https://www.angi.com/articles/emergency-plumber-cost.htm |
| Electrical | Emergency rates $150-$200/hour. Service call fee $100-$200 | HomeGuide https://homeguide.com/costs/electrician-cost-per-hour |
| Garage door | Spring replacement averages $250 (range $150-$350). Emergency service "tends to cost more" | Angi https://www.angi.com/articles/how-much-should-garage-door-spring-replacement-cost.htm |
| Roofing | Emergency tarping on a 1,500 sq ft roof costs $1,500-$4,200. The tarp often turns into a repair or replacement job | Angi https://www.angi.com/articles/cost-to-tarp-roof.htm |
| Restoration (water) | National average $3,868 (typical $1,383-$6,369, range $450-$16,000). Often billed through insurance | Angi https://www.angi.com/articles/how-much-does-it-cost-repair-water-damage.htm |
| Pest control | Wasp nest or one-off emergency treatments are low-ticket (roughly $100-$500, unverified). Bed bugs can be $900-$3,800 (pest vendor, unverified). The real value is the recurring plan the call can start | https://pestprothermal.com/bed-bug-exterminators-prices/ (unverified) |

**Break-even math (use it, keep it simple):** At $497/month, ReceptAI pays for itself with about 1-2 booked HVAC or plumbing emergency calls a month, roughly one garage-door spring job a week, or a fraction of one restoration job. Say "one or two after-hours jobs a month covers it." Don't promise revenue numbers.

---

## Part B: Buyer profiles

### Profile 1: Owner-operator (5-15 people)

**Who:** The founder and often still the lead tech. Runs 2-8 trucks. Typical revenue is about $500K-$2M (unverified). The office is one person, often a spouse or relative, sometimes part-time.

**Their day:**
- Up early, on job sites or in the truck most of the day, quoting, fixing whatever broke, chasing parts.
- The business line rings on their cell. They answer between jobs, return calls "at coffee & lunch time" (https://www.contractortalk.com/threads/whats-up-with-not-returning-calls-to-potential-customers.148541/), and do paperwork and estimates at night.
- Usually the default on-call person. Phones go "on my dresser" at night (https://forums.mikeholt.com/threads/do-you-have-different-personal-business-cell-numbers.118012/).

**What they care about:** keeping trucks full, cash flow, not losing jobs to "the next guy on the list," family time, and sleep.

**What keeps them up at night (literally):**
- Missed calls while on a job or driving. "I answer maybe 60%." https://www.contractortalk.com/threads/answering-the-phone.64814/
- Being woken for calls that aren't emergencies, and the guilt when they don't pick up.
- Not being able to afford or find a full-time office person.
- Busy-season overload: "getting run over by your own success."

**How they buy:** Fast and gut-driven. One decider, sometimes checking with a spouse or business partner. Price-sensitive on monthly subscriptions, but will pay if it clearly brings in jobs. Hates contracts and setup projects. Decides in days if the trial is easy.

**Where they spend time:** On their phone in the truck. Facebook groups (trade-specific and owner groups such as "HVAC/R Owners and Managers Advice Group," "HVAC Uncensored Nation," "Grow Your Home Service Business"; https://hookagency.com/blog/best-hvac-facebook-groups/), YouTube, local supply houses, trade forums, podcasts on the road. LinkedIn: rarely. Trade shows: occasionally, mostly distributor or regional events.

**How they react to cold outreach:** Gets buried in calls from SEO, lead-gen and marketing agencies, so the default is skeptical or no reply. Responds to short, plain, specific messages that sound like a person. Text and short email work better than long email. A cold call often goes to voicemail, which is ironic.

**Proof they trust:** A free trial on their own phone line. Hearing a recording of the AI handling a real call. Another owner in the same trade saying it works. A screenshot of a 9pm job booked and texted to the tech. They don't care about logos or funding rounds.

**Best angle:** "Get your nights back without losing the job." The AI answers after hours, books the real emergencies, texts you only when it matters, and takes the rest for the morning. Two weeks free. Nothing to change on your number.

**Likely objections and how to respond:**
- *"My customers want a real person / they'll hang up on a robot."* → Offer a sample call or the demo line so they can judge for themselves [confirm in Product Truth what it can do, e.g. transfers]. Most callers care that someone answered and booked them.
- *"I just answer my own phone."* → Agree, then ask: "What about when you're under a house or asleep?" Many contractors themselves say callers move on to the next company after a few rings (background only, from a Mike Holt forum thread: https://forums.mikeholt.com/threads/answering-service.48418/post-48418). Don't cite the forum to the prospect; ask instead: "When you can't pick up, do those callers usually wait or call someone else?"
- *"$497 is a lot."* → One after-hours water heater or no-cool call covers it. Try it free first.
- *"Tried an answering service, it was garbage."* → Those take messages and "know nothing about your business." ReceptAI books the job and texts your tech.
- *"Not now, I'm slammed."* → That's exactly when calls get missed. Setup time is in Product Truth; quote it only from there. Offer to start the pilot at a time that suits them.

---

### Profile 2: Owner of a growing shop (15-50 people)

**Who:** The founder, mostly out of the truck now. Runs 8-25 techs and has an office of 2-6 (CSRs, a dispatcher, an office manager). Typical revenue $2M-$10M (unverified). Likely on ServiceTitan or another mid-tier FSM. May have a GM.

**Their day:** Meetings with the GM or office manager, sales and replacement pipeline, hiring techs, KPI dashboards (booking rate, average ticket, memberships), marketing spend, putting out people fires. Coaches such as Tommy Mello push KPIs like booking rate and abandonment rate. https://www.contractorgrowthnetwork.com/podcast/scaling-your-contracting-business-w-tommy-mellow/

**What they care about:** Growth, marketing ROI (they pay for LSAs, Google and Angi leads, so a missed call is wasted ad money), booking rate, average ticket, memberships, keeping good CSRs, and peak-season capacity.

**What keeps them up at night:**
- Paying for leads that ring out or go to voicemail after 5pm.
- CSR turnover and the cost of covering nights and weekends with people. Job postings ask CSRs to join on-call rotations, which is a retention problem.
- Peak-season call floods: "Everyone is inundated with phone calls right now." https://www.cbsnews.com/amp/boston/news/hvac-massachusetts-air-conditioning-service
- A current answering service that's slow or gets things wrong and hurts the brand.

**How they buy:** Moderately fast if ROI is clear, usually 1-4 weeks. Often loops in the GM or office manager, who will run the tool day to day. Asks about integration with their FSM, call recordings, reporting, and what happens when the AI gets something wrong. May compare against their answering service's monthly bill.

**Where they spend time:** Peer groups and coaching networks (Nexstar, Service Nation, coaching programs like A1/Mello's Home Service Expert), Service World Expo (Las Vegas, Nov; aimed at residential service contractors, https://www.housecallpro.com/resources/hvac-trade-shows/), the AHR Expo and ACCA conference for HVAC, podcasts, Facebook owner groups, some LinkedIn.

**How they react to cold outreach:** Gets pitched constantly. Responds to specific, verifiable facts about their own business ("your site says 24/7 emergency service"), or to a peer reference. Never pose as a customer or make test calls to check their phones (see Buying Signals rules). Ignores generic AI hype.

**Proof they trust:** Their own call data from the pilot (calls answered, jobs booked, revenue booked after hours). Recordings. Peer case studies in the same trade and size. ServiceTitan-sourced benchmarks (for example, small shops book about 9% after 6pm, https://www.servicetitan.com/blog/data-call-booking-rates).

**Best angle:** "Stop paying for leads that ring out after 5." Overflow and after-hours cover that books into the schedule and texts the on-call tech. It costs less than one CSR shift a week. The pilot report shows booked revenue.

**Likely objections:**
- *"We already have an answering service."* → Compare: message-taking versus a booked job, callback lag versus instant booking. Offer a side-by-side on weekends.
- *"Does it integrate with ServiceTitan / Housecall Pro?"* → Answer truthfully. If not native, explain the text and email handoff.
- *"Brand risk if the AI says something dumb."* → Recordings, scripts they approve, escalation to a human or the on-call tech, and a pilot limited to after hours.
- *"My CSRs will feel threatened."* → It covers the hours they don't want. It doesn't replace them. Even AI adopters say "We will always keep human CSRs." https://www.achrnews.com/articles/155123-can-ai-replace-my-customer-service-representative

---

### Profile 3: General Manager / Operations Manager

**Who:** A hired operator (sometimes a family member or a former top tech or service manager) who runs the daily business for an owner at a 15-50 person shop. Owns KPIs, the office team, dispatch and scheduling.

**Their day:** Morning huddle, watching the dispatch board, handling escalations, reviewing booking rate, answer rate, average ticket and tech productivity, hiring, and vendor management. Often the escalation point on the on-call rotation.

**What they're measured on:** Revenue and margin targets, booking rate, calls answered and abandoned, average ticket, membership sales, customer reviews, labor cost and overtime. Ops people know "abandonment rate." https://www.contractorgrowthnetwork.com/podcast/scaling-your-contracting-business-w-tommy-mellow/

**What keeps them up at night:** Coverage gaps (sick CSRs, turnover, nights and weekends), overtime cost for on-call office staff, bad reviews about "nobody called me back," peak-season overflow, and the owner asking why the numbers dipped.

**How they buy:** Evaluates and recommends. The owner usually signs. Wants data, a clean pilot, and minimal disruption to the team. Usually 2-6 weeks. Will want to see call recordings and set up rules (what counts as an emergency, who gets the text).

**Where they spend time:** LinkedIn (more than owners do), FSM user communities (ServiceTitan's Pantheon conference and user groups, unverified), industry webinars, ACHR News, Contracting Business, peer groups.

**How they react to cold outreach:** More open than owners if the message is operational and specific. Likes metrics and process. Dislikes vague AI promises.

**Proof they trust:** A pilot with clear success criteria. Call-level reporting. Benchmarks from ServiceTitan data. References from GMs at similar shops.

**Best angle:** "Close the after-hours and overflow gap without adding headcount or OT." Measurable pilot: calls answered, jobs booked, emergencies routed to the on-call tech, all with recordings.

**Likely objections:**
- *"I need to see the data and set the rules."* → Offer a pilot scorecard, editable emergency rules and routing.
- *"Another tool to manage."* → It runs after hours on forwarding. The only output is booked jobs and texts.
- *"Owner has to approve."* → Give them a one-paragraph summary and an ROI line they can forward.

---

### Profile 4: Office Manager / Lead CSR / Dispatcher (gatekeeper, user, sometimes champion)

**Who:** The person who answers the main line. At small shops it's often the owner's spouse or a long-time employee doing CSR, dispatch, billing and payroll. At larger shops, the lead CSR or dispatcher.

**Their day:** Phones from open to close, booking calls, juggling the schedule ("When you take a phone call, it's like playing cards... triaging next week's schedule... it's like chess," https://virtuestaff.com/2026/09/25/first-office-hire-trades/), calming upset customers ("can you talk people off a ledge?", https://www.ownedandoperated.com/post/owned-and-operated-separating-dispatch-and-csr-roles-in-your-home-service-business), chasing techs, invoicing. May be on the after-hours rotation.

**What they're measured on or care about:** Booking rate, a full schedule, not getting yelled at by customers or the owner, a manageable workload, and having their evenings and weekends.

**What keeps them up at night:** The after-hours rotation, a pile of voicemails every Monday morning, angry "nobody called me back" customers, and the fear of being replaced by AI.

**How they buy:** Doesn't sign, but can kill or champion a deal. Often screens vendor calls and emails. If they like it, they'll tell the owner "we should try this."

**Where they spend time:** On the phone and in the FSM all day. Facebook groups for CSRs and office managers, and coaching programs such as Power Selling Pros CSR training (https://powersellingpros.com/csr-coaching/). LinkedIn: occasionally.

**How they react to cold outreach:** Protective of the owner's time and wary of anything that sounds like "replace the CSR." Warmer if the pitch takes work off their plate.

**Proof they trust:** Seeing how the booked job and message show up for them. Hearing the AI handle a cranky caller. Knowing they can tune what it says.

**Best angle:** "You shouldn't be on the phone at 10pm. This takes the nights and the overflow, books the real emergencies, and hands you a clean list in the morning." Make them the hero who brings it in.

**Likely objections:**
- *"Is this replacing me?"* → No. It covers the hours you're off and the calls you can't get to when three lines ring at once.
- *"It'll book wrong stuff and I'll have to clean it up."* → You set the rules (job types, service area, emergency definition), and every call has a recording and summary.
- *"Owner won't go for it."* → Offer to send the owner a short note and start the free pilot on weekends only.

---

## Part C: Cross-profile rules (how to use this)

1. **Find the profile before you write.** Under 15 employees and the owner's name on the trucks: Profile 1. 15-50 with a careers page listing CSR or dispatcher roles: Profiles 2-4. Write to the owner and, where possible, also to the GM or office manager with a different angle.
2. **Lead with the trade's emergency and season.** Heat wave or no-cool for HVAC in May-June, frozen pipes in December-January, storms for roofing and restoration.
3. **Use one credible number at most.** Prefer ServiceTitan data or Angi job values. Never use vendor stats like "78% call a competitor within 2 minutes" as fact.
4. **Pitch alongside their people, never as a replacement.** After-hours and overflow only. This disarms the office manager and the "real person" objection.
5. **Make the free 2-week after-hours pilot the ask.** No demo required for owner-operators. For GMs, offer a pilot scorecard.
6. **Handle "we have an answering service" by contrasting a booked job with a message.**
7. **Answer integration questions honestly.** Don't claim a ServiceTitan or Housecall Pro integration unless it exists.
8. **Respect their time:** short messages, plain words (see 02-prospect-language.md), and no follow-up more than about once a week.

---

## Sources

- Owned and Operated podcast #98 (CSR vs dispatch): https://www.ownedandoperated.com/post/owned-and-operated-separating-dispatch-and-csr-roles-in-your-home-service-business
- VirtueStaff, first office hire in the trades: https://virtuestaff.com/2026/09/25/first-office-hire-trades/
- C.W. Suter CSR/Dispatcher job posting: https://cwsuter.com/job-openings-closed/residential-csr-hvac-dispatcher/
- Conroe Chamber, HVAC CSR/Dispatcher job posting: https://www.chamber.conroe.org/jobs/info/administrative-support-clerical-residential-hvac-csr-customer-service-rep-dispatch-501
- Rework, ServiceTitan vs Housecall Pro: https://resources.rework.com/tools/field-service/servicetitan-vs-housecall-pro
- ServiceTitan, call booking rate data report: https://www.servicetitan.com/blog/data-call-booking-rates
- ServiceTitan State of the Trades, HVAC summer after-hours spike: https://www.servicetitan.com/toolbox/state-of-the-trades/trends/hvac-summer-after-hours-call-spike
- ServiceTitan, dispatch management: https://www.servicetitan.com/blog/dispatch-management
- ACHR News, Workiz "Jessica" AI answering: https://www.achrnews.com/articles/163805-jessica-is-the-new-ai-answering-service-for-contractors
- ACHR News, Crawl, Walk, Run (AI adoption): https://www.achrnews.com/articles/166041-crawl-walk-run-how-hvac-contractors-are-successfully-adopting-ai-in-2026
- ACHR News, Can AI Replace My CSR?: https://www.achrnews.com/articles/155123-can-ai-replace-my-customer-service-representative
- ACHR News, Call-answering Services Still Relevant: https://www.achrnews.com/articles/128622-call-answering-services-still-relevant
- Built on Tenth, HVAC CSR booking benchmarks: https://www.builtontenth.com/hvac-research/why-hvac-csrs-are-losing-you-300k-per-year
- WebFX, seasonal home services search trends: https://www.webfx.com/blog/home-services/seasonal-search-trends/
- CBS Boston, HVAC companies overwhelmed with calls: https://www.cbsnews.com/amp/boston/news/hvac-massachusetts-air-conditioning-service
- Angi, HVAC repair cost: https://www.angi.com/articles/how-much-hvac-repair-cost.htm
- Angi, emergency plumber cost: https://www.angi.com/articles/emergency-plumber-cost.htm
- HomeGuide, electrician cost per hour: https://homeguide.com/costs/electrician-cost-per-hour
- Angi, garage door spring replacement cost: https://www.angi.com/articles/how-much-should-garage-door-spring-replacement-cost.htm
- Angi, roof tarp cost: https://www.angi.com/articles/cost-to-tarp-roof.htm
- Angi, water damage restoration cost: https://www.angi.com/articles/how-much-does-it-cost-repair-water-damage.htm
- PestPro Thermal, bed bug prices (unverified vendor): https://pestprothermal.com/bed-bug-exterminators-prices/
- Hook Agency, HVAC Facebook groups: https://hookagency.com/blog/best-hvac-facebook-groups/
- Housecall Pro, HVAC trade shows 2026: https://www.housecallpro.com/resources/hvac-trade-shows/
- Power Selling Pros, CSR coaching: https://powersellingpros.com/csr-coaching/
- Contractor Growth Network podcast with Tommy Mello: https://www.contractorgrowthnetwork.com/podcast/scaling-your-contracting-business-w-tommy-mellow/
- ContractorTalk, Answering the phone: https://www.contractortalk.com/threads/answering-the-phone.64814/
- ContractorTalk, not returning calls: https://www.contractortalk.com/threads/whats-up-with-not-returning-calls-to-potential-customers.148541/
- PlumbingZone, Answering service?: https://www.plumbingzone.com/threads/answering-service.1301/
- Mike Holt Forums (answering service, emergency calls, after-hours charge, personal/business numbers): https://forums.mikeholt.com/threads/answering-service.48418/post-48418 , https://forums.mikeholt.com/threads/how-you-handle-emergency-calls.49555/ , https://forums.mikeholt.com/threads/after-hours-charge.105106/ , https://forums.mikeholt.com/threads/do-you-have-different-personal-business-cell-numbers.118012/

**Caveats:** Revenue bands per profile, pest, roofing and restoration software, garage-door and pest seasonality, and pest ticket values are marked (unverified). Reddit, HVAC-Talk, ElectricianTalk, and Yelp/Google review pages were blocked during research.
