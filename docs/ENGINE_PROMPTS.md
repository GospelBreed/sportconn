# SportConn CRM: Claude in the n8n workflows

The Claude prompts and response formats for the acquisition engine, matched to
what the Engine API accepts (`docs/ENGINE_API.md`). Each Claude step is three
n8n nodes:

1. **Build** (a Code node). It holds the prompt and the JSON schema, and outputs
   `claude_body`.
2. **Claude** (an HTTP Request node). It sends `claude_body` to the Claude API.
3. **Parse** (a Code node). It checks the reply, applies the CRM's rules and
   outputs the exact CRM payload, or `ok: false` with a reason.

The Code node scripts are in [`n8n/claude/`](../n8n/claude/). Paste each one
into a Code node with the **mode** written at its top, and use the **node names
given here**: the scripts look each other up by name.

## 1. One-time setup

**Anthropic credential.** n8n → Credentials → New → *Header Auth*. Set Name to
`x-api-key` and Value to your Anthropic API key, then save it as "Anthropic API".
Never paste the key into a node or a chat.

**Every "Claude: …" HTTP Request node** uses these settings:

| Setting | Value |
|---|---|
| Method / URL | `POST` `https://api.anthropic.com/v1/messages` |
| Authentication | Generic → Header Auth → "Anthropic API" |
| Headers | `anthropic-version: 2026-10-21` · `anthropic-beta: server-side-fallback-2026-07-01` |
| Body | JSON → *Using JSON* → `{{ JSON.stringify($json.claude_body) }}` |
| Options → Timeout | `600000` (research can take a few minutes) |
| Options → Batching | 3 items per batch, 2000 ms interval |
| Settings → Retry On Fail | on, 3 tries, 15000 ms wait (covers busy and rate-limit errors) |
| Settings → On Error | *Continue* (the Parse node turns an error into a skip with a reason) |

**Every SportConn CRM HTTP node** uses the "SportConn Engine API" credential and
the base URL `https://xvuifgbdcfhezbcevskl.supabase.co/functions/v1/engine-api`,
as you already have. Also turn on **Options → Response → Never Error**, so a
409 or 422 refusal comes back as data and doesn't stop the run.

**Settings the requests use:**
- Model: `claude-opus-5-5` for every step (change `MODEL` at the top of a Build
  node to change it).
- Effort: research `high`, scoring and copy `medium`, candidates, replies and
  follow-ups `low`.
- `fallbacks: "default"` plus that beta header. If Claude declines a request,
  the API retries it on a fallback model instead of stopping.
- Structured output: `output_config.format` with a JSON schema. The reply is
  always valid JSON in that shape. The schemas avoid what structured output
  doesn't support (min/max, length limits, optional fields), so the Parse nodes
  enforce the CRM's ranges.
- Research is the only step with web search: `web_search_20260209`, up to 8
  searches, located in Lagos. It has no JSON schema, because web search returns
  cited text and citations can't be combined with structured output. The
  scoring step then turns the cited dossier into the CRM record.

**Before the first run:**
- Open **Build copy request** and replace the two `EDIT ME` blocks.
  `ABOUT_SPORTCONN` is the only thing the AI may say about SportConn, so keep
  it true. `SIGN_OFF` is how every email ends. The node refuses to run until
  both are filled in.
- In **Parse scoring**, `BASIS_FOR_PUBLISHED` is set to `legitimate_interest`
  for business addresses the company published itself. That is a SportConn
  policy decision: change it to `none_recorded` if management hasn't agreed it.
- Email verification. Parse scoring records every address as `unverified`, so
  every contact lands in **pending review** and no email can be approved until
  someone overrides it. To change that, add a verification node (ZeroBounce,
  NeverBounce…) between **Split Out eligibility** and **POST eligibility**, and
  set `verification` from its result (`valid`, `risky`, `invalid`, `unknown`).

## 2. Workflow "Engine: research run" (blueprint A + B + C)

Schedule it **several times a day** (for example 07:00, 09:00, 11:00, 13:00 and
15:00 Lagos, Monday to Friday) instead of once. Each run tops up toward the
daily target and stays within n8n's execution time limit.

