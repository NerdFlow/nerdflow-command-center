# Focus Today sync

The Sales Pipeline bot should push the day through [`docs/FOCUS_INGEST_API.md`](FOCUS_INGEST_API.md). That path does not need a Google service account. The sheet sync below remains as a fallback.

Focus cards come from the Sales Pipeline **Today** tab when someone syncs the sheet or pastes it. The app never sends email, LinkedIn, a form, or a call. A sheet sync only removes open rows it created. Cards written by the ingest API stay.

## Sheet

| | |
|---|---|
| Spreadsheet | `1u5D8vGJJGKLDPbkPHVeg1KtXTL_ieMQ-1_69UxJd7zY` |
| Tab | Today (`sheetId` `525866747`) |
| Rebuild | Weekdays, about 15:26 Asia/Karachi |

Columns, left to right:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Time (PKT or —) | Name | Company | Action | Link | Message | Done (`TRUE` / `FALSE`) |

The Tonight tab is not read. A connection note on a LinkedIn request is ignored.

The Link cell for email is a formula, not the label you see in the sheet:

```
=HYPERLINK("mailto:TO?subject=ENC&body=ENC","Open in Titan → TO")
```

Sync reads that formula (`valueRenderOption=FORMULA`). The label `Open in Titan → …` is not the URL. From is Titan `muqeet@nerdflow.tech`. Mailto does not set From and does not send.

## What each Action becomes

| Action | Card | Open | Message | Outcomes |
|---|---|---|---|---|
| LinkedIn request | LinkedIn profile | Open profile. Connect with no note. | Forced blank | Done, Skip |
| Send email + mailto formula | Email | Copy + Open in Titan | Column F, or the formula body if F is empty | Done, Skip |
| Send email + http form link | Contact form | Open form + Copy | Column F | Done, Skip |
| Reply to them | LinkedIn DM (or mailto if the link is mailto) | Copy + Open. Not a connection request. | Column F | Done, Skip, Needs follow-up |
| Follow-up | Profile, mailto, or form, from the link | Same as that link | Often blank | Done, Skip, Needs follow-up |
| Anything else (Get ReceptAI live, Negotiate exclusivity, …) | Next action, no link | No Open button | Column F if present | Done, Needs follow-up |
| Call | Call | The rep who works calls dials it | Not imported | Call outcomes. Nothing dials from here |

Time on the card is column A plus `PKT` (a value that is already `—` stays `—`). Example: `Emails · 5:00 PM PKT`.

Rows with Done `TRUE` are stored and hidden. Two rows for the same person are two cards.

## Who sees it

A card is one lead plus one channel. Order is a named-person email, then LinkedIn, then call, then needs contact. Contact-form rows are not queued. The lead owner gets the card when they work that channel and still have room under their daily cap. Otherwise it goes to the teammate who works that channel and has the fewest cards today. If nobody works that channel, it is skipped and the lead moves to the next channel.

Routing does not change who owns the lead. Outcomes stay on that lead. Each person sets the channels they work, and a daily cap per channel, on their profile. A lead can set the same thing for anyone on the team. A rep who does not work calls does not see call cards.

On a day that has a sync, those rows show ahead of the cadence queue for the person they were routed to. The leads are marked in cadence with no next touch, so they do not fall back into the normal queue. The Today sheet is the approval; they are not left sitting in the Lead Inbox.

An open card that nobody marked Done or Skip stays on Focus on later Asia/Karachi days. The board reads every open row whose queue date is today or earlier, oldest first. Done and skipped cards stay hidden. The board does not rewrite `queue_date` or status, so a later sync still only replaces that day's open rows and cannot reopen a finished card.

Do-not-contact and not-a-fit leads are not turned back into open cards.

## How to sync

**Sheet (preferred).** Put the service-account JSON in `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` (`client_email` and `private_key`). `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_APPLICATION_CREDENTIALS` also work. Share the workbook with that `client_email`. On Focus, a lead clicks **Sync from the sheet**.

**Paste.** If those env vars are empty, Focus shows a paste box. Copy the seven columns. For email rows, the Link cell has to be the `HYPERLINK` formula or a raw `mailto:` URL. Copying only the visible label keeps the address when it looks like `Open in Titan → ada@…`, and loses the subject. Turn on **Show formulas** in the sheet (Ctrl+`), then copy.

**Cron.** Optional. Weekdays at 15:31 Asia/Karachi (10:31 UTC), five minutes after the 15:26 rebuild:

```
31 10 * * 1-5 curl -s -X POST https://sales.nerdflow.cloud/api/cron/pipeline-today -H "Authorization: Bearer $CRON_SECRET"
```

GitHub Actions workflow: `.github/workflows/cron-pipeline-today.yml`. If Sheets credentials are missing, the job returns success and skips. A failed read returns an error. Sync never sends messages.

## Done writeback

Done, Skip, and Needs follow-up are saved in the app first (touch, audit log, and for Needs follow-up the open deal's next step when one exists). Sheet write is best-effort and does not block that save.

When a service account is configured, the app:

- appends one row to a tab named `Flow writeback` (create that tab and share the workbook)
- on Done only, sets Today column G of that sheet row to `TRUE`

Column order:

`date`, `time_pkt`, `action`, `lead_id`, `contact_name`, `business_name`, `channel`, `outcome` (`done` | `skip` | `needs_follow_up` | `coach_logged`), `actor_id`, `note`, `next_step`, `sheet_row`, `spreadsheet_id`, `today_sheet_id`, `done_cell`

`note` is the action label, not the draft. With no credentials the same field list is returned as `not_configured` and nothing is written.
