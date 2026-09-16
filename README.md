# Sportconn CRM

A sports-operations CRM for **Sportconn** — a drag-and-drop case pipeline, a
member directory with activity timelines, a facility directory, automated
follow-up timing with in-app reminders, a live analytics dashboard, and a
global command palette.

Built with **React + Vite + TypeScript + Tailwind** on the front and
**Supabase** (Postgres + Auth + Row Level Security + Realtime) as the entire
backend. There is no separate API server — the SPA talks to Supabase directly and
RLS enforces access.

> **Fork note:** this is a rebrand of the Roseway CRM codebase. Only
> user-facing labels changed ("Residents" → "Members", "Properties" →
> "Facilities", etc.) — the Postgres schema, tables, and columns underneath
> are untouched and still use their original names (schema `roseway`, tables
> `residents`/`properties`/...). See [`frontend/src/lib/branding.ts`](./frontend/src/lib/branding.ts)
> and [`frontend/src/lib/constants.ts`](./frontend/src/lib/constants.ts) for
> where the display labels live if you want to rename further or restyle the
> data model to match Sportconn's real fields later.

## Features
- **Dashboard** — portfolio feed: greeting, priority-attention banner, KPI row,
  pipeline-flow strip, lead-temperature & experience-score distribution, a
  "where Roseway can help most" demand heatmap, today's tasks, and recent leads.
- **Leads** — prospective property-management partners in a data-dense table
  (contact, community, scale, asset type, experience score, temperature, stage,
  follow-up) with a full slide-over: contact & asset cards, the **Resident
  Experience diagnostic** (score ring, 6 pillars, synthesis, recommended scope,
  intake responses), timeline, outreach log, and tasks. **CSV import** (drag &
  drop, header auto-mapping, per-row validation, downloadable template) and
  **CSV export** (respects active filters) — format spec in
  [`docs/LEADS_CSV.md`](./docs/LEADS_CSV.md).
- **Pipeline** — 6-stage lead deal Kanban (New Lead → Contacted → Qualified →
  Discovery → Proposal → Pilot) with `@dnd-kit` drag, optimistic updates,
  ARR-per-column, aging + follow-up flags, and a closed-won/lost archive.
- **Case Pipeline** — 5-stage resident-case Kanban (Intake → In Progress →
  Awaiting Resident → Resolved → Closed): days-in-stage aging, priority colours,
  inline quick-notes, archive view, editable slide-over with timeline.
- **Resident Experience** — assessment cards with score rings and pillar
  buckets; detail modal with pillar bars, recommended scope, and intake Q&A.
- **Outreach** — every email / call / LinkedIn / meeting touch, filterable, with
  a "log outreach" modal (lead search + campaign attribution). Logging bumps the
  lead's last-activity and the campaign's counters via triggers.
- **Tasks** — first-class to-dos grouped Overdue / Due today / Upcoming / Later,
  with snooze and complete, plus a merged "pipeline follow-ups" section pulling
  from lead and case `next_follow_up_at`. Assignment fires in-app notifications.
- **Campaigns** — multi-channel program cards with sent / reply / meeting metrics
  and reply-rate bars; inline status changes.
- **Residents** — searchable / filterable table, slide-over (Overview / Cases /
  Activity / Notes), inline editing, soft delete.
- **Properties** — card grid + detail pages showing residents and open cases.
- **Reports & Analytics** — case KPIs, resolution funnel, trend + priority +
  caseload charts, live via Supabase Realtime.
- **Command palette** — `Cmd/Ctrl-K` fuzzy search across leads, residents,
  properties, and cases, plus quick actions (new lead / case / resident / task).
- **Role-based access & governance** — `super_admin` / `admin` / `case_manager` /
  `read_only`, enforced by RLS and mirrored by UI guards. A **Super Admin**
  creates / deletes / disables users, grants Admin, and tunes an editable
  **permission matrix** (per-role create/delete/import/export + visible nav
  sections) from Settings → *Access & governance*; every action is audit-logged.
  Privileged auth ops run in the `manage-users` Edge Function, never the browser.
- **Supporting UX** — toasts, skeleton loaders, empty states, a connection health
  indicator, full mobile responsiveness.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md). TL;DR: the SPA authenticates to
