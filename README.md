# SportConn CRM

An internal business-development, sales, and growth CRM for **SportConn** — a
multi-pipeline dealflow engine covering sponsors, investors, sports facility
partnerships, strategic partnerships, user acquisition, and grassroots
captains/communities, all sharing one lead/contact database. Left-hand
navigation, a dynamic drag-and-drop pipeline board, searchable tables, a
management dashboard, reports, and a global command palette.

Built with **React + Vite + TypeScript + Tailwind** on the front and
**Supabase** (Postgres + Auth + Row Level Security + Realtime) as the entire
backend. There is no separate API server — the SPA talks to Supabase directly
and RLS enforces access.

> **Fork note:** this codebase started as a rebrand of a property-management
> CRM (Roseway) and was then repurposed into a purpose-built SportConn CRM —
> the Postgres schema, tables, and data model were redesigned to match
> SportConn's actual pipelines (see §7 below), not just relabeled. The reusable
> infrastructure that carried over unchanged: Supabase Auth + RLS pattern, the
> React Query hook architecture, the `@dnd-kit` Kanban, CSV import/export, the
> role-permission governance system, and all UI primitives.

## 1. Features
- **Dashboard** — management command centre: total leads, active
  opportunities, total/weighted pipeline value, sponsors/investors/facilities
  in pipeline, users acquired, overdue follow-ups & tasks, a pipeline-by-type
  overview, temperature distribution, a user-acquisition progress bar, a
  follow-up centre (overdue/today/upcoming), and a live activity feed.
- **Leads** — the core Lead/Opportunity record (contact + org info, lead
  type, source, priority, temperature, expected value/probability/weighted
  value, next follow-up) in a searchable, filterable table. **CSV import**
  (drag & drop, header auto-mapping, per-row validation, downloadable
  template) and **CSV export** — format spec in
  [`docs/LEADS_CSV.md`](./docs/LEADS_CSV.md).
- **Pipeline** — one dynamic Kanban board with a pipeline selector (Sponsors /
  Investors / Facilities / Strategic Partnerships / User Acquisition /
  Captains, or an all-pipelines summary). Stages are **configurable** per
  pipeline (Settings → Pipelines & stages), drag-and-drop persists instantly,
  and KPIs (total value, active count, avg deal size, win rate) recompute per
  pipeline.
- **Sponsors / Investors / Partners / User Acquisition** — filtered views of
  the same Leads table, scoped to one pipeline each — one CRM, not five.
  User Acquisition additionally tracks target vs. actual users with a
  progress bar.
- **Facilities** — sports venues (turfs, 5-a-side, sports complexes, etc.)
  tracked as their own long-lived directory entities with a facility-specific
  pipeline (Prospect → Active Partner), pitch count, booking model, and a
  full detail page (info, contact, opportunity, activity, tasks).
- **Captains & Communities** — local football captains/organizers with their
  own onboarding pipeline, player/games-coordinated counters, and next-game
  tracking.
- **Activities** — every call / WhatsApp / email / meeting / site visit /
  demo logged against a lead, facility, or captain, filterable by channel and
  outcome, with reply-rate and meeting stats.
- **Tasks** — to-dos grouped Overdue / Due today / Upcoming / Later, with
  snooze and complete, plus a merged "pipeline follow-ups" section pulling
  from lead and facility `next_follow_up_at`. Assignment fires in-app
  notifications.
- **Campaigns** — sponsor outreach, facility acquisition, user acquisition,
  and captain recruitment programs with target/actual leads and users,
  budget/cost, and reply-rate or user-progress visualizations.
- **Reports & Analytics** — pipeline value/weighted value/win rate/avg deal
  size KPIs, a per-pipeline stage funnel, lead reports (by source, by type),
  team performance (active opportunities per owner), and a "why we lose"
  lost-reasons breakdown. All figures are calculated live from stored
  records — nothing fabricated.
- **Won / Lost tracking** — every pipeline enforces a required lost reason
  (no budget, not interested, competitor, timing, …) when a stage is marked
  Lost; won/lost timestamps and weighted-value math feed the reports above.
- **Command palette** — `Cmd/Ctrl-K` fuzzy search across leads, facilities,
  captains, and tasks, plus quick actions (new lead / facility / captain /
  task).
- **Role-based access & governance** — a role hierarchy (`super_admin` /
  `admin` / department roles — management, business development, sales,
  partnerships, investor relations, marketing, community manager / `viewer`),
  enforced by RLS and mirrored by UI guards. A **Super Admin** creates /
  deletes / disables users, grants Admin, and tunes an editable **permission
  matrix** (per-role create/delete/import/export + visible nav sections) from
  Settings → *Access & governance*; every action is audit-logged. Privileged
  auth ops run in the `manage-users` Edge Function, never the browser.
