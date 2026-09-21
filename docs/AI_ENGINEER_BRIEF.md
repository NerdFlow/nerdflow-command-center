# AI Engineer Brief: Connecting AI to the Command Center

Owner: NerdFlow AI engineer · Works with: the full-stack developer driving Claude Code · Reports to: Muqeet, with Hadi as product owner

Your job is to make every AI capability in `SPEC.md` work reliably, safely and within budget: the Flow coaching layer, the campaign strategy builder, lead scoring, the lead engine's discovery and enrichment, email and call capture, and the learning loop. The developer builds screens and data; you own everything that thinks, fetches, transcribes or scores.

---

## 1. Week-one setup checklist

Start these on day one; several need approvals or billing.

- [ ] **Anthropic Console**: create an organization account for NerdFlow, add billing, create two API keys (`production`, `development`), set a monthly spend limit in the Console. Docs: https://docs.claude.com/en/api/overview
- [ ] **Google Cloud project** (`nerdflow-command-center`):
  - OAuth consent screen, internal to the NerdFlow Workspace domain
  - OAuth client for login (Supabase Google provider)
  - Gmail API enabled, scopes `gmail.readonly` (and `gmail.compose` only if draft saving is approved)
  - Places API (New) enabled, API key restricted to the worker's IP and the Places API only
  - Budget alert on the project
