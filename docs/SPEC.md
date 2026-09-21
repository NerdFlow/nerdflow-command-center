# NerdFlow Sales Command Center: Build Specification

Version 1.0 · September 2026 · Owner: Muqeet (CEO) · Process owner: Hadi (CSO)

This document is the blueprint for developers and Claude Code. Every screen, field and interaction is listed. `reference/prototype.html` shows the approved behavior; where the prototype and this spec differ, this spec wins.

---

## 1. Technical overview

A web app for a sales team of 2 to 10 people. Next.js front end and API on Vercel; Supabase for Postgres, authentication and file storage; a Node worker on NerdFlow's own VM runs scheduled and background jobs (lead engine, email sync, transcription, AI reviews). All AI runs server-side through the Claude API.

```
Browser ──► Next.js (Vercel) ──► Supabase Postgres (RLS)
                 │                      ▲
                 ├──► Claude API        │
                 │                      │
          Worker on NerdFlow VM (pg-boss jobs)
           ├── Lead engine: Google Places, open data, Apollo, email verifier
           ├── OpenClaw (sandboxed VM) ──► POST /api/ingest/leads
           ├── Gmail sync (read-only) ──► threads matched to leads/deals
           ├── Calling app webhooks + transcription provider
           └── AI jobs: reviews, briefs, scoring, weekly patterns
```

Design principles: humans send and approve; AI explains its reasoning; every screen works when AI is unavailable (rule-based fallback); every number shown comes from stored data.

---

## 2. Roles and permissions

| Capability | Rep | Manager (Hadi) | Admin (Muqeet) |
|---|---|---|---|
| See own queue, leads, deals | Yes | Yes | Yes |
| See all team leads, deals, activity | No | Yes | Yes |
| Create campaign | Yes (needs approval) | Yes (goes live) | Yes (goes live) |
| Approve, pause, resume campaigns | No | Yes | Yes |
| Change targets | No | Yes | Yes |
| Reassign leads and deals | No | Yes | Yes |
| Admin view (org monitoring, AI costs, audit log, users) | No | Read-only team section | Full |
| Invite, deactivate users, change roles | No | No | Yes |
| Integrations and API keys settings | No | No | Yes |
| Export data | No | Yes | Yes |

Enforced in three places: Postgres row-level security, server action guards, and hidden UI.

---

## 3. Brand and UI

Match `reference/prototype.html`. Font: Sora (Google Fonts) with system fallback. Logos: provided PNGs (green glasses mark + wordmark); light UI uses black-text logo, dark UI uses white-text logo. Flow avatar: glasses mark on a black rounded square.

| Token | Light | Dark |
|---|---|---|
| Background | #F5FAF8 | #050807 |
| Surface | #FFFFFF | #0B1210 |
| Surface 2 | #E8F2EE | #121A17 |
| Border | #D5E3DD | #1D2925 |
| Heading text | #050807 | #FFFFFF |
| Body text | #42524C | #B8C9C2 |
| Primary | #20B982 | #34E0A1 |
| Primary hover | #087A57 | #20B982 |
| Primary tint | #D8FAED | #10251D |
| Text on primary | #050807 | #050807 |
| Danger (functional only) | #B4432F | #F08A74 |

Theme follows the device, with a manual toggle in the user menu. Responsive down to 375px wide. Keyboard focus visible. Respect reduced motion.

---

## 4. Data model

All tables have: `id uuid pk`, `organization_id uuid fk`, `created_at timestamptz`, `updated_at timestamptz`. Demo records carry `is_demo boolean default false`.

### users
| Field | Type | Notes |
|---|---|---|
| email | text unique | Must match `ALLOWED_EMAIL_DOMAIN` |
| full_name | text | |
| role | enum rep, manager, admin | |
| status | enum invited, active, deactivated | Deactivated users cannot log in |
| timezone | text | Default Asia/Karachi |
| working_hours | jsonb | `{start:"09:00", end:"17:30", days:[1..5]}` |
| onboarding_completed_at | timestamptz null | Null forces onboarding |
| onboarding_progress | jsonb | Step keys completed |
| mfa_enabled | boolean | Required for admin and manager |
| last_login_at | timestamptz | |
| assistant_name | text | Org-level default, overridable |