- **Supporting UX** — toasts, skeleton loaders, empty states, a connection
  health indicator, full mobile responsiveness.

## 2. Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the deep dive. TL;DR: the SPA
authenticates to Supabase Auth, then reads/writes Postgres (schema
`sportconn`) directly with the anon key as the signed-in user. RLS policies
are the authorization boundary; Postgres triggers log activity, derive
won/lost status from each pipeline's configurable stages, and stamp
timestamps; two `SECURITY DEFINER` RPCs return dashboard and per-pipeline
metrics.

```
React SPA (Netlify)  ──supabase-js (anon key + user JWT)──▶  Supabase Postgres `sportconn`
        ▲                                                        │ RLS · triggers · RPC
        └──────────────── Realtime (Postgres CDC) ───────────────┘
```

---

## 3. Prerequisites
- **Node 18+** and npm
- A **Supabase** project (free tier is fine) — <https://supabase.com>
- Optional: the **Supabase CLI** (`npm i -g supabase`) if you prefer
  `supabase db push` over the SQL editor
- Optional: the **Netlify CLI** (`npm i -g netlify-cli`) for deploys

## 4. Database setup
1. Open your Supabase project → **SQL Editor** → **New query**.
2. Run the migrations **in order**:
   1. [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql) —
      `sportconn` schema, core tables (users, facilities, captains,
      activities, notifications), triggers, RLS, realtime publication,
      schema exposure.
   2. [`supabase/migrations/0002_dealflow.sql`](./supabase/migrations/0002_dealflow.sql)
      — `pipelines` / `pipeline_stages` (configurable stage catalogue),
      `leads` (the core Sponsor/Investor/Strategic-Partnership/User-Acquisition
      opportunity record), `campaigns`, `outreach`, `tasks`;
      `get_dashboard_summary()` and `get_pipeline_metrics()`.
   3. [`supabase/migrations/0003_admin_governance.sql`](./supabase/migrations/0003_admin_governance.sql)
      — role hierarchy, `role_permissions` matrix, `audit_log`,
      `is_super_admin()` / `can_delete()`; delete gated by the matrix.
3. *(Optional)* Run [`supabase/seed.sql`](./supabase/seed.sql) for fictional
   demo data (facilities, captains, campaigns, leads across every pipeline,
   outreach, tasks). Re-running is safe for the core rows; it will add
   duplicate outreach/task demo rows.

   > CLI equivalent: `supabase link --project-ref <ref> && supabase db push`

## 5. Create the first user (Super Admin)
1. Supabase → **Authentication → Users → Add user** — enter an email + password
   and tick *Auto Confirm User*.
2. Open that user → **Edit** → set **Raw app metadata** to:
   ```json
   { "role": "super_admin" }
   ```
   The `sportconn.users` row is created automatically by a trigger on
   signup; the `role` there is synced from this value. RLS reads the role
   from the JWT (`app_metadata.role`), so this step is what actually grants
   access.
3. Also run, once, in the SQL editor (matches the directory row to the JWT):
   ```sql
   update sportconn.users set role = 'super_admin' where email = 'you@sportconn.com';
   ```
4. From then on, create every other user (Admin / Business Development /
   Sales / Partnerships / Investor Relations / Marketing / Community Manager
   / Viewer) **in the app** — Settings → *Access & governance* → **Create
   user** — once the Edge Function below is deployed. You never need to
   touch the Supabase dashboard for users again.

## 6. Frontend
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

Sign in with the user from step 5. You land on **/dashboard**.

## 7. Branding
`frontend/src/lib/branding.ts` is the single slot for SportConn's identity:
```ts
export const BRAND = {
  name: "Sportconn CRM",
  primary: "#2563EB",          // drives the --brand CSS variable
  logoUrl: null as string | null, // drop in a URL or /public asset path
};
```
Changing `primary` reskins the app; `logoUrl` (when set) replaces the wordmark
mark in the sidebar and login screen.

## 8. Project structure
```
supabase/
  migrations/0001_init.sql        core schema + RLS + triggers + realtime
  migrations/0002_dealflow.sql    pipelines/stages, leads, campaigns, outreach, tasks, RPCs
  migrations/0003_admin_governance.sql  role hierarchy, role_permissions, audit_log
  functions/manage-users/        Edge Function — privileged user management
  seed.sql                       optional fictional demo data
frontend/
  src/lib/         supabase client, db helpers, auth, query client, branding, format
  src/components/  ui primitives + layout shell (sidebar, top bar, palette, toasts)
  src/features/    leads · facilities · captains · pipeline · tasks · settings
  src/pages/       route screens (Dashboard, Leads, Pipeline, Sponsors, Investors,
                   Partners, User Acquisition, Facilities, Captains, Activities,
                   Tasks, Campaigns, Analytics, Settings)
  src/hooks/       query hooks + realtime/health hooks
  src/types/       shared types (kept in sync with the SQL schema)
```

