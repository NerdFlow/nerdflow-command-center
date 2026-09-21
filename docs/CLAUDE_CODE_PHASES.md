# Claude Code Build Prompts, Phase by Phase

Open Claude Code in the repo root. Paste one prompt at a time. After each, run the acceptance checks yourself before moving on. If Claude Code asks a question, answer it; the spec wins over guesses.

Tip: start each phase in a fresh session and begin with "Read CLAUDE.md, docs/SPEC.md and reference/prototype.html first."

---

## Phase 0: Project setup

```
Read CLAUDE.md, docs/SPEC.md sections 1-4, and reference/prototype.html.

Set up the project:
1. Next.js App Router with TypeScript strict, Tailwind, ESLint, Prettier, Vitest, Playwright, pnpm.
2. Prisma connected to Supabase Postgres. Create the full data model from SPEC section 4 as a migration, including enums, indexes on foreign keys and on leads(dedupe_key), leads(owner_id,status,next_touch_at), deals(owner_id,stage).
3. Supabase row-level security policies implementing SPEC section 2 for every table. Write SQL policies in a migration and tests that prove a rep cannot read another rep's rows.
4. Brand tokens from SPEC section 3 as Tailwind theme variables with light and dark modes. Add the Sora font. Put logo placeholders in /public/brand (I will add the real PNGs).
5. A `worker/` package using pg-boss, sharing the Prisma client, with a hello-world scheduled job.
6. prisma/seed.ts with the demo data from the prototype, all flagged is_demo = true, plus a `pnpm seed:clear-demo` script.
7. .env.example copied from the kit.

Write a short plan first, then build. Finish by running lint, typecheck and tests.
```

**Acceptance**: `pnpm dev` runs; migration applies; RLS tests pass; seed and clear-demo work; dark and light themes render.

---

## Phase 1: Security, onboarding, admin and the daily flow

### 1A: Login and roles
```
Implement SPEC 5.1 Login and security completely:
- /login with Google sign-in via Supabase and magic-link fallback, restricted to ALLOWED_EMAIL_DOMAIN and to users with status invited or active.
- TOTP MFA enrollment forced for manager and admin roles before any other page.
- Session rules, sign out everywhere, rate limiting on auth routes, security headers.
- Middleware that protects every route except /login and /api/ingest/*.
- Role guards as reusable server helpers; audit_log writes for sign-in and role changes.
Add Playwright tests: outside-domain email is refused; rep cannot open /admin; admin without MFA is sent to enrollment.
```

### 1B: Admin view (first sections)
```
Build /admin from SPEC 5.14: Overview, Team (invite, change role, deactivate, force sign-out, set targets with history), Audit log (filters + CSV export) and Settings (all listed settings stored in an org_settings table). Other admin sections show "Coming in a later phase" placeholders. Admin role only; managers get a read-only Team section at /team.
```

### 1C: Onboarding
```
Build the onboarding flow from SPEC 5.2, steps 1-4 and 7 now (steps 5 and 6 come in later phases; show step 5 with only "Skip for now" and hide step 6). Save progress per step, allow resume, redirect users with onboarding_completed_at null. Coach-mark tour on Today. First-week checklist card. "Replay onboarding" in the help menu. Match the tone of reference/prototype.html.
```

### 1D: Core daily flow
```
Build SPEC 5.3 Today (rule-based brief only), 5.4 Focus mode (no AI rewrite yet), 5.5 Lead Inbox with CSV import and mapping, 5.6 Campaigns list, campaign page tabs and approval flow with manual strategy editing (no AI builder yet), 5.12 Scoreboard basics, and 5.13 Close out without AI summary.
Cadence scheduling must respect each user's working hours and timezone. Logging outcomes updates touches, daily_stats and lead status exactly as specified. Interested creates a deal record (deal screens come in Phase 3; show a toast).
Match the layouts and copy in reference/prototype.html. Add Playwright tests for: approve lead → appears in focus → log Sent → next touch scheduled.
```

**Acceptance**: Hadi and Baryal can sign in, onboard, import leads, approve, work focus mode, close out; Muqeet sees activity and audit log in /admin; all role tests pass.

---

## Phase 2: AI core

```
Read docs/AI_ENGINEER_BRIEF.md sections 2-3 and docs/PROMPTS.md.
Build src/server/ai/client.ts with model routing from env, structured JSON outputs validated by Zod, streaming, timeouts, retries, prompt caching of stable context, ai_usage logging and the monthly budget guard.
Then implement with fallbacks: morning brief and sharper brief, campaign builder steps 1-4 with document upload and text extraction in the worker, Rethink, Rewrite with Flow in focus mode, Talk to Flow drawer with context and proposed-action buttons, reply classification, close-out summary.
Add the AI section to /admin (usage, cost vs budget, failures).
Add a CI test that runs core flows with ANTHROPIC_API_KEY unset.
```

**Acceptance**: a campaign is generated from uploaded ReceptAI docs and launched; chat knows the current screen; removing the API key leaves everything usable; AI costs visible in admin.

---

## Phase 3: Deal coaching

```
Build SPEC 5.7 completely: deals board with health and flags, deal page with signals, next best action, next step, checklist, people, value and stage (lost reason required), and the five tabs: Timeline with review display and Helpful/Wrong feedback, Debrief (text, transcript upload and in-browser voice debrief with transcription), Prepare, Review a draft, Practice with difficulty levels and scoring.
Reviews run as worker jobs and stream status to the page. Apply checks_met and signals automatically; stage changes only as a one-click suggestion.
Implement coaching_rules and the pattern line on Deals and Today (AI_ENGINEER_BRIEF section 4, steps 1-3).
Enable onboarding step 6 (guided practice run) using demo records.
Add the "Wrong" review queue to /admin AI section.
```

**Acceptance**: a pasted call gets a review in under 2 minutes; voice debrief works on mobile Chrome; weekly rule appears after seeded reviews; practice session produces a scored review.

---

## Phase 4: Capture and lead engine

```
Implement SPEC 5.9 Gmail read-only sync, 5.11 calling app webhook with consent rules and transcripts, Meet/Zoom transcript import, and 5.8 lead engine following AI_ENGINEER_BRIEF section 5: Google Places, open-data adapters (start with a config-driven adapter and one Austin STR dataset), Apollo enrichment with credit caps, email verification, signals, rule + AI scoring, dedupe, POST /api/ingest/leads for OpenClaw with bearer token and schema validation, nightly schedules, Run now, lead_sources_runs, campaign auto-pause kill rule.
Enable onboarding step 5 (connect tools). Build admin Lead engine and Integrations sections.
All scraped and ingested content is untrusted: apply the safety rules in AI_ENGINEER_BRIEF section 6.
```

**Acceptance**: leads arrive in each active campaign's inbox by 9am without manual work, with source links and scores; sent Gmail messages and replies appear on leads within 10 minutes; a call without consent stores no audio.

---

## Phase 5: Learning loop and extras

```
Implement AI_ENGINEER_BRIEF section 4 steps 4-6 (outcome learning with sample-size rules, rep feedback loop, winning examples), Slack notifications from SPEC 5.15, the portfolio/demo agent and the Upwork/Fiverr bid scoring lane from SPEC 5.16, and the Monday review mode in Scoreboard.
```

**Acceptance**: weekly insights show sample sizes and never claim patterns below the threshold; accepting a scoring suggestion changes future lead scores; a portfolio chat produces an inbox lead with an intent report.

---

## After every phase
- Run lint, typecheck, unit tests and Playwright.
- Deploy to a staging URL, then production.
- Ask Hadi and Baryal for one week of feedback before starting the next phase if the phase changes their daily flow.
