# CLAUDE.md — SportConn CRM Operating Instructions

SportConn CRM is a production-grade internal business-development / growth
CRM for **SportConn** (sportconn.com) — a sports ecosystem connecting
athletes, facilities, coaches, academies, captains, sponsors, and investors.
This CRM is the internal sales/partnership/growth system, **not** the
consumer-facing SportConn app.

It manages **leads/opportunities** across multiple pipelines (Sponsor,
Investor, Strategic Partnership, User Acquisition), **facilities** and
**captains** as their own long-lived directory entities, staff follow-up
timing, tasks, campaigns, and a live management dashboard/reports.

This codebase started as a rebrand of a property-management CRM (Roseway)
and was then repurposed with a redesigned Postgres schema and data model —
it is not just relabeled. Reusable infrastructure that carried over: the
Supabase Auth + RLS pattern, the React Query hook architecture, the
`@dnd-kit` Kanban, CSV import/export, the role-permission governance system,
and all UI primitives.

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS. **Light theme.**
- **Data / Auth / API**: Supabase — Postgres, Supabase Auth, Row Level Security.
  The SPA talks **directly** to Supabase via `@supabase/supabase-js`. There is
  **no separate backend service**. RLS is the real authorization boundary;
  Postgres triggers and two RPCs do the server-side work.
- **Deploy**: Netlify (frontend static build). Supabase is the hosted backend.

## Golden Rules
1. **Supabase-native.** All data access is `supabase.from('<table>')…` or
   `supabase.rpc(...)` through the typed helpers in `src/lib/db.ts`. Never add an
   HTTP client or a custom API server unless explicitly asked.
2. **RLS is load-bearing.** Every table has RLS enabled with explicit policies.
   The anon key is the only key shipped to the browser. Never ship the service
   role key. UI-level role guards **mirror** RLS — they are not a substitute.
3. **One CRM, multiple pipelines — never duplicate the Lead entity.** Sponsor,
   Investor, Strategic Partnership, and User Acquisition opportunities all
   live in `sportconn.leads`, distinguished by a `pipeline` column. Facilities
   and Captains get their own tables only because they're long-lived directory
   entities (a facility/captain persists across many interactions), not
   because each pipeline needs a separate schema. Adding a new pipeline type
   should mean a new row in `sportconn.pipelines` + stages, not a new table.
4. **Pipeline stages are configurable data, not hardcoded enums.** Stages live
   in `sportconn.pipeline_stages` (editable via Settings → Pipelines &
   stages), not in TypeScript unions or Postgres CHECK constraints. UI code
   fetches stages via `usePipelineStages(pipeline)` and looks up labels
   dynamically — never hardcode a stage list in a component.
5. **Light theme only.** Use the design tokens below via Tailwind classes
   (`bg-surface`, `text-muted`, `border-line`, `text-primary`). No raw hex in JSX.
6. **Drag & drop is `@dnd-kit` only.** `react-beautiful-dnd` is banned.
7. **Every fetch boundary renders four states:** skeleton → empty → error → data.
   No blank screens, no unhandled rejections on an empty database.
8. **Server state = TanStack Query v5.** Never `useEffect`+fetch for server data.
   Mutations either `invalidateQueries` or do an optimistic `setQueryData` with
   rollback in `onError`. Query keys are arrays, centralized per feature hook file.
9. **Realtime, not polling.** The dashboard, the pipeline board, follow-up
   flags, and notifications subscribe to Supabase Postgres changes and
   invalidate the relevant query keys. A slow fallback `refetchInterval` is
   allowed as a safety net.
10. **Validate before you call.** Forms validate client-side first; the
    database enforces again via `CHECK` constraints, `NOT NULL`, and RLS
    `WITH CHECK`. Marking a stage Lost **requires** a `lost_reason` — enforced
    in the `leads_before_write()` / `facilities_before_write()` triggers, not
    just the UI.
11. **Confirm destructive actions** with a red-button `<ConfirmDialog>`.
12. **Toasts, never `alert()`/`console.error`** for user-facing messages.
13. **No fabricated business data.** Dashboard/report metrics are always
    computed live from stored records (`get_dashboard_summary()`,
    `get_pipeline_metrics()`, or client-side aggregation over fetched lists).
    Never hardcode a KPI value. Seed data is clearly fictional (see
    `supabase/seed.sql` header) and must stay that way.

## Roles
`super_admin` · `admin` · `management` · `business_development` · `sales` ·
`partnerships` · `investor_relations` · `marketing` · `community_manager` ·
`viewer` — stored in `auth.users.app_metadata.role`, mirrored into
`sportconn.users.role`. Enforced by RLS and by `useRole()` UI guards, which
also read the `sportconn.role_permissions` matrix (migration 0003).

- **super_admin** — everything, plus create/delete/disable users, grant Admin+,
  and edit the permission matrix (Settings → Access & governance). Privileged
  auth ops go through the `manage-users` Edge Function, never the browser.
