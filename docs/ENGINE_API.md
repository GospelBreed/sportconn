# SportConn CRM — Engine API

The REST API the **AI Partnership Acquisition Engine** (n8n + Claude) uses to
read and write the CRM. It is the engine's only way in: a fixed set of
validated operations, every write attributed to the *AI Partnership Engine*
user and recorded in the audit log.

The engine **cannot** send email directly (it submits drafts that people approve), change prices, contracts or payments, mark a
deal Won or Lost, assign owners, or delete anything. People do those in the CRM.

## Base URL and authentication

```
https://xvuifgbdcfhezbcevskl.supabase.co/functions/v1/engine-api
Authorization: Bearer <ENGINE_API_KEY>
Content-Type: application/json
```

`ENGINE_API_KEY` is a Supabase secret. Store it in n8n as a credential
(Header Auth), never in a workflow's plain parameters.

All responses are JSON. Errors look like `{"error": "code", "message": "…"}`.

| Status | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Bad request (see `error`) |
| 401 | Missing or wrong API key |
| 403 | Not allowed for the engine (e.g. moving a deal to Won) |
| 404 | Unknown route or record |
| 409 | Duplicate company or suppressed contact |
| 413 | Body over 512 KB |
| 422 | Lead rejected by validation (below threshold, no sources…) |
| 500 | Server error — the request was not completed; safe to retry |

Settings (Supabase secrets): `ENGINE_MIN_SCORE` (default **65**),
`ENGINE_DAILY_TARGET` (default **80**).

---

## Routes

### `GET /health`
Checks the key and settings. `{"ok":true,"min_score":65,"daily_target":80}`

### `GET /runs/today`
Workflow A step 1 ("check previous runs / available slots"). Days are counted
in Lagos time.

```json
{ "date": "2026-11-11", "daily_target": 80, "created_today": 34,
  "research_saved_today": 41, "remaining": 46, "runs": [ … ] }
```

### `POST /runs` — start a run
`{"target": 80, "notes": "optional"}` → `201 {"ok":true,"run":{"id":"…"},"today":{…}}`
Pass `run.id` as `run_id` on every upsert in that run.

### `PATCH /runs/{id}` — finish / update a run
```json
{ "status": "completed", "created_count": 46, "updated_count": 5,
  "duplicate_count": 12, "rejected_count": 9,
  "notes": "Fintech category thin today", "errors": [] }
```
`status`: `running` · `completed` · `partial` · `failed` (anything but
`running` stamps the finish time). The CRM's *Sponsors → AI engine* tab shows
these runs.

### `POST /leads/check` — duplicates and suppression, before researching
Up to 200 candidates per call. Each may have `domain`, `website`, `email`,
`company_name`.

```json
{ "candidates": [ { "website": "https://kuda.com" }, { "company_name": "Guinness Nigeria Plc" } ] }
```
```json
{ "ok": true, "results": [
  { "input": {…}, "domain": "kuda.com",
    "match": { "lead_id": "…", "name": "Kuda Microfinance Bank", "domain": "kuda.com",
               "pipeline": "sponsor", "stage": "researched", "status": "open" },
    "match_on": "domain", "domain_suppressed": false, "email_suppressed": false },
  { "input": {…}, "domain": null, "match": null, "match_on": null,
    "domain_suppressed": false, "email_suppressed": false } ] }
```
Matching order: company domain → contact email → normalised company name
("The Coca-Cola Company Nigeria Ltd" → `cocacola`). Skip candidates with a
`match` (or update them) and never research suppressed ones.

### `GET /leads/search?q=…&domain=…&email=…&limit=20`
Free lookup for existing leads (at least one parameter; `limit` ≤ 100).

### `POST /leads/upsert` — save one researched, qualified lead
One company per call. Creates the lead, or updates the existing lead for the
same company, in a single transaction.

```json
{
  "pipeline": "sponsor",
  "run_id": "uuid from POST /runs",
  "company": {
    "name": "Kuda Microfinance Bank",
    "website": "https://kuda.com",
    "industry": "Fintech",
    "country": "Nigeria",
    "location": "Lagos"
  },
  "contacts": [
    { "full_name": "Ada Obi", "job_title": "Head of Brand", "email": "ada@kuda.com",
      "linkedin": "https://linkedin.com/in/…", "is_primary": true },
    { "full_name": "Tunde Bello", "job_title": "Partnerships Manager", "email": "tunde@kuda.com",
      "relevance": "Runs sports partnerships" }
  ],
  "scores": {
    "audience": 22, "marketing": 17, "partnership_evidence": 12,
    "collaboration": 12, "decision_access": 10, "contact_quality": 8
  },
  "intelligence": {
    "research_date": "2026-11-11",
    "company_overview": "…",
    "target_audience": "…",
    "marketing_activities": ["…"],
    "sponsorship_history": ["…"],
    "business_objective": "…",
    "partnership_gap": "…",
    "sportconn_opportunity": "…",
    "potential_value": "…",
    "verified_facts": ["…"],
    "assumptions": ["…"],
    "sources": [ { "url": "https://…", "title": "…", "note": "supports the sponsorship claim" } ]
  },
  "notes": "optional"
}
```