Supabase Auth, then reads/writes Postgres (schema `roseway`) directly with the
anon key as the signed-in user. RLS policies are the authorization boundary;
Postgres triggers log activity and stamp timestamps; one `SECURITY DEFINER` RPC
returns the dashboard aggregates.

```
React SPA (Netlify)  ──supabase-js (anon key + user JWT)──▶  Supabase Postgres `roseway`
        ▲                                                        │ RLS · triggers · RPC
        └──────────────── Realtime (Postgres CDC) ───────────────┘
```

---

## 1. Prerequisites
- **Node 18+** and npm
- A **Supabase** project (free tier is fine) — <https://supabase.com>
- Optional: the **Supabase CLI** (`npm i -g supabase`) if you prefer
  `supabase db push` over the SQL editor
- Optional: the **Netlify CLI** (`npm i -g netlify-cli`) for deploys

## 2. Database setup
1. Open your Supabase project → **SQL Editor** → **New query**.
2. Run the migrations **in order**:
   1. [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql) —
      `roseway` schema, core tables (users, properties, residents, cases,
      activities, notifications), triggers, RLS, `get_analytics_summary()`,
      realtime publication, schema exposure.
   2. [`supabase/migrations/0002_dealflow.sql`](./supabase/migrations/0002_dealflow.sql)
      — leads, campaigns, outreach, tasks, experience_assessments; extends
      activities/notifications; `get_dashboard_summary()`.
   3. [`supabase/migrations/0003_admin_governance.sql`](./supabase/migrations/0003_admin_governance.sql)
      — `super_admin` role, `role_permissions` matrix, `audit_log`,
      `is_super_admin()` / `can_delete()`; delete gated by the matrix.
3. *(Optional)* Run [`supabase/seed.sql`](./supabase/seed.sql) for demo data
   (properties, residents, cases + leads, campaigns, outreach, tasks,
   assessments). Re-running is safe for the core rows; it will add duplicate
   outreach/task demo rows.

   > CLI equivalent: `supabase link --project-ref <ref> && supabase db push`

## 3. Create the first user (Super Admin)
1. Supabase → **Authentication → Users → Add user** — enter an email + password
   and tick *Auto Confirm User*.
2. Open that user → **Edit** → set **Raw app metadata** to:
   ```json
   { "role": "super_admin" }
   ```
   The `roseway.users` row is created automatically by a trigger on signup; the
   `role` there is synced from this value. RLS reads the role from the JWT
   (`app_metadata.role`), so this step is what actually grants access.
3. Also run, once, in the SQL editor (matches the directory row to the JWT):
   ```sql
   update roseway.users set role = 'super_admin' where email = 'you@rosewayresident.com';
   ```
4. From then on, create every other user (Admin / Case Manager / Read Only) **in
   the app** — Settings → *Access & governance* → **Create user** — once the
   Edge Function below is deployed. You never need to touch the Supabase
   dashboard for users again.

## 4. Frontend
```bash
cd frontend
npm install
cp .env.example .env        # then fill in the two values
npm run dev                  # http://localhost:5173
```

`.env`:
| var | where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → Project API keys → `anon` `public` |

> Never put the `service_role` key in the frontend or in `.env` — it bypasses RLS.

Sign in with the user from step 3. You land on **/pipeline**.

## 5. Branding
`frontend/src/lib/branding.ts` is the single slot for Roseway's identity:
```ts
export const BRAND = {
  name: "Roseway CRM",
  primary: "#E11D48",          // crimson — drives the --brand CSS variable
  logoUrl: null as string | null, // drop in a URL or /public asset path
};
```
Changing `primary` reskins the app; `logoUrl` (when set) replaces the wordmark
mark in the sidebar and login screen.

## 6. Project structure
```
supabase/
  migrations/0001_init.sql        core schema + RLS + triggers + RPC + realtime
  migrations/0002_dealflow.sql    leads / campaigns / outreach / tasks / assessments
  migrations/0003_admin_governance.sql  super_admin, role_permissions, audit_log
  functions/manage-users/        Edge Function — privileged user management
  seed.sql                       optional demo data
frontend/
  src/lib/         supabase client, db helpers, auth, query client, branding, format
  src/components/  ui primitives + layout shell (sidebar, top bar, palette, toasts)
  src/features/    pipeline · residents · properties · analytics · followups · settings
  src/pages/       route screens
  src/hooks/       query hooks + realtime/health hooks
  src/types/       shared types (kept in sync with the SQL schema)
```