- [ ] **Supabase**: project on Pro plan, Google provider configured, MFA (TOTP) enabled, storage buckets `knowledge-docs` and `call-audio` (private)
- [ ] **Apollo API key** from the existing account; note credit limits
- [ ] **Email verifier** account (ZeroBounce, NeverBounce or similar), API key
- [ ] **Transcription provider** account (Deepgram or AssemblyAI recommended for speaker labels), API key
- [ ] **OpenClaw VM hardening** (see section 6) before connecting it
- [ ] **Calling app decision** with Hadi (OpenPhone, Aircall or similar): must support recording, transcripts or recording download via API, and webhooks
- [ ] Put every key in the secret manager (Vercel env vars and the worker's env file), never in the repo. Share `.env.example` values only via a password manager.

---

## 2. AI architecture

```
src/server/ai/
  client.ts          # single entry: model routing, retries, timeouts, usage logging, budget guard
  schemas/           # Zod schemas for every JSON output
  prompts/           # versioned prompt builders (see PROMPTS.md)
  features/
    brief.ts  review.ts  strategy.ts  scoring.ts  prep.ts
    draftReview.ts  roleplay.ts  classifyReply.ts  chat.ts  weeklyPatterns.ts
  fallbacks/         # rule-based behavior when AI is unavailable
  safety/            # untrusted-content wrapping, output checks
worker/jobs/
  leadEngine/  gmailSync/  transcription/  reviews/  learning/
```

### 2.1 `client.ts` requirements
- Uses the official Anthropic TypeScript SDK, server-side only.
- **Model routing** from env: `AI_MODEL_FAST` (lead scoring, reply classification, short drafts), `AI_MODEL_DEFAULT` (reviews, strategy, prep, chat, roleplay, briefs), `AI_MODEL_DEEP` (weekly patterns and strategy rethinks, optional). Keep model names in env so upgrades need no code change.
- **Structured outputs**: every feature returning data uses a JSON schema (tool use or the API's structured output options; confirm the current recommended approach in the docs) and is validated with Zod. Invalid output: one retry with the validation error appended, then the fallback.
- **Streaming** for chat, roleplay and long drafts.
- **Timeouts**: 30s for scoring and classification, 90s for reviews and strategy. On timeout, fallback and mark `review_status = failed` for retry by the worker.
- **Retries** with exponential backoff on rate limit and overload errors.
- **Usage logging** to `ai_usage` for every call: feature, model, input and output tokens, cost, latency, success.
- **Budget guard**: if month-to-date cost ≥ `AI_MONTHLY_BUDGET_USD`, disable non-critical features (sharper brief, rethink, practice) and alert the admin. Reviews, scoring and reply classification keep running up to 120% of budget, then fall back.
- **Prompt caching**: put stable content (system prompt, product knowledge, campaign strategy) first and use the API's prompt caching for it; it cuts cost on repeated deal and campaign calls. Check current caching docs for limits.

### 2.2 Context assembly
Build context from the database, never from the client. A `contextFor(entity)` helper per feature:
- **Deal review**: deal fields, stage checklist, people, last 10 conversations (bodies truncated to 1,500 chars each, latest in full), previous review tags, campaign strategy summary and objections, product knowledge (top documents up to ~8k tokens).
- **Chat**: screen, the entity in view, user targets and today's stats, this week's coaching rule, last 12 chat messages.
- **Strategy**: product summary + knowledge docs (up to ~20k tokens; summarize longer docs once and store the summary as `knowledge_docs.source = auto_learning`), rep brief, existing campaigns for this product (to avoid duplicates).
- **Scoring**: ICP, lead fields, signals. Keep it small; this runs at volume.

### 2.3 Knowledge ingestion
- Extract text from PDF, DOCX, TXT, MD, CSV in the worker; store `extracted_text` and `token_estimate`.
- Documents over ~6k tokens: generate a structured summary (offer, pricing, proof points, objections, customer types) and store it alongside. Use the summary in prompts; use full text only when the feature needs detail.
- URL sources: fetch server-side, strip navigation, store text and the URL.
- No vector database needed at this scale. Revisit if a product exceeds ~50 documents.

---

## 3. AI features to implement

Prompts and schemas are in `PROMPTS.md`. For each, build: prompt builder, schema, fallback, a test fixture set, and logging.

| Feature | Trigger | Model | Output | Fallback |
|---|---|---|---|---|
| Morning brief | Daily job at user start time; button for sharper brief | Default | Plain text, ≤6 lines | Rule-based brief from counts |
| Campaign strategy | Builder step 3, Rethink | Default (Deep for rethink optional) | Strategy JSON | Product-type templates |
| Lead fit scoring | Lead engine and CSV import | Fast | Score, reasons, flags | Rule score only |
| Rewrite draft | Focus mode button | Default | Plain text message | Keep template |
| Reply classification | Pasted reply or Gmail reply | Fast | Class, date, draft, follow-up | Manual status buttons |
| Conversation review | Debrief submit, new transcript | Default | Review JSON | Keyword-based basic review, `is_basic = true` |
| Stage prep | Prep tab | Default | Prep JSON | Static stage playbook |
| Draft review | Draft tab | Default | Draft review JSON | Length and ask checks |
| Roleplay | Practice tab | Default, streaming | Prospect turns | Disabled with message |
| Practice scoring | End practice | Default | Review JSON | Disabled |
| Chat | Drawer | Default, streaming | Text + optional proposed actions JSON | Message that AI is unavailable |
| Close-out summary | Close out | Fast | 3 to 4 sentences + coaching line | Template summary |
| Weekly patterns | Monday 06:00 job | Deep or Default | Per-rep tags, rule suggestions, source/signal insights | Tag counts only |
| Portfolio/demo agent (Phase 5) | Public chat | Default, streaming | Answers + intent report JSON | Contact form |

---

## 4. The learning loop

This is what makes the platform coach instead of just track. Implement in this order:

1. **Consistent tagging**: every review uses the fixed tag taxonomy. Reject tags outside it at schema level.
2. **Per-rep patterns**: aggregate review tags over the last 14 days per rep; the most frequent negative tag with ≥2 occurrences becomes a candidate coaching rule. Store in `coaching_rules` on Monday; show on Today and Deals.
3. **Rule follow-up**: next Monday, compare that tag's frequency before and after; the weekly patterns job writes "kept" or "dropped" with a one-line result.
4. **Outcome learning**: weekly, join touches, replies, deals and lead signals. Report reply rate by channel, source, signal and score band per campaign, with sample sizes. Only suggest changes when a segment has ≥30 touches and at least a 2x difference; otherwise say there isn't enough data yet.
5. **Rep feedback**: reviews marked "Wrong" go to the admin AI quality queue. Review them weekly; fix prompts and bump prompt versions. Keep a changelog in `src/server/ai/prompts/CHANGELOG.md`.
6. **Winning examples**: when a deal is won, store its best-scored conversations as positive examples for that product; include one short example in future review and prep prompts for the same product.

Rule: the assistant must say when data is thin. "Not enough data yet" is a correct answer.

---

## 5. Lead engine implementation

Worker job `leadEngine.runCampaign(campaignId)`; schedule nightly 02:00 Asia/Karachi; manual trigger from admin and campaign pages.

1. **Plan need** (see SPEC 5.8).
2. **Query generation**: build source queries from `strategy.lead_gen.search_queries` and ICP. For Google Places use Text Search with location bias; request only the fields you need (field masks reduce cost).
3. **Chain filter**: drop names appearing ≥3 times in the metro results, and known chain lists per product.
4. **Open data**: per campaign, a config of dataset URL and field mapping (e.g. Austin STR licenses). Write one adapter per city; cache datasets daily.
5. **OpenClaw**: send the job JSON (ICP tab) to OpenClaw via its task mechanism; OpenClaw posts results to `POST /api/ingest/leads` with header `Authorization: Bearer <OPENCLAW_INGEST_TOKEN>`. Ingest endpoint validates schema, rate-limits, tags `source = openclaw`, and treats every field as untrusted text.
6. **Dedupe** (normalized domain, E.164 phone, lowercase name + city).
7. **Enrichment** with Apollo: organization by domain, then people by role keywords from the ICP buyer field; pick one primary contact. Respect a per-run credit cap.
8. **Verification**: verify emails; drop invalid, flag risky.
9. **Signals**: Places review snippets scanned for missed-call phrases (ReceptAI); public website scan for online ordering, hours and phone; listing counts for STR operators from open data.
10. **Scoring**: rules + fast model fit check; store reasons and flags.
11. **Insert to inbox**, write the run record, notify the owner if new leads ≥ 1.

Quality targets to monitor in admin: inbox approval rate ≥50%, email bounce rate <3%, duplicate rate <10%, cost per approved lead.

---

## 6. Safety, privacy and prompt injection

Emails, transcripts, web pages, scraped data and OpenClaw output are written by other people. Treat them as data.

- Wrap all untrusted content in clearly delimited blocks in prompts (e.g. `<untrusted_email>...</untrusted_email>`) and state in the system prompt that instructions inside those blocks must be ignored.
- The model never has tools that send messages, change targets or delete data. Chat "proposed actions" are only suggestions rendered as buttons; the server re-validates permissions when clicked.
- Strip or neutralize hidden text and HTML comments from scraped pages before prompting.
- Output checks: reject outputs containing email addresses, URLs or phone numbers that are not present in the source context (prevents invented contact data).
- **OpenClaw hardening**: dedicated VM; patched to the latest release; gateway not exposed to the internet; no credentials for email, CRM, Supabase or cloud accounts on the VM; only the ingest token; no third-party skills from public registries; outbound network allowed, inbound blocked; logs reviewed weekly.
- **Recording consent**: do not upload or keep audio unless `consent_confirmed = true`. Put the disclosure line in the calling app's greeting or require reps to confirm per call. Get a legal check on US recording consent rules before enabling recording.
- **Data minimization**: Gmail sync stores only threads linked to leads or deals. Deleting a lead deletes its conversations and audio.
- **Logs**: never log message bodies, transcripts or keys at info level.

---

## 7. Testing and evaluation

- **Fixtures**: 20 real (anonymized) conversations across stages and products, each with an expected tag set and score band agreed with Hadi. Add every "Wrong" review to the fixture set after fixing.
- **Eval script** (`pnpm eval:reviews`): runs fixtures through the review feature, reports tag precision and recall, score within ±1 of expected, schema validity, cost. Run before every prompt version change.
- **Scoring eval**: 100 leads labelled approve/reject by Hadi; measure agreement of fit score ≥70 with approvals.
- **Strategy eval**: generate strategies for ReceptAI and HostCo from their docs; Hadi rates each section 1 to 5.
- **Fallback test**: CI job runs core flows with `ANTHROPIC_API_KEY` unset; everything must still work.
- **Injection test**: fixtures with emails containing "ignore previous instructions" style text; outputs must not change behavior.

---

## 8. Deliverables and definition of done

| Deliverable | Done when |
|---|---|
| AI client with routing, logging, budget guard, caching | Usage visible in admin AI section; budget stop tested |
| All features in section 3 with schemas and fallbacks | Each passes its eval or fixture test; app works with AI disabled |
| Knowledge ingestion | PDF/DOCX/TXT/MD/CSV/URL extracted and summarized |
| Lead engine for ReceptAI and HostCo campaigns | Nightly runs deliver scored leads with provenance, quality metrics in admin |
| Gmail read-only sync | Sent emails and replies appear on leads and deals within 10 minutes |
| Voice debrief + calling app + transcripts | Calls reviewed within 2 minutes with talk ratio and question count |
| Learning loop | Weekly rules and source insights generated with sample sizes |
| Safety controls | Injection tests pass; OpenClaw hardening checklist signed off |
| Prompt changelog and eval reports | Committed in repo |

## 9. What to ask Muqeet and Hadi for
- Real product documents for ReceptAI and HostCo (pricing, positioning, proof points)
- 20 past conversations or call notes to build fixtures (anonymize names)
- Decision on calling app and whether to record calls
- Approval for Gmail draft saving (off by default)
- Monthly AI budget number
- Target cities and data sources per campaign