**Rules (enforced by the CRM):**

| Field | Rule |
|---|---|
| `pipeline` | `sponsor` (default) or `strategic_partnership` |
| `company.name` | required |
| `company.website` or `company.domain` | required, the company's own domain (not gmail/yahoo…) — it is the duplicate key |
| `scores` | all six, whole numbers: audience 0–25, marketing 0–20, partnership_evidence 0–15, collaboration 0–15, decision_access 0–15, contact_quality 0–10 |
| total score | must be ≥ `ENGINE_MIN_SCORE` (65); ≥ 80 is returned as `"priority": true` |
| `intelligence.sources` | at least one, each an `http(s)` URL (string or `{url, title, note}`) |
| domain | rejected if on the do-not-contact list |
| contacts | first `is_primary` (else the first) becomes the lead's main contact; others are stored under the company; suppressed or already-saved addresses are skipped, not errors |

Responses:

```json
201 { "ok": true, "action": "created", "lead_id": "…", "research_id": "…",
      "score": 81, "priority": true, "match_on": null,
      "contacts_added": 1, "contacts_skipped": [] }

200 { "ok": true, "action": "updated", "lead_id": "…", "match_on": "domain", … }

422 { "ok": false, "error": "below_threshold", "score": 55, "message": "…" }
409 { "ok": false, "error": "suppressed", "message": "bet9ja.com is on the suppression list" }
```

Other `error` codes: `invalid_pipeline`, `missing_company_name`,
`missing_domain`, `invalid_contacts`, `missing_scores`, `invalid_scores`,
`missing_sources`, `invalid_sources`, `invalid_run_id`, `duplicate`.

New leads land in the pipeline's **Researched** stage with source **AI
Partnership Engine**. On an update, the scores and research are refreshed and
empty company fields filled in; stage, owner, notes and anything people have
entered are left alone. Every upsert adds a research version (history is kept)
and a timeline entry.

### `PATCH /leads/{id}`
`{"fields": { … }}` (or the fields directly). Allowed: `stage` (not a Won/Lost
stage), `next_action`, `next_follow_up_at`, `next_follow_up_type`,
`temperature`, `priority`, `notes`, `title`, `phone`, `linkedin_url`,
`website`, `industry`, `location_city`, `location_country`. Anything else → 400
`field_not_allowed`.

### `GET /suppression?since=ISO&limit=500&offset=0`
The do-not-contact list (`email` or `domain`, `reason`, `created_at`), with
`total` for paging. A domain entry covers its sub-domains.

### `POST /suppression`
`{"email": "x@y.com", "reason": "unsubscribed", "note": "…"}` or
`{"domain": "y.com", "reason": "do_not_contact"}`.
Reasons: `unsubscribed`, `opt_out_request`, `bounced`, `complained`,
`do_not_contact`, `manual`, `other`. Already listed → `200 {"already_suppressed": true}`.
Only management or admins can remove entries (in the CRM).

### `GET /stats?from=YYYY-MM-DD&to=YYYY-MM-DD`
Engine output for the window (default: last 30 days) plus the sponsor scorecard.

```json
{ "window": {…}, "engine": { "leads_created": 412, "priority_80_plus": 120,
  "qualified_65_79": 292, "by_pipeline": { "sponsor": 380, "strategic_partnership": 32 } },
  "scorecard": { … } }
```

### `POST /contacts/eligibility` — record where an address came from
Do this for every contact before drafting an email to them. The CRM, not the
engine, decides whether the address may be emailed.

```json
{ "email": "ada@kuda.com", "lead_id": "…",
  "source_type": "company_website", "source_url": "https://kuda.com/team",
  "lawful_basis": "legitimate_interest", "basis_note": "Published partnerships contact",
  "verification": { "status": "valid", "provider": "zerobounce", "checked_at": "2026-11-11T09:00:00Z" } }
```
`source_type`: `company_website`, `linkedin`, `data_provider`, `referral`,
`event`, `inbound`, `existing_relationship`, `other`.
`lawful_basis`: `legitimate_interest`, `consent`, `existing_relationship`,
`none_recorded`. `verification.status`: `valid`, `risky`, `invalid`,
`unknown`, `unverified` — use a real verification service, never a guess.

→ `{"ok":true,"email":"ada@kuda.com","eligibility":{"status":"eligible","reason":"Verified, source and lawful basis recorded"}}`

Eligibility rules: on the do-not-contact list or failed verification →
`ineligible`; no record, no lawful basis, no source, not verified, risky, or a
personal address (gmail, yahoo…) → `pending_review`; otherwise `eligible`.
Management can override in the CRM (never for unsubscribed or invalid
addresses).

