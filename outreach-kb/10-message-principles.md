# Message Principles and Message Library

**Rule for AI agents:** Every outreach card is checked against the **Quality Gate** below before it reaches Focus Today or Instantly. A card that fails is held back with the reason. Message versions change only when a learning is marked **Approved**.

---

## 1. Components and specs

| # | Component | Spec | Pass/fail check |
|---|---|---|---|
| 1 | **Subject line** | One line, 2–6 words, lowercase or sentence case, about *them* ("your dispatcher opening"). No emojis, no "NerdFlow", no fake "Re:" | Single line, no newline characters, under 50 characters |
| 2 | **Opener** | One sentence based on a verified fact about them (job post, review theme, 24/7 claim on site) | Fact has a source link in the tracker |
| 3 | **Problem** | A question, not a claim. Don't assume they're failing | Ends in "?", no "you're losing / you're missing" |
| 4 | **Proof** | One short line from the Proof Bank, or none in email 1 | Proof exists in Proof Bank; permission checked |
| 5 | **Offer** | "Free for 2 weeks on your after-hours line, switch it off anytime" (wording must match Product Truth) | Matches Product Truth commercial terms |
| 6 | **CTA** | One low-friction interest question ("want the demo number?", "worth a look?"). Not a meeting time in email 1 | Exactly one question mark in the CTA line; no calendar link |
| 7 | **Signature** | Sender name matching mailbox, company, plain-text site, postal address, opt-out line | Name = mailbox owner; address and opt-out present |
| 8 | **Follow-up day 3** | Adds something new (demo number, short example, one stat from "Safe to quote") | Contains new information, not "bumping this" |
| 9 | **Follow-up day 7** | Short, polite last note that makes "no" easy | Under 50 words |

## 2. Global rules

- Email body **under 90 words** (Sales Craft §2: Gong and Lavender data favor short).
- **3rd–5th grade reading level.** Short words, short sentences.
- **Plain text. No links in email 1.** No images, no tracking pixels (open tracking off).
- **Banned phrases:** see Sales Craft §9 (e.g. "hope this finds you well", "just checking in", "AI-powered", "revolutionize", "streamline", "leverage", "synergy").
- **City, trade and season checked** (no "heat wave" in October; Naples, FL ≠ Key Largo).
- **All merge fields filled.** No `{{firstName}}` or `[Company]` left in.
- **Short company names** ("Bartlett", not "Bartlett Heating & Cooling Inc.").
- Sounds like a person wrote it in 5 minutes.

## 3. Quality gate (run on every card)

```
[ ] Subject: one line, ≤6 words, <50 chars, no newline
[ ] Opener fact has a source link
[ ] Problem is a question, no assumption of failure
[ ] Any proof is in Proof Bank with permission
[ ] Offer wording matches Product Truth
[ ] One CTA; no meeting link in email 1
[ ] Body ≤90 words (email) / ≤250 chars (LinkedIn note)
[ ] No banned phrases
[ ] City, trade, season correct
[ ] No unfilled merge fields
[ ] Signature matches sending mailbox; postal address + opt-out present
[ ] No stat unless on "Safe to quote", with source named
```

## 4. Current message versions (contractors ICP)

Status key: **Live** = in use · **Test** = A/B against Live · **Retired**

### Subject lines
| ID | Text | Status |
|---|---|---|
| S-A | your dispatcher opening | Live |
| S-B | after-hours calls at [Company] | Test |

### Email 1
**E1-A (Live)**
> Hi [first name],
>
> Saw [Company] is hiring [a dispatcher / an overnight dispatcher / a customer service rep].
>
> Until that seat's filled, what happens to a call that comes in at 9pm? If it hits voicemail, our AI receptionist can answer it, book the job and text your on-call tech.
>
> Happy to run it on your after-hours line free for 2 weeks. Switch it off anytime.
>
> Want the details?
>
> [Sender name]

**E1-B (Test — interest CTA with demo, use once demo line is live)**
> Same as E1-A, but replace the last line with: "Want the demo number? Call it and pretend your [AC/furnace/water heater] just died."

### LinkedIn connection note (≤250 chars)
**L1-A (Live)**
> Hi [first name], saw you're hiring [role]. Until that seat's filled, want an AI to answer those calls free for 2 weeks? It books the job and texts your on-call tech. No catch, turn it off anytime.

*(Claims "books the job and texts your on-call tech" must be confirmed in Product Truth.)*

### Follow-up day 3
**F3-A (Live)**
> Hi [first name], one more thing: [new info — e.g. "here's a number you can call to hear it: ..." or one Safe-to-quote stat with source]. Still happy to set up the free 2 weeks if it's useful.

### Follow-up day 7
**F7-A (Live)**
> Hi [first name], I'll leave it here. If after-hours calls ever become a headache, just reply and I'll set it up. Good luck with the hire.

---

## 5. Version history

| Date | Component | Change | Evidence | Approved by |
|---|---|---|---|---|
| 2026-10-05 | All | Initial versions | — | |