### targets
| Field | Type | Notes |
|---|---|---|
| user_id | fk users | |
| metric | enum leads_verified, emails, calls, instagram_dms, linkedin_messages | |
| daily_value | int | |
| effective_from | date | History kept; latest applies |
| set_by | fk users | Manager or admin |

### daily_stats
| Field | Type | Notes |
|---|---|---|
| user_id, date | composite unique | |
| counts | jsonb | Per metric, incremented by activity events |
| replies, meetings_booked | int | |
| target_pct | int | Computed at close-out, capped per metric at 100 |
| closed_out_at | timestamptz null | |
| blocker, learning | text | From close-out |
| ai_summary | text | For manager |
| streak_after | int | |

### products
| Field | Type | Notes |
|---|---|---|
| name | text | ReceptAI, HostCo, services |
| type | enum product, service | |
| summary | text | Plain-language description |
| status | enum active, archived | |

### knowledge_docs
| Field | Type | Notes |
|---|---|---|
| product_id or campaign_id | fk, one required | |
| title | text | |
| source | enum upload, paste, url, auto_learning | |
| storage_path | text null | Original file in Supabase Storage |
| extracted_text | text | PDF, DOCX, TXT, MD, CSV extraction |
| token_estimate | int | |
| uploaded_by | fk users | |

### campaigns
| Field | Type | Notes |
|---|---|---|
| product_id | fk | |
| name | text | "Buyer in place: angle" |
| owner_id | fk users | |
| status | enum draft, pending_approval, active, paused, archived | |
| goal | text | What counts as a win |
| location | text | One city or region |
| strategy | jsonb | See schema in PROMPTS.md: icp, channels, cadence, messages, objections, lead_gen, kill_rule, summary |
| strategy_version | int | Increments on every edit |
| lead_daily_cap | int | Default from env |
| approved_by, approved_at | fk, timestamptz | |
| paused_reason | text null | Includes auto-pause reason |

### campaign_notes
`campaign_id`, `author_id` (null = assistant), `kind enum note|system|learning`, `body text`.

### lead_sources_runs
`campaign_id`, `source enum google_places|open_data|apollo|openclaw|csv|manual|portfolio_agent`, `started_at`, `finished_at`, `found int`, `new int`, `duplicates int`, `rejected_auto int`, `error text null`, `cost_usd numeric`.

### leads
| Field | Type | Notes |
|---|---|---|
| campaign_id | fk | |
| owner_id | fk users | From campaign owner, reassignable |
| status | enum inbox, rejected, queued, in_cadence, replied, deal, not_fit, finished, do_not_contact | |
| business_name | text | |
| contact_name, contact_role | text | |
| city, region, country | text | |
| website, phone, email, instagram_url, linkedin_url | text | |
| email_verification | enum unknown, valid, risky, invalid | |
| signals | jsonb | e.g. `{instagram_active_14d:true, reviews_mention_missed_calls:true, units:28}` |
| source, source_url, source_run_id | | Provenance, required |
| fit_score | int 0 to 100 | |
| fit_reasons, fit_flags | text[] | |
| dedupe_key | text | Normalized domain or phone or name+city |
| cadence_step | int | |
| next_touch_at | timestamptz | |
| approved_by, rejected_reason | | Rejection reason feeds learning |

### touches
`lead_id`, `deal_id null`, `user_id`, `channel enum email|call|instagram|linkedin`, `step int`, `outcome enum sent|no_answer|talked_not_now|replied|interested|not_fit`, `body text null`, `external_ref text null` (Gmail message id, call id), `occurred_at`.