## 7. Data model (quick reference)
| table | purpose |
|---|---|
| `roseway.users` | staff mirror of `auth.users` + `role`, `title`, `phone` |
| `roseway.properties` | name/address, unit count, on-site manager |
| `roseway.residents` | name, contact, property/unit, `status`, experience score, assigned case manager |
| `roseway.cases` | resident issue/request; `stage`, `priority`, `assigned_to`, `next_follow_up_at`, aging |
| `roseway.activities` | auto + manual timeline (calls, visits, notes, stage changes, outreach) |
| `roseway.notifications` | in-app reminders (follow-up, case/lead/task assigned) |
| `roseway.leads` | prospective partner communities; own `stage`, `temperature`, `estimated_arr`, `experience_score` |
| `roseway.campaigns` | outreach programs + sent/reply/meeting counters |
| `roseway.outreach` | logged touches (email/call/linkedin/meeting) per lead |
| `roseway.tasks` | to-dos with `due_at`, `priority`, `assigned_to`, links to lead/case/resident |
| `roseway.experience_assessments` | diagnostic: `overall_score`, 6 pillars, responses, recommended scope |

Full column list, triggers, and RLS matrix are in [ARCHITECTURE.md](./ARCHITECTURE.md).

## 8. Deploy

### Frontend → Netlify
[`frontend/netlify.toml`](./frontend/netlify.toml) is preconfigured (`base =
"frontend"`, build `npm run build`, publish `dist`, SPA redirect).

```bash
# via Git: connect the repo in Netlify — it picks up netlify.toml
# or via CLI:
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

Set the env vars in **Netlify → Site settings → Environment variables**:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### Database → Supabase
Already hosted. To apply future changes, add a new numbered migration under
`supabase/migrations/` and run it (SQL editor or `supabase db push`). Migrations
are append-only.

### User management → `manage-users` Edge Function
In-app user creation / deletion / role changes need privileged auth calls, which
**cannot** run in the browser. They run in a Supabase Edge Function that holds
the service-role key server-side and only acts for a verified `super_admin`.

```bash
supabase link --project-ref <ref>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your service_role key>
supabase functions deploy manage-users
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform. Source:
[`supabase/functions/manage-users/index.ts`](./supabase/functions/manage-users/index.ts).
Until it's deployed the *Access & governance* screen still shows the roster and
audit log, but create/delete/role actions return a clear "not deployed" message.

## 9. Roles & permissions
| role | baseline |
|---|---|
| `super_admin` | everything, **plus** create/delete/disable users, grant Admin+, and edit the permission matrix. Bootstrap one via the dashboard (step 3); after that manage from the app. |
| `admin` | full read/write/delete on all records; sees *Access & governance* read-only |
| `case_manager` | read everything; create/update records; CSV import/export; no delete |
| `read_only` | read everything; every mutating control is hidden |

A `super_admin` tunes each non-super role from **Settings → Access & governance →
Role permissions**: per-role toggles for create/edit, delete, CSV import, CSV
export, manage-staff, and which nav sections are visible. Writes, deletes and
imports are **also enforced by RLS** (`can_write()` / `can_delete()` consult the
matrix), so downgrading a role takes effect immediately, not just in the UI.
Every user-management action is written to `roseway.audit_log` (visible to
`admin`+).

Roles resolve from the Auth JWT (`app_metadata.role`); the Edge Function keeps
`app_metadata` and `roseway.users.role` in sync on every change.

## 10. Not built yet
Calendar integration, server-side (`pg_cron`) reminder push, and a resident
self-service portal are **intentionally deferred**. The schema and UI carry
labelled hooks for each — see the end of [ARCHITECTURE.md](./ARCHITECTURE.md)
and [TODO.md](./TODO.md).

## 11. Project docs
- [CLAUDE.md](./CLAUDE.md) — operating instructions & design tokens
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design, schema, RLS
- [PROTOCOL.md](./PROTOCOL.md) — coding standards
- [TODO.md](./TODO.md) — build checklist
- [docs/LEADS_CSV.md](./docs/LEADS_CSV.md) — Leads CSV import/export format
