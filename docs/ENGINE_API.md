# SportConn CRM — Engine API

The REST API the **AI Partnership Acquisition Engine** (n8n + Claude) uses to
read and write the CRM. It is the engine's only way in: a fixed set of
validated operations, every write attributed to the *AI Partnership Engine*
user and recorded in the audit log.

The engine **cannot** send email, change prices, contracts or payments, mark a
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

**Not available yet** (next build stages): email drafts and the sending queue
(`POST /emails/queue`), delivery / reply status (`GET /emails/status`),
contact verification and eligibility fields, unsubscribe links, reply capture
and follow-up sequences. Don't build n8n steps that send email until those
exist.