### deals
| Field | Type | Notes |
|---|---|---|
| lead_id | fk | |
| owner_id | fk users | |
| product_id, campaign_id | fk | |
| stage | enum interested, discovery, demo, proposal, closing, won, lost | |
| stage_changed_at | timestamptz | |
| checklist | jsonb | Stage criteria keys to boolean |
| next_step_text, next_step_at | text, timestamptz | |
| health | int | Recomputed on change |
| signals | jsonb | intent, urgency, sentiment (High, Medium, Low, Unclear), note |
| next_best_action | text | From latest review |
| value_monthly_usd | numeric null | Entered by rep |
| lost_reason | enum price, timing, no_decision, competitor, not_fit, went_silent, other | |
| won_at, lost_at | timestamptz | |

### deal_people
`deal_id`, `name`, `role`, `email`, `phone`, `is_decision_maker boolean`, `met boolean`.

### conversations
| Field | Type | Notes |
|---|---|---|
| deal_id or lead_id | fk | |
| kind | enum email_out, email_in, call, meeting, dm_in, dm_out, note, voice_debrief, practice | |
| title | text | |
| body | text | Message text, transcript or notes |
| source | enum manual, gmail, calling_app, meet_transcript, voice_note | |
| audio_path | text null | Only if consent_confirmed |
| consent_confirmed | boolean | Required before storing recordings |
| occurred_at | timestamptz | |
| review_status | enum none, queued, done, failed | |

### reviews
`conversation_id`, `score int 1..10`, `verdict`, `went_well text[]`, `mistakes jsonb [{what,why,fix}]`, `missed text[]`, `tags text[]` (fixed taxonomy below), `checks_met text[]`, `suggested_stage`, `next_best_action`, `suggested_message`, `signals jsonb`, `model`, `prompt_version`, `is_basic boolean` (rule-based fallback), `rep_feedback enum helpful|wrong|null`, `rep_feedback_note`.

Tag taxonomy: Great discovery, Next step booked, Strong objection handling, Pitched too early, No next step, Weak price handling, No recap of pain, Missed decision-maker, Did not quantify impact, Weak objection handling, Slow follow-up, Talked too much.

### coaching_rules
`user_id`, `week_start date`, `tag`, `rule_text`, `created_by (null = assistant)`, `status enum active|kept|dropped`, `result_note`.

### chat_threads, chat_messages
Threads per user per day; messages with `role`, `content`, `context jsonb` (screen, lead_id, deal_id, campaign_id).

### integrations
`user_id null` (org-level when null), `provider enum google|gmail|calling_app|slack|openclaw`, `status`, `scopes text[]`, `encrypted_tokens`, `last_sync_at`, `last_error`.

### ai_usage
`user_id null`, `feature` (brief, review, strategy, scoring, chat, roleplay, draft_review, prep, weekly_patterns), `model`, `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms`, `success boolean`.

### audit_log
`actor_id`, `action`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `ip`, `user_agent`.

### notifications
`user_id`, `kind`, `title`, `body`, `link`, `read_at`, `channel enum in_app|slack`.

---

## 5. Features

### 5.1 Login and security
**Screen: `/login`**
- Brand logo, one line: "NerdFlow Sales Command Center".
- Button: **Continue with Google**. Only emails on `ALLOWED_EMAIL_DOMAIN` are accepted. Any other email sees: "This account isn't part of NerdFlow. Ask Muqeet for an invite."
- Fallback: email magic link, same domain rule (for when Google is down).
- Only users with status `invited` or `active` in `users` can sign in. First successful sign-in flips `invited` to `active`.

**Multi-factor authentication**
- Required for manager and admin roles: TOTP authenticator app, enrolled on first login before any other screen.
- Optional for reps in Phase 1; admin can make it required for everyone in Settings.

**Sessions**
- Session expiry 7 days, idle timeout 12 hours. "Sign out everywhere" in the user menu.
- Admin can force sign-out any user and deactivate instantly.

**Other security**
- Row-level security on every table (section 2 rules).
- Rate limits: login 10 per 15 minutes per IP; AI endpoints 60 per hour per user; ingest endpoint per token.
- OAuth tokens encrypted at rest with `TOKEN_ENCRYPTION_KEY`.
- Security headers: CSP, HSTS, frame-ancestors none.
- Audit log for sign-ins, role changes, target changes, campaign approvals, lead reassignment, data export.

