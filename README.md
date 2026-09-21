# NerdFlow Sales Command Center

Phase 1 of the build described in [`docs/SPEC.md`](docs/SPEC.md): a daily operating system for NerdFlow's sales team, with an AI sales-coaching assistant renamed **FLOW** (the kit's original name, Jarvis, is used nowhere in this build).

This is a real, running Next.js + Postgres app — not a static prototype. It was scaffolded by Claude without the ability to run `npm install` or start a server, so **you are the first person to actually run it**. Read this whole file before you do.

## What's implemented (Phase 1: `docs/CLAUDE_CODE_PHASES.md` 1A–1D)

- Google sign-in (domain-locked) with a **dev-login fallback** for local testing before OAuth is fully wired
- Roles (rep / manager / admin), audit log, force sign-out, deactivation
  (SPEC 5.1 also calls for TOTP MFA on managers/admins — removed at the team's request; re-add if that changes)
- Onboarding steps 1–4 and 7 (steps 5–6 are stubbed per the phase spec)
- Today (rule-based brief + AI "sharper brief" if `ANTHROPIC_API_KEY` is set)
- Focus mode: queue ordering, outcome logging, cadence scheduling in the rep's working hours/timezone, draft messages (never auto-sent)
- Lead Inbox: CSV import with column mapping, dedupe preview, bulk approve/reject
- Campaigns: manual creation (template-based starter playbook), full Playbook editor, ICP/lead-gen config, Knowledge (paste-only), Log, approval/pause/resume/archive flow
- Deals: board, health score + risk flags, checklist, next step, people, value, stage changes (lost reason required); Timeline tab is real, the other four tabs (Debrief/Prepare/Review a draft/Practice) are Phase 3 placeholders
- Scoreboard basics, Close-out with streaks
- Admin: Overview, Team (invite/role/deactivate/force sign-out/targets with history), Audit log with CSV export, Settings; Pipeline/Lead engine/AI/Integrations pages show real data where it exists and honest placeholders where it's Phase 2+

## What's intentionally not built yet

Everything gated behind Phase 2–5 in `docs/CLAUDE_CODE_PHASES.md`: the AI campaign-builder wizard with document upload, Talk to Flow chat drawer, reply classification, deal coaching reviews/prep/practice, Gmail sync, calling-app capture, the automatic lead engine (Google Places/Apollo/OpenClaw), Slack notifications, and the portfolio/bid-scoring extras. Every screen that touches one of these says so instead of faking it.

**Magic-link email sign-in** (the SPEC 5.1 fallback for when Google is down) is also not built — dev-login is the practical stand-in for now.

## Non-negotiables this build follows (see `CLAUDE.md`)

The platform never sends anything to a prospect — every outbound draft has a Copy button and nothing else. No lead reaches a rep's queue without approval in the Lead Inbox. AI never invents facts. Every write to a lead/deal/campaign/target is in `audit_log`.

## Prerequisites

- Node.js 20+ and npm
- A Postgres database — either:
  - **Local**: `docker compose up -d` (starts Postgres on `localhost:5432`, credentials already in `.env.example`), or
  - **Supabase**: a project's connection string (Project Settings → Database)

## First run

```bash
npm install
cp .env.example .env   # then fill in / adjust values — see below (Prisma's CLI only reads .env, not .env.local, so this project uses .env for everything local)
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Open http://localhost:3000. With `ALLOW_DEV_LOGIN=true` (the default), `/login` shows a "pick a seeded user" list instead of requiring Google — sign in as Muqeet (admin), Hadi (manager) or Baryal (rep), whichever the seed printed emails for.

To wipe the demo dataset later without touching real accounts: `npm run seed:clear-demo`.

## Environment variables

`.env.example` documents every variable. The short version:

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Everything | Local Postgres or Supabase connection string |
| `NEXTAUTH_SECRET` | Everything | Any random 32+ byte string in production |
| `ALLOWED_EMAIL_DOMAIN` | Login | Only this domain can sign in with Google |
| `ALLOW_DEV_LOGIN` | Local dev only | Turn off once Google OAuth is confirmed working |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Real Google sign-in | From Google Cloud Console; redirect URI is `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google` |
| `ANTHROPIC_API_KEY` | AI features | Everything works without it via rule-based fallbacks |
| Supabase / Places / Apollo / etc. | Phase 2+ | Not read by any code path yet |

**If you switch `DATABASE_URL` to Supabase**, also apply row-level security policies (see "Going to production" below) before putting real data in it — Phase 1 enforces roles at the application layer (server actions + hidden UI), not yet at the database layer.

## Project structure

```
src/app/            Routes (App Router). (app)/ is the authenticated shell.
src/server/          Server-only logic: auth, db, cadence, deals, strategy, ai/
src/server/actions/  Server Actions (mutations) — one file per feature area
src/components/      Client components
prisma/schema.prisma Full data model (SPEC section 4), including Phase 2+ tables
```

## Going to production

1. Point `DATABASE_URL`/`DIRECT_URL` at Supabase and run migrations against it.
2. Write and test Supabase RLS policies for every table per `docs/SPEC.md` section 2 (a rep must not be able to read another rep's rows even via a leaked service key misuse). This build enforces roles in server actions today; RLS is the belt-and-suspenders layer the spec calls for.
3. Set `ALLOW_DEV_LOGIN=false`, confirm `GOOGLE_CLIENT_ID`/`SECRET` and the OAuth consent screen are production-ready, and set a real `NEXTAUTH_SECRET`.
4. Add `ANTHROPIC_API_KEY` and set `AI_MONTHLY_BUDGET_USD` deliberately — the budget guard in `src/server/ai/client.ts` hard-stops AI calls once the month's `ai_usage` spend crosses it.
5. Deploy the Next.js app (Vercel per the SPEC) and continue with Phase 2 in `docs/CLAUDE_CODE_PHASES.md`.

## Docs carried over from the build kit

- [`docs/SPEC.md`](docs/SPEC.md) — full spec, wins over this README or the prototype on any conflict
- [`docs/AI_ENGINEER_BRIEF.md`](docs/AI_ENGINEER_BRIEF.md), [`docs/PROMPTS.md`](docs/PROMPTS.md) — for Phase 2+
- [`docs/CLAUDE_CODE_PHASES.md`](docs/CLAUDE_CODE_PHASES.md) — copy-paste prompts for the next phases
- [`reference/prototype.html`](reference/prototype.html) — the original UI/brand reference (still says "Jarvis" in a few demo strings; the real app says FLOW everywhere)