### `GET /contacts/eligibility?email=…`
`{"email":"…","eligibility":{"status":"…","reason":"…"}}`

### `POST /emails/draft` (alias `POST /emails/queue`) — submit an email for review
```json
{ "lead_id": "…", "to": "ada@kuda.com", "run_id": "optional",
  "subject": "Kuda fans and match-day predictions",
  "body": "Hello Ada, …",
  "partnership_concept": "Kuda-branded Predict & Win",
  "personalization_evidence": ["Kuda is Sporting Lagos' shirt sponsor (source: …)"],
  "facts_to_verify": ["Season dates"],
  "confidence": 0.82 }
```
Plain text, no unsubscribe line (the CRM adds it), no `[placeholders]` or
`{variables}`. If the copywriter returned `NEEDS_RESEARCH`, don't call this.

→ `201 {"ok":true,"email_id":"…","status":"draft","blocker":null,"eligibility":{…}}`

`status` is `draft` (waits in **Email review** for a person) — or `approved`
only if review has been switched off in Settings and nothing blocks it.
`blocker` says what would stop it being approved (e.g. contact not eligible).

Refusals: `409` `already_queued` (a live draft exists for that address),
`recently_contacted` (emailed within the minimum gap, default 14 days),
`suppressed`, `lead_closed`; `422` `unfilled_placeholders`, `needs_research`,
`address_not_on_lead`, `missing_content`, `too_long`, `invalid_confidence`,
`lead_not_found`.

### `GET /emails/status?since=ISO&status=sent,delivered&lead_id=…&limit=200`
Latest state of queue emails: `draft`, `approved` (queued), `sending`, `sent`
(accepted by Resend), `delivered`, `bounced`, `complained`, `failed`,
`rejected`, `cancelled` — with timestamps and any error. A successful send is
`sent`; only `delivered` means it reached the recipient's mail server.

---

## Sending (`email-engine` function)

Base: `https://xvuifgbdcfhezbcevskl.supabase.co/functions/v1/email-engine`

### `POST /run` — send the next batch
Auth: the same `Authorization: Bearer <ENGINE_API_KEY>`. Body `{"max": 10}`
(≤ 25). Call it on a schedule — an n8n **Schedule Trigger** every 15 minutes
→ HTTP Request `POST …/email-engine/run` with the "SportConn Engine API"
credential. It sends only **approved** emails, and only within the limits in
**Settings → Email sending**: daily total, per company per day, sending days
and hours (Lagos), and not while paused.

```json
{ "ok": true, "sent": 3, "failed": 0, "paused": false, "outside_window": false,
  "budget_reached": false, "results": [ { "id": "…", "ok": true, "provider_id": "…" } ] }
```

Each email is plain text from "<approver's name> at SportConn", Reply-To the
approver, with an unsubscribe line and one-click unsubscribe headers. Every
send is logged on the lead's timeline. Temporary failures retry (up to 3
attempts); permanent ones show under **Email review → Problems**.

### `POST /webhooks/resend` — delivery events
Set up once in Resend → **Webhooks**: endpoint
`…/functions/v1/email-engine/webhooks/resend`, events `email.sent`,
`email.delivered`, `email.delivery_delayed`, `email.bounced`,
`email.complained`. Copy the signing secret into the `RESEND_WEBHOOK_SECRET`
Supabase secret. Hard bounces and spam complaints are added to the
do-not-contact list automatically (also for one-to-one emails sent from a
lead).

### Unsubscribe
`GET /unsubscribe?t=…` redirects to the CRM's confirmation page
(`APP_URL/unsubscribe`); `POST` (mail clients' one-click, or the page's button)
adds the address to the do-not-contact list and cancels any pending drafts to
it.

---

## Mapping to the blueprint's workflows

| Blueprint step | Call |
|---|---|
| A1 Check previous runs / available slots | `GET /runs/today` |
| A start of run | `POST /runs` |
| A "Check existing CRM" / B "Check duplicates" | `POST /leads/check` (batch) |
| B Create / update CRM lead + save research | `POST /leads/upsert` |
| Retrieve suppressed contacts | `GET /suppression` |
| End of run, counts, shortfall | `PATCH /runs/{id}` |
| Daily reporting | `GET /stats`, `GET /runs/today` |
| C Check contact eligibility | `POST /contacts/eligibility` |
| C Add to email queue | `POST /emails/draft` (people approve in **Email review**) |
| D Email sending engine | schedule `POST email-engine/run` |
| D Monitor delivery events / update CRM | Resend webhook → `email-engine/webhooks/resend`; read `GET /emails/status` |

**Not available yet** (next build stage): reply capture and reply
classification, automatic follow-up sequences (stop on reply), and the
engine performance dashboard. Until then, replies arrive in the approver's own
inbox — log them on the lead by hand.