### 5.2 Onboarding flow
Triggered when `onboarding_completed_at` is null. Progress saved after each step; users can resume. Admin sees each user's onboarding progress.

| Step | Screen content | Completion condition |
|---|---|---|
| 1. Welcome | Short message from Muqeet (editable text in Settings), the three reasons past attempts stopped, and what changes. 60-second read. | Press Continue |
| 2. Your profile | Confirm name, timezone, working hours. | Saved |
| 3. Meet Flow | What the assistant does and does not do: coaches, drafts, prepares; never sends, never judges pay. Rename option (manager and admin only; reps see the chosen name). | Press Continue |
| 4. How you're graded | Your daily targets (read-only for reps), why effort is graded, not luck. Example of a quiet day that counts as a good day. | Press "I understand" |
| 5. Connect your tools | Gmail read-only (optional but recommended), calling app (if configured), Slack notifications (optional). Each shows exactly what is read and what is never done. | Skip or connect |
| 6. Guided practice run | Uses demo records in a sandbox: approve one demo lead, work one focus card and log an outcome, open a demo deal and read its review, debrief a short sample call. Coach marks point to each control. | All four tasks done |
| 7. Your first real day | Today screen with a coach mark tour (brief, targets, Deals badge, Flow button). Checklist of first-week habits: daily close-out, debrief every conversation, reply to interest within the hour. | Tour finished |

After onboarding: a dismissible "First week" checklist card on Today tracks: 5 close-outs, 3 debriefs, 1 practice session. Help menu includes "Replay onboarding" and a link to the user guide.

### 5.3 Today
- **Brief** (assistant voice): built from data every morning at the user's start time. Lines: queue size and follow-ups; top hot lead with the evidence; up to 2 deals needing action with the flag; paused campaigns with reason; pending campaign approvals (managers); inbox count; target percentage and streak; this week's coaching rule. Button **Get a sharper brief** calls AI with the same data.
- **Targets panel**: one bar per metric with count / target.
- **Up next**: first 6 queue items (lead, channel, product, chip New / Follow-up N / Hot).
- **Deals needing attention**: up to 3 with flag chips.
- **Team goal**: shared bars defined by admin (e.g. ReceptAI paying restaurants 1/10).
- **First week checklist** (new users only).
- **Check-ins**: at 12:00 and 16:00 local, only if pace is under 80%: notification with biggest gap. Silent when on pace.

### 5.4 Focus mode
One lead at a time from the queue (ordering: hot leads, then due follow-ups by step, then new; skipped go last).
- Card: product and campaign chips, business name, contact and city, **Reach them by** channel (large), **why** line (signal evidence + channel reason), sales tip for this step, cadence strip (Day N: channel, past/current/future), outcome buttons.
- Outcomes by channel: call: No answer, Talked not now, Interested, Not a fit. Others: Sent, They replied, Interested, Not a fit. Plus Skip for now.
- Logging an outcome writes a `touch`, increments `daily_stats`, and schedules the next step at `occurred_at + (next.day - current.day)` in the rep's working hours. Last step done: lead status `finished` (nurture).
- Interested: creates a deal at stage Interested (if no open deal exists for the lead), opens a prompt "Paste their message to get coaching".
- Replied: moves lead to `replied`, prompts to paste the reply into Flow for classification (5.10).
- Draft panel: message from campaign playbook with placeholders filled ({name}, {biz}, {city}, {me}, {product}); **Rewrite with Flow**; **Copy**; for email with Gmail connected, **Save to Gmail drafts** (only if the admin enabled draft saving). Never a send button.
- "If they push back": campaign objections.
- Keyboard shortcuts: 1 to 4 outcomes, S skip, C copy.

