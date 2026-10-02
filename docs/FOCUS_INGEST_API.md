# Flow Today ingest API

The Sales Pipeline bot pushes Muqeet's Focus day here. The app stores the cards in `pipeline_today_rows` and reuses the Today-tab mapping from the sheet sync (action, mailto, LinkedIn, follow-up). Nothing is sent to a prospect.

Google Sheets is not required for this path. Leave `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` empty unless you still want the old sheet sync as a fallback. A sheet sync only drops rows it created. It does not remove cards this API wrote.

## Secret

`FOCUS_INGEST_SECRET` is a bearer token, same idea as `CRON_SECRET`.

1. Put a long random single-line value in the VPS app env at `/var/www/products/salesAI/.env`:
   ```
   FOCUS_INGEST_SECRET=...
   ```
   Restart `salesai` after editing it by hand (`sudo systemctl restart salesai`).
2. Add the same value as the GitHub Actions secret `FOCUS_INGEST_SECRET`. The deploy workflow writes it into that `.env` when the line is missing or empty, then the later restart picks it up. If the VPS line is already set, deploy leaves it alone.
3. Give the same value to the Sales Pipeline bot. Do not commit it.

If the variable is missing, both routes return **501** `{ "error": "FOCUS_INGEST_SECRET not configured" }`. A wrong token is **401**.

The cron workflow does not call this API. It still uses `CRON_SECRET`.

## Rebuild

`PUT` or `POST /api/v1/focus/days/{datePkt}/rebuild`

`datePkt` is `YYYY-MM-DD` in Asia/Karachi and must match the body. `owner` must be `muqeet` (any other owner is **403**).

```bash
curl -sS -X PUT "https://sales.nerdflow.cloud/api/v1/focus/days/2026-10-02/rebuild" \
  -H "Authorization: Bearer $FOCUS_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "muqeet",
    "datePkt": "2026-10-02",
    "source": "today-rebuild",
    "cards": [
      {
        "cardId": "2026-10-02-hphs-lee-li",
        "timePkt": "5:00 PM",
        "name": "Lee Kurtas",
        "company": "High Performance Home Systems",
        "dealId": null,
        "action": "LinkedIn request",
        "link": {"kind": "linkedin_profile", "url": "https://www.linkedin.com/in/lee-kurtas-7790b225", "label": "Open LinkedIn"},
        "message": "",
        "rules": {"linkedinNote": false, "autoSend": false, "fromIdentity": "muqeet@nerdflow.tech"},
        "done": false
      }
    ]
  }'
```

Response:

```json
{ "accepted": 1, "cardIds": ["2026-10-02-hphs-lee-li"], "rejected": [], "queueDate": "2026-10-02" }
```

Rules:

- Replaces that day's **open** cards for Muqeet only. Sending the same body again is safe and returns the same card ids. An empty `cards` array clears the open cards. A payload where every card is rejected does not change the queue.
- The whole day is one database transaction. Send the full list (a 15-card day, or 30+) in one request. Do not split it into batches under 10 cards.
- Cards already **done**, **skipped**, or **needs follow-up** on that day are left in place. Pass `"force": true` or `?force=true` to drop them and to let a `done: false` card reopen.
- `action` of Call or Phone is rejected (`call_not_allowed`) and is not stored. A payload whose every card is rejected returns **422** and does not change the queue.
- `rules.autoSend: true` is rejected. The app never sends email, LinkedIn, or a form.
- `fromIdentity`, when set, must start with `muqeet@`.
- A `cardId` that already belongs to another day is **409**. A duplicate `cardId` in one body is **422**.
- `dealId` (for example `NF-049`) is stored on the lead as `pipelineDealCode`. It does not create a deal.

## Complete

`POST /api/v1/focus/cards/{cardId}/complete`

`cardId` is the id from the rebuild (the database id also works). This is the same Done / Skip / Needs follow-up write as Focus: status on `pipeline_today_rows`, a touch, the audit log, and best-effort sheet writeback. API card ids do not set Today column G.

```bash
curl -sS -X POST "https://sales.nerdflow.cloud/api/v1/focus/cards/2026-10-02-hphs-lee-li/complete" \
  -H "Authorization: Bearer $FOCUS_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"outcome":"done"}'

curl -sS -X POST "https://sales.nerdflow.cloud/api/v1/focus/cards/2026-10-02-fu-nf049/complete" \
  -H "Authorization: Bearer $FOCUS_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"outcome":"needs_follow_up","dueDate":"2026-10-06","note":"Asked for a quote","completedAtPkt":"2026-10-02T18:40"}'

curl -sS -X POST "https://sales.nerdflow.cloud/api/v1/focus/cards/2026-10-02-hphs-lee-email/complete" \
  -H "Authorization: Bearer $FOCUS_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"outcome":"skip"}'
```