- **admin** — full read/write/delete on records; read-only view of governance.
- **department roles** (management/business_development/sales/partnerships/
  investor_relations/marketing/community_manager) — read all; create/update;
  CSV import/export; no delete (matrix default). New department roles can be
  added by inserting a row into `role_permissions` — no code change needed;
  `can_write()`/`can_delete()` consult the matrix generically for any
  non-super_admin role.
- **viewer** — read everything, write nothing (all mutating UI hidden).

`can_write()` / `can_delete()` in Postgres consult the matrix, so a `super_admin`
tightening a role takes effect in RLS immediately — not just the UI.

## Design Tokens (single source of truth — `frontend/tailwind.config.js`)
| Token | Value | Use |
|---|---|---|
| `bg` | `#F6F6F9` | app background |
| `surface` | `#FFFFFF` | cards, panels, table |
| `surface-2` | `#FBFBFD` | subtle fills, table header |
| `line` | `#E9E9EF` | borders, dividers |
| `primary` | `#2563EB` | brand blue — **branding slot**, see `src/lib/branding.ts` |
| `ink` | `#17171F` | headings / strong text |
| `body` | `#3F3F49` | body text |
| `muted` | `#6B7280` | secondary text |
| `success` | `#15803D` | won, active, on-track |
| `warning` | `#B45309` | aging, pending, due-soon |
| `danger` | `#DC2626` | urgent, at-risk, overdue, lost |
| `info` | `#1D4ED8` | informational badges |
| radius `card` | `14px` | |
| radius `control` | `9px` | inputs, badges, buttons |
| font | Inter | |

Priority: `high`→danger · `medium`→warning · `low`→muted.
Temperature: `hot`→danger · `warm`→warning · `cold`→info · `at_risk`→muted.
Opportunity status: `open`→info · `won`→success · `lost`→danger · `nurture`→muted.
Stage aging: `<7d`→muted · `7–13d`→warning · `≥14d`→danger (also flags "At Risk").
Follow-up: `overdue`→danger · `due today`→warning · `≤3 days`→info · else none.

## Repo Layout
```
supabase/
  migrations/0001_init.sql   schema, core tables (users, facilities, captains,
                             activities, notifications), triggers, RLS, realtime
  migrations/0002_dealflow.sql  pipelines/stages, leads, campaigns, outreach,
                             tasks, get_dashboard_summary(), get_pipeline_metrics()
  migrations/0003_admin_governance.sql  role hierarchy, role_permissions, audit_log
  functions/manage-users/    Edge Function — privileged user management
  seed.sql                   fictional demo data (optional, idempotent)
frontend/
  src/
    lib/        supabase client, db helpers, auth context, query client,
                branding, format, constants (enum labels — NOT stage lists)
    components/ ui primitives + layout shell (sidebar, topbar, command palette,
                health indicator, toasts)
    features/   one folder per domain: leads, facilities, captains, pipeline,
                tasks, settings, shared
    pages/      route-level screens (Dashboard, Leads, Pipeline, Sponsors,
                Investors, Partners, UserAcquisition, Facilities, Captains,
                Activities, Tasks, Campaigns, Analytics, Settings)
    hooks/      TanStack Query hooks + realtime subscription hooks
    types/      shared TS types (kept in sync with the SQL schema by hand)
```

## Build / Run
- `cd frontend && npm install && npm run dev` → http://localhost:5173
- Typecheck + build: `cd frontend && npm run build` (tsc -b + vite build)
- Database: paste `supabase/migrations/000{1,2,3}_*.sql` (in order) into the
  Supabase SQL editor, or `supabase db push` with the CLI. See `README.md`.

## Conventions
- TanStack Query v5 object signature. Keys: `['leads', filters]`, `['lead', id]`,
  `['facilities', filters]`, `['facility', id]`, `['captains', filters]`,
  `['captain', id]`, `['pipelines']`, `['pipeline-stages', pipeline]`,
  `['dashboard-summary']`, `['pipeline-metrics', pipeline]`, `['followups']`,
  `['notifications']`.
- Dates via `formatRelative` / `formatDate` / `daysInStage` in `lib/format.ts`.
- Money via `formatMoney` / `formatCompactMoney` in `lib/money.ts` — always
  pass the record's own `currency` field, never assume USD/NGN.
- Toasts via `useToast()`. Confirm via `<ConfirmDialog>`.
- See `PROTOCOL.md` for the full coding standard and `ARCHITECTURE.md` for the
  schema, data flow, and RLS model.

## Not built yet (do not implement unless asked)
- **Document/file uploads** — no Supabase Storage wiring yet.
- **Duplicate detection / merge UI** on lead create or CSV import.
- **Bulk actions** on the Leads table (bulk assign / bulk stage / bulk archive).
- **Calendar integration** and **server-side (`pg_cron`) reminder push** — the
  in-app follow-up sweep (`useFollowupSweep`) covers the same need while the
  app is open.
- **Pre-seeded "potentially supported" pipelines** (Academy/Coach, Tournament
  Organizer, Brand Partnership) — the architecture supports adding these via
  Settings → Pipelines & stages with zero code changes, but they don't ship
  by default; only Sponsor/Investor/Strategic Partnership/User
  Acquisition/Facility/Captain are seeded.