```
Schedule
 → GET /runs/today ── IF {{ $json.remaining > 0 }}
 → POST /runs  "Start run"     body {{ JSON.stringify({ target: Math.min($json.remaining, 20) }) }}
 → Code "Categories"           (yours: return [{json:{category:'Fintech',count:15}}, …])
 → a1  "Build candidates request" → "Claude: candidates"
 → a2  "Prepare check"
 → POST /leads/check            body {{ JSON.stringify({ candidates: $json.candidates }) }}
 → a3  "Keep new candidates"
 → b1  "Build research request" → "Claude: research"
 → IF "Paused?"  {{ $json.stop_reason }} equals pause_turn
      true  → b2 "Continue research" → "Claude: research (resume)" ─┐
      false ───────────────────────────────────────────────────────┤
 → b3  "Build scoring request" ◄────────────────────────────────────┘
 → IF {{ $json.ok }} → "Claude: scoring"
 → b4  "Parse scoring"
     ├─ (upper) IF {{ $json.ok }} → POST /leads/upsert  body {{ JSON.stringify($json.upsert_body) }}
     │           → b5 "After upsert" → IF {{ $json.ok }}
     │                ├─ (upper) Split Out "eligibility" → POST /contacts/eligibility  body {{ JSON.stringify($json) }}
     │                └─ (lower) IF {{ $json.created && !!$json.copy }}
     │                        → c1 "Build copy request" → "Claude: copy"
     │                        → c2 "Parse copy" → IF {{ $json.ok }}
     │                        → POST /emails/draft  body {{ JSON.stringify($json.draft) }}
     └─ (lowest) d1 "Run summary" → PATCH /runs/{{ $json.run_id }}  body {{ JSON.stringify($json.patch) }}
```

n8n (execution order v1, the default) finishes the upper branch before it
starts the lower one. So keep **eligibility above copy** (each address's source
is recorded before its draft) and **Run summary lowest** (it counts what the
branches above did). Name the POST /runs node **Start run** exactly.

Each step:

| Step | Claude returns | n8n then |
|---|---|---|
| a1 candidates | `{candidates:[{company_name, website, why}]}`. The website is empty when Claude isn't sure, never guessed. | dedupes, checks against the CRM, and keeps about 1.5× the remaining gap |
| b1 research | a plain-text dossier: each fact followed by its URL, `INFERRED` / `NOT FOUND` marks, and emails only exactly as published | resumes once if paused; skips the company if research didn't finish |
| b3 scoring | `decision`, `pipeline`, `company`, `contacts[]` (each email with the page it came from), the six `scores`, `score_rationale`, `intelligence` (with `sources`) | clamps scores to their maxima, totals them, rejects anything below 65, not "qualified", without a website or without an http(s) source, and drops any email without a source page |
| c1 copy | `status` (`ready` / `needs_research`), `subject`, `body` (100–160 words, plain text), `partnership_concept`, `personalization_evidence[]`, `facts_to_verify[]`, `confidence` | runs the CRM's placeholder check and length limits, and only drafts new leads whose main contact has an email |

Drafts land in **Email review** in the CRM: people approve, and the sender sends.

## 3. Workflow "Engine: send queue" (D)

The workflow you already have (`POST …/email-engine/run`). Switch its trigger
to a **Schedule every 15 minutes** and set the workflow **Active**. The CRM
enforces sending hours, daily limits and the per-domain limit, so frequent
runs are safe.

## 4. Workflow "Engine: replies" (E)

```
Schedule (every 30 minutes)
 → GET /replies?status=unclassified&limit=50
 → Split Out "results"
 → e1 "Build classify request" → "Claude: classify"
 → e2 "Parse classify" → IF {{ $json.ok }}
 → POST /replies/{{ $json.reply_id }}/classify   body {{ JSON.stringify($json.body) }}
```

Claude returns `{classification, summary, suggested_response}`. The CRM then
updates the lead's temperature, stage and next action, and puts unsubscribes on
the do-not-contact list. The suggested response is only shown to the team; it is
never sent automatically. The prompt treats the reply text as content, so
instructions inside a prospect's email are not followed.

## 5. Workflow "Engine: follow-ups"

```
Schedule (weekdays 10:00 Lagos)
 → GET /emails/followups-due?limit=50
 → Split Out "results"
 → f1 "Build follow-up request" → "Claude: follow-up"
 → "Parse copy" (paste c2-parse-copy.js and set SOURCE = 'followup')
 → IF {{ $json.ok }} → POST /emails/draft  body {{ JSON.stringify($json.draft) }}
```

The first follow-up is 50–80 words and adds one angle taken only from the
earlier email. The last one is 40–70 words and closes the loop. Both use the
subject "Re: <earlier subject>". The CRM enforces the spacing (4 then 7 days),
the maximum of two, and stops when anyone at the company replies. Follow-ups
also go through Email review.

## 6. Cost

These are rough estimates; check the Anthropic console after the first day.
Claude Opus 5.5 costs $4 per million input tokens and $20 per million output
tokens, and web searches are billed per search on top.

| Step | Estimate per company |
|---|---|
| Research (up to 8 searches) | about $0.25–0.50 |
| Scoring | about $0.05–0.10 |
| Copy | about $0.03–0.05 |
| Reply or follow-up | about $0.01–0.02 |

Researching about 120 companies to save 80 is roughly **$40–75 a day**. To cut
cost, change `MODEL` to `claude-sonnet-5-5` ($2 / $10) in the scoring, copy,
reply and follow-up nodes first, keeping Opus for research. Compare a day's
drafts before switching research too.

## 7. Testing a change

The scripts were checked against a mock of n8n's `$input` / `$()` (every Build
and Parse path, including refusals, pauses, placeholders and below-threshold
scores). In n8n, test with **Categories** returning a single category with
`count: 3` before you schedule anything.