## 9. Data model (quick reference)
The Lead/Opportunity record is not duplicated per pipeline — one `leads` table
covers four pipelines, differentiated by a `pipeline` column; Facilities and
Captains are their own tables because they're long-lived directory entities,
not disposable deal rows. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the
full column list.

| table | purpose |
|---|---|
| `sportconn.users` | staff mirror of `auth.users` + `role`, `department`, `title`, `phone` |
| `sportconn.pipelines` / `pipeline_stages` | configurable pipeline + stage catalogue (editable in Settings) |
| `sportconn.leads` | core Lead/Opportunity record — Sponsor, Investor, Strategic Partnership, and User Acquisition pipelines |
| `sportconn.facilities` | sports venues pursued as partnerships; own stage, pitch count, booking model |
| `sportconn.captains` | grassroots captains/organizers; own stage, player/games counters |
| `sportconn.campaigns` | growth programs + target/actual leads and users, budget/cost |
| `sportconn.outreach` | logged touches (call/WhatsApp/email/meeting/site visit/demo/…) per lead/facility/captain |
| `sportconn.tasks` | to-dos with `due_at`, `priority`, `assigned_to`, links to lead/facility/captain |
| `sportconn.activities` | auto + manual timeline (stage changes, outreach, won/lost, follow-ups) |
| `sportconn.notifications` | in-app reminders (follow-up, lead/task assigned, won/lost) |
| `sportconn.role_permissions` / `audit_log` | governance matrix + user-management audit trail |

## 10. Deploy

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

## 11. Roles & permissions
| role | baseline |
|---|---|
| `super_admin` | everything, **plus** create/delete/disable users, grant Admin+, and edit the permission matrix. Bootstrap one via the dashboard (§5); after that manage from the app. |
| `admin` | full read/write/delete on all records; sees *Access & governance* read-only |
| `management` / `business_development` / `sales` / `partnerships` / `investor_relations` / `marketing` / `community_manager` | read everything; create/update records; CSV import/export; no delete |
| `viewer` | read everything; every mutating control is hidden |

A `super_admin` tunes each non-super role from **Settings → Access &
governance → Role permissions**: per-role toggles for create/edit, delete,
CSV import, CSV export, manage-staff, and which nav sections are visible.
Writes, deletes and imports are **also enforced by RLS** (`can_write()` /
`can_delete()` consult the matrix), so downgrading a role takes effect
immediately, not just in the UI. Every user-management action is written to
`sportconn.audit_log` (visible to `admin`+).

Pipelines and their stages are similarly configurable — **Settings →
Pipelines & stages** — so new pipeline types (e.g. Academy/Coach, Tournament
Organizer, Brand Partnership) can be added without a code change: add a row
to `pipelines`, add its stages, and it's immediately usable from Leads and
the Pipeline board.

Roles resolve from the Auth JWT (`app_metadata.role`); the Edge Function keeps
`app_metadata` and `sportconn.users.role` in sync on every change.

## 12. Known simplifications / not built yet
- **Document uploads** — no file/attachment storage yet (would need Supabase
  Storage wiring); notes and activity descriptions cover most of the same need.
- **Duplicate detection / merge UI** — not implemented; CSV import validates
  required fields but doesn't cross-check existing records for duplicates yet.
- **Granular per-stage reports for every "potentially supported" pipeline**
  (Academy/Coach, Tournament Organizer, Brand Partnership) — the architecture
  supports adding these pipelines via Settings with no code change, but they
  aren't pre-seeded; only the five pipelines described in §9 ship by default.
- **Calendar integration and server-side (`pg_cron`) reminder push** are
  intentionally deferred — the in-app follow-up sweep covers the same need
  while the app is open.
- **Bulk actions on the Leads table** (bulk assign / bulk stage / bulk
  archive) are not implemented — single-record actions only.

## 13. Project docs
- [CLAUDE.md](./CLAUDE.md) — operating instructions for future changes
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design, schema, RLS
- [PROTOCOL.md](./PROTOCOL.md) — coding standards
- [TODO.md](./TODO.md) — build checklist
- [docs/LEADS_CSV.md](./docs/LEADS_CSV.md) — Leads CSV import/export format