### 5.5 Lead Inbox
- Table of `status = inbox` leads for the user (managers: filter by rep).
- Columns: fit score (color by band), lead (name, contact, city, good-signal chips, flag chips), campaign, source with link to source URL, found date.
- Actions: Approve (status queued, next_touch_at now), Reject with reason (Wrong location, Too small, No decision-maker, Chain or franchise, Bad contact data, Already a customer, Other + note), bulk approve all ≥ 70, bulk reject all with "No reachable channel".
- Import CSV: column mapping screen, preview, dedupe report, then scoring.
- Empty state: last lead engine run per campaign with counts and next run time.

### 5.6 Campaigns and campaign builder
**List**: grouped Pending approval, Active, Paused, Archived. Card: product, owner, status, channels, lead count, reply rate, sends, meetings. Manager actions: Approve and launch, Pause (reason), Resume, Archive.

**Limit**: a rep may own at most 2 active campaigns (configurable). Creating a third shows the weakest active campaign and asks to pause it on approval.

**Builder (4 steps)**
1. Product: pick or create (name, type, summary). Upload files (PDF, DOCX, TXT, MD, CSV up to 20 MB each; text extracted in the worker) or paste text or add URLs (fetched and extracted server-side).
2. Campaign brief: buyer guess, location, win definition, owner (managers can assign), notes. All optional.
3. Strategy generation: AI job with streamed progress messages. Output validated against the strategy schema. Fallback: product-type templates.
4. Review: editable name, location, summary, ICP fields, channels (toggle with reasons), cadence table (add, remove, reorder steps; day numbers), messages per channel (first and follow-up), objections (add, edit), lead-gen criteria (sources, queries, must-have, boosts, disqualifiers, daily cap), kill rule. Free-text **Rethink** instruction re-runs generation with the current strategy. Submit: rep → pending approval (manager notified); manager or admin → active.

**Campaign page tabs**: Overview (plan, goal, kill rule, results by channel, lead engine status), ICP and lead gen (ICP, source config, runs history with found/new/duplicate/rejected, Run now button for managers), Playbook (editable; every save increments strategy_version and logs a note), Knowledge (docs list, upload, paste, delete with confirmation), Log (notes timeline, add note).

**Auto-pause (kill rule)**: evaluated nightly. Default: ≥150 touches with reply rate <1%, or bounce rate >5% on ≥50 emails. Campaign pauses, owner and manager notified with the diagnosis (list, deliverability or message).

### 5.7 Deals and deal coaching
**Board**: columns Interested, Discovery, Demo, Proposal, Closing; cards sorted by health ascending; filter Mine / Team (manager) / by rep, by product. Above: assistant pattern line for the viewer (reviewed count, average score, most repeated mistake with this week's rule, a strength to keep). Won and lost counts.

**Health score**: weighted completion of checklist items up to the current stage (current stage weight 1, earlier stages 1.5), minus 12 per risk flag, clamped 5 to 100. Won = 100, Lost = 0.

**Risk flags**: gone quiet ≥7 days; ≥4 days since last touch (warning); no next step (stage ≥ Discovery); fresh reply unanswered for 60 minutes (stage Interested); decision-maker not met (stage ≥ Demo); no decision date (stage ≥ Proposal).

**Stage checklists**
| Stage | Criteria keys |
|---|---|
| Interested | replied, fit, meeting_booked |
| Discovery | pain_confirmed, impact_quantified, current_process_known, decision_makers_identified, next_meeting_booked |
| Demo | demo_tied_to_pain, decision_makers_attended, objections_handled, next_step_booked |
| Proposal | proposal_recaps_pain, price_discussed_live, decision_date_agreed, signer_involved |
| Closing | terms_agreed, start_date_set, signed |

**Deal page**
Left column: health score and bar with flags; buying signals (intent, urgency, mood labels plus note; never percentages); assistant's call (next best action); next step (text + datetime, saving it ticks the stage's booking criterion); what good looks like (checklist for previous and current stage, tickable); people (name, role, decision-maker toggle, met toggle, add person); value (optional monthly USD); stage selector (Lost requires lost_reason).

