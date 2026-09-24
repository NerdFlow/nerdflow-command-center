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
- A Supabase project. Copy the Prisma connection strings from Connect → ORMs → Prisma into `.env`

## First run

```bash
npm install
cp .env.example .env   # then fill in / adjust values — see below (Prisma's CLI only reads .env, not .env.local, so this project uses .env for everything local)
npx prisma migrate deploy
npm run seed
npm run dev
```

Open http://localhost:3000 and sign in with the email and password `npm run seed` prints for Muqeet (admin), Hadi (manager), or Baryal (rep).

To wipe the demo dataset later without touching real accounts: `npm run seed:clear-demo`.

## Environment variables

`.env.example` documents every variable. The short version:

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Everything | Supabase pooler (6543) and session (5432) strings |
| `NEXTAUTH_SECRET` | Everything | Any random 32+ byte string in production |
| `ALLOWED_EMAIL_DOMAIN` | Login | Only this domain can sign in with Google |
| `ALLOW_DEV_LOGIN` | Local dev only | Turn off once Google OAuth is confirmed working |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Real Google sign-in | From Google Cloud Console; redirect URI is `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google` |
| `AI_PROVIDER` | AI features | `gemini` or `anthropic`. Gemini is used when `GEMINI_API_KEY` is set |
| `GEMINI_API_KEY` | Gemini | From [Google AI Studio](https://aistudio.google.com/apikey). Without a key, AI features use rule-based fallbacks |
| `ANTHROPIC_API_KEY` | Claude | Optional. Used when `AI_PROVIDER=anthropic` |

Phase 1 enforces roles in server actions. Prisma connects as the database user, so Supabase row-level security does not apply to these queries.

## Project structure

```
src/app/            Routes (App Router). (app)/ is the authenticated shell.
src/server/          Server-only logic: auth, db, cadence, deals, strategy, ai/
src/server/actions/  Server Actions (mutations) — one file per feature area
src/components/      Client components
prisma/schema.prisma Full data model (SPEC section 4), including Phase 2+ tables
```

## Going to production

Clone the repo to `/var/www/products/salesAI` on the VPS. The database is Supabase, not a database on the server. Node.js 20 must be installed as `/usr/bin/node` and `/usr/bin/npm`.

1. Copy `.env.example` to `.env` and fill in the Supabase Prisma URLs, `NEXTAUTH_SECRET`, `NEXTAUTH_URL=https://sales.nerdflow.cloud`, `NEXT_PUBLIC_APP_URL=https://sales.nerdflow.cloud`, `AI_PROVIDER=gemini`, and `GEMINI_API_KEY`.
2. `npm ci && npx prisma migrate deploy && npm run seed && npm run build`
3. Install `/etc/systemd/system/salesai.service` so it runs `npm run start -- --hostname 127.0.0.1 --port 3010` from that directory, then `sudo systemctl enable --now salesai`.

The service listens on `127.0.0.1:3010`. Nginx proxies `sales.nerdflow.cloud` to that port. A push to `main` SSHes to the VPS, pulls, migrates, rebuilds, and restarts `salesai`. GitHub secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

## Docs carried over from the build kit

- [`docs/SPEC.md`](docs/SPEC.md) — full spec, wins over this README or the prototype on any conflict
- [`docs/AI_ENGINEER_BRIEF.md`](docs/AI_ENGINEER_BRIEF.md), [`docs/PROMPTS.md`](docs/PROMPTS.md) — for Phase 2+
- [`docs/CLAUDE_CODE_PHASES.md`](docs/CLAUDE_CODE_PHASES.md) — copy-paste prompts for the next phases
- [`reference/prototype.html`](reference/prototype.html) — the original UI/brand reference (still says "Jarvis" in a few demo strings; the real app says FLOW everywhere)