`outcome` is `done`, `skip`, or `needs_follow_up`. LinkedIn request and send-email cards allow Done and Skip. Reply and follow-up also allow Needs follow-up. Next-action cards allow Done and Needs follow-up. An outcome the card does not allow is **422**.

Unknown card is **404**. The same outcome again returns **200** with `"idempotent": true` and does not write a second touch. A different outcome on a finished card is **409**.

`dueDate` (`YYYY-MM-DD`) is only valid with `needs_follow_up`. It sets the open deal's next step when that lead already has one. `completedAtPkt` with no zone is Asia/Karachi. `note` is stored on the audit row, not sent anywhere.

## Errors

| Status | When |
|---|---|
| 401 | Bearer missing or wrong |
| 403 | `owner` is not Muqeet, or the card belongs to another rep |
| 404 | Muqeet's user is missing, or the card id is unknown |
| 409 | Card id already used on another day, or the outcome conflicts |
| 422 | Body does not match the schema, or no card was accepted |
| 500 | Save failed. Body is `{ "error": "Couldn't save the Today queue", "code": "save_failed" }` (complete uses its own `error` text). Retry the same body once. The VPS log `[focus-ingest] rebuild failed` includes the Prisma code and message. |
| 503 | Database or transaction was busy. Body includes `"code": "db_busy"`. Wait a few seconds and send the same body again. Safe to retry; a failed rebuild does not leave a half-applied open queue. |
| 501 | `FOCUS_INGEST_SECRET` is not set |

## OpenAPI

```yaml
openapi: 3.0.3
info:
  title: Flow Today ingest
  version: "1"
paths:
  /api/v1/focus/days/{datePkt}/rebuild:
    put:
      operationId: rebuildFocusDay
      parameters:
        - in: path
          name: datePkt
          required: true
          schema: { type: string, example: "2026-10-02" }
        - in: query
          name: force
          schema: { type: boolean }
        - in: header
          name: Authorization
          required: true
          schema: { type: string, example: "Bearer $FOCUS_INGEST_SECRET" }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/Rebuild"
      responses:
        "200":
          description: Queue replaced
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/RebuildResult"
        "401": { description: Unauthorized }
        "403": { description: Wrong owner }
        "409": { description: Stale card id }
        "422": { description: Validation failed }
        "500": { description: "Save failed. code save_failed. Retry the same body." }
        "503": { description: "Database busy. code db_busy. Retry the same body after a short wait." }
        "501": { description: Secret not configured }
    post:
      operationId: rebuildFocusDayPost
      description: Same as PUT.
  /api/v1/focus/cards/{cardId}/complete:
    post:
      operationId: completeFocusCard
      parameters:
        - in: path
          name: cardId
          required: true
          schema: { type: string }
        - in: header
          name: Authorization
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/Complete"
      responses:
        "200": { description: Outcome stored, or the same outcome again }
        "404": { description: Unknown card }
        "409": { description: Different outcome already stored }
        "422": { description: Outcome not allowed for this card }
components:
  schemas:
    Rebuild:
      type: object
      required: [owner, datePkt, source, cards]
      properties:
        owner: { type: string, enum: [muqeet] }
        datePkt: { type: string }
        source: { type: string, example: today-rebuild }
        force: { type: boolean }
        cards:
          type: array
          items: { $ref: "#/components/schemas/Card" }
    Card:
      type: object
      required: [cardId, name, action]
      properties:
        cardId: { type: string }
        timePkt: { type: string, nullable: true }
        name: { type: string }
        company: { type: string }
        dealId: { type: string, nullable: true }
        action: { type: string }
        link:
          type: object
          properties:
            kind: { type: string, enum: [mailto, linkedin_profile, contact_form, none] }
            url: { type: string, nullable: true }
            label: { type: string, nullable: true }
        message: { type: string }
        rules:
          type: object
          properties:
            linkedinNote: { type: boolean }
            autoSend: { type: boolean }
            fromIdentity: { type: string }
        done: { type: boolean }
    RebuildResult:
      type: object
      required: [accepted, cardIds, rejected]
      properties:
        accepted: { type: integer }
        cardIds: { type: array, items: { type: string } }
        rejected:
          type: array
          items:
            type: object
            properties:
              cardId: { type: string }
              reason: { type: string }
        queueDate: { type: string }
    Complete:
      type: object
      required: [outcome]
      properties:
        outcome: { type: string, enum: [done, skip, needs_follow_up] }
        dueDate: { type: string }
        note: { type: string }
        completedAtPkt: { type: string }
```