Right tabs:
1. **Timeline**: all conversations newest first; each shows kind chip, title, date, collapsible body, and its review (score, verdict, what worked, mistakes with why and next-time fix, facts still missing, suggested message). Review feedback buttons: Helpful / Wrong + note.
2. **Debrief a conversation**: kind (call or meeting, their message, something I sent, DM), title, body text, OR record a voice debrief (browser recording up to 5 minutes → transcription → review), OR attach a transcript file. On submit: conversation saved, review job runs (streams status), then applies: checks_met ticked, signals updated, next_best_action updated, stage suggestion shown as a one-click "Move to Demo?" (never auto-moves).
3. **Prepare for next step**: stage playbook personalized by AI (goal, how to open, questions, listen for, ask for before ending, red flags, likely objections). Cached per deal and stage; Rebuild button.
4. **Review a draft**: paste draft, get score, problems, improved version with Copy.
5. **Practice**: roleplay with the assistant playing the prospect; difficulty Easy / Realistic / Tough; End and score me produces a review stored as `kind = practice` (excluded from the deal's health and stage).

### 5.8 Lead engine (automatic lead generation)
Runs in the worker per active campaign, nightly at 02:00 Pakistan time plus manual Run now.

Pipeline per run:
1. **Plan**: load campaign ICP and lead_gen config; compute today's need = daily cap × working days until next run − leads already waiting in inbox. If need ≤ 0, skip.
2. **Discover** (sources enabled per campaign):
   - `google_places`: text search with the campaign's queries and location; collect name, address, phone, website, types, rating, review count, business status. Filter out chains by name repetition and types.
   - `open_data`: city STR registry datasets configured per campaign (URL + field mapping set by the AI engineer).
   - `openclaw`: the OpenClaw agent receives the campaign's job JSON (from the ICP tab) and posts results to `POST /api/ingest/leads` with bearer `OPENCLAW_INGEST_TOKEN`. It must never log in to any site.
   - `portfolio_agent` (Phase 5): prospects who chat with the public demo/portfolio agent and leave contact details.
3. **Normalize and dedupe**: build dedupe_key; skip if a lead with the key exists in any campaign within 180 days, any open deal, or status do_not_contact.
4. **Enrich**: Apollo organization and people search by domain for owner or relevant role; take name, title, email, LinkedIn URL. Cap Apollo credits per run (setting).
5. **Verify email**: email verifier; invalid emails dropped, risky flagged.
6. **Signals**: website fetch for hours and ordering, Instagram last post date only from public data provided by OpenClaw; review text keywords (Places reviews) e.g. "no one answers", "couldn't get through".
7. **Score**: rule score (location match, named contact, verified email, channel signals, size fit) + AI fit check with the fast model producing `fit_score`, `fit_reasons`, `fit_flags` against the ICP. Final = 40% rules + 60% AI, or rules only if AI unavailable.
8. **Stage**: insert as `status = inbox` with full provenance; record the run in `lead_sources_runs`.

Learning: weekly job compares approval and reply rates by source, signal and score band; writes suggestions to campaign notes ("Leads with instagram_active_14d reply 3x more: raise its weight?") for a manager to accept, which adjusts scoring weights stored in campaign strategy.

Compliance rules built in: store source URL for every lead; honor do_not_contact; include an unsubscribe-respecting status for anyone who says stop; no data from logged-in pages.

### 5.9 Email sync (Gmail, read-only)
- Per-user OAuth with Gmail read-only scope (plus compose for drafts only if admin enables draft saving).
- Worker polls every 10 minutes (or push notifications if configured). Matches messages to leads and deals by email address and domain.
- Sent emails create `touches` (channel email, outcome sent) automatically, replacing manual logging for email.
- Replies create `conversations` (email_in), move the lead to `replied`, notify the owner, and queue a reply classification (5.10).
- Only threads with known leads or deals are stored. Everything else is ignored and never saved.

### 5.10 Talk to Flow (chat) and reply handling
- Drawer available on every screen; context passed: current screen, lead, deal or campaign, user targets and today's stats.
- Quick prompts change by screen.
- Reply classification: when a reply arrives (paste or Gmail), classify as interested, not_now (with date if stated), objection (which), question, unsubscribe, out_of_office, wrong_person (with referral if given). Show the draft response and suggested follow-up date; one click applies the status change and schedules the follow-up. Unsubscribe sets do_not_contact.
- Chat can propose actions (reschedule, mark status, add note, create deal); each shows a confirm button. No action executes without the click.

### 5.11 Call capture
- **Voice debrief** (Phase 3): record in browser, upload to storage, transcribe, create conversation, review.
- **Calling app** (Phase 4): webhook for completed calls; match by phone number; fetch recording and transcript if the provider supplies it, else transcribe. Store audio only when the rep confirmed the consent line was used (per-call toggle, or org setting that the calling app plays an automatic disclosure). Without consent: store only rep notes, discard audio.
- **Meet/Zoom transcripts** (Phase 4): import from the notetaker tool's API or upload; match by attendee emails.
- Talk-ratio and question count computed from speaker-labelled transcripts and shown in the review.

### 5.12 Scoreboard (manager and admin)
- Week selector. Per person: target %, sends by channel, replies, reply rate, meetings, deals created, deals won, streak, reviews count, average review score, top mistake tag.
- Reply rate by channel, by campaign, by source. Four-week trend line.
- Monday review mode: agenda view (numbers, red deals, patterns and rules, experiment of the week) with notes saved to a `weekly_reviews` record.

### 5.13 Close out
- Today vs targets, blocker and learning text, record button for a spoken close-out.
- Submit computes target_pct, streak (≥80% continues), AI summary for manager, and feedback on the week's coaching rule.
- Reminder notification at end of working hours if not closed out.

### 5.14 Admin view (Muqeet)
Route `/admin`, admin role only, MFA required.

| Section | Contents |
|---|---|
| Overview | Today across the org: who's logged in, target % per person, touches today, replies, meetings, deals moved, close-outs done. Last 30 days trend. |
| Team | Users table: role, status, last login, onboarding progress, streak, 7-day target average, open deals, review average. Actions: invite, change role, deactivate, force sign-out, set targets (with history). Click a person for their activity feed. |
| Pipeline | All deals by stage and product with value where entered; won and lost this month with lost reasons; stuck deals list. |
| Campaigns | All campaigns with status, owner, results, lead engine health (last run, errors, found/new), approval queue. |
| Lead engine | Runs log across campaigns, cost per run, source quality (approval rate, bounce rate, reply rate by source), errors. |
| AI | Usage and cost by feature, model and user this month vs budget; failures; average latency; review feedback marked "Wrong" with notes (quality queue). Budget alert at 80%. |
| Integrations | Status of Google, Gmail, calling app, Slack, OpenClaw ingest, API keys present (masked), last sync and errors. |
| Audit log | Filterable by actor, action, entity, date. Export CSV. |
| Settings | Allowed domain, MFA policy, welcome message, team goals, campaign limit per rep, auto-pause thresholds, lead engine schedule and default caps, email draft saving on/off, recording consent policy, assistant name. |

### 5.15 Notifications
In-app bell always; Slack DM optional per user. Events: new reply, interested lead, fresh reply unanswered 60 min, deal gone quiet 7 days, campaign awaiting approval, campaign auto-paused, lead engine error (admin), AI budget 80% (admin), check-ins, close-out reminder.

### 5.16 Covis-inspired extras (Phase 5)
- **Portfolio and demo agent**: public page per product or for NerdFlow services where a prospect chats with an AI guide grounded in approved knowledge docs; captures contact details on consent; produces an intent report (what they want, budget signal, timeline, interest) delivered as an inbox lead with source `portfolio_agent`.
- **Bid scoring for Upwork/Fiverr**: paste a job post; get potential score, risks, matching past projects from knowledge docs, questions to ask, proposal strategy and draft; tracked as its own inbound lane with outcomes.

---

## 6. Build phases and acceptance criteria

| Phase | Scope | Done when |
|---|---|---|
| 1. Foundation | Repo, stack, brand, auth (Google, domain lock, MFA for admin/manager), roles and RLS, users and targets, admin Team and Settings, audit log, onboarding steps 1 to 4 and 7, Today, Focus mode, Lead Inbox with CSV import, Campaigns (manual strategy editing, approval flow), Close out, Scoreboard basics, rule-based brief | Hadi and Baryal log in securely, complete onboarding, work a real campaign daily from imported leads; admin sees team activity; a non-domain email cannot sign in |
| 2. AI core | AI client, usage logging and budget, campaign builder strategy generation with uploads, Rewrite, AI brief, Talk to Flow chat, reply classification, close-out summary | A campaign can be created from product docs end to end; all AI features fall back gracefully with the API key removed |
| 3. Deal coaching | Deals board, health and flags, deal page, debrief with reviews, voice debriefs with transcription, prep, draft review, practice, pattern line and weekly coaching rules, onboarding practice run | Every call gets a review within 2 minutes; reps see their top mistake and weekly rule |
| 4. Capture and lead engine | Gmail read-only sync, calling app webhook and transcripts, Meet/Zoom import, lead engine with Google Places, open data, Apollo, verification, OpenClaw ingest, scoring, nightly runs, auto-pause | Leads arrive in the inbox every morning per campaign without manual work; sent emails and replies log automatically |
| 5. Learning and extras | Source and signal learning suggestions, Slack notifications, portfolio/demo agent, bid scoring lane, admin AI quality queue | Weekly suggestions appear and change scoring when accepted |

---

## 7. Budget

Figures are planning estimates in USD, to be confirmed against each provider's current pricing page before committing. Assumes 3 users, 2 to 4 active campaigns.

### 7.1 Monthly running costs
| Item | Estimate / month | Notes |
|---|---|---|
| Vercel hosting | $0 to $20 | Hobby may suffice for internal use; Pro recommended for team features |
| Supabase | $25 | Pro plan for backups and no pausing |
| Worker VM | $0 | Runs on NerdFlow's existing VM |
| Claude API | $60 to $150 | Scoring on the fast model, reviews and strategy on the default model; hard cap via `AI_MONTHLY_BUDGET_USD`. Check https://docs.claude.com for current model pricing |
| Transcription | $10 to $30 | Roughly 20 to 40 hours of audio |
| Google Places API | $0 to $60 | Depends on searches and fields requested; free monthly credit may cover early volume |
| Apollo | Existing plan | Watch credit use per run |
| Email verification | $15 to $40 | Pay-as-you-go |
| Calling app with recording | $15 to $30 per user | Only if adopted in Phase 4 |
| Domain and email for outreach | Existing | Warm-up tool cost if not already paid |
| **Total** | **~$150 to $400** | Excluding calling app seats |

### 7.2 Build effort (internal team with Claude Code)
| Phase | Duration | People | Estimated internal cost |
|---|---|---|---|
| 1. Foundation | 2 weeks | 1 full-stack developer | Developer salary share |
| 2. AI core | 1 week | Developer + AI engineer part-time | |
| 3. Deal coaching | 1.5 weeks | Developer + AI engineer | |
| 4. Capture and lead engine | 2 weeks | Developer + AI engineer | + API trial credits ~$100 |
| 5. Learning and extras | 2 weeks | Developer + AI engineer | |
| **Total** | **~8.5 weeks** | | Plus ~$200 one-off for testing API usage |

Durations assume Claude Code does most implementation and a developer reviews, tests and deploys. Fill in salary shares with actual figures.

### 7.3 Spending structure (internal)
Treat each phase as a gate, like client milestones:
| Gate | Release of budget | Condition |
|---|---|---|
| Start | Phase 1 time + Supabase and Vercel | Kit reviewed by Hadi and developer |
| Gate 1 | Phase 2 time + Claude API budget | Phase 1 acceptance met and 5 real working days used |
| Gate 2 | Phase 3 time + transcription | AI features used daily for 1 week, AI cost within budget |
| Gate 3 | Phase 4 time + Places, verification, calling app | At least 10 deal reviews marked helpful; debrief habit established |
| Gate 4 | Phase 5 time | Lead engine delivering daily with approval rate ≥50% |
