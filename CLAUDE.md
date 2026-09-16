# CLAUDE.md — Sportconn CRM Operating Instructions

Sportconn CRM is a production-grade sports-operations CRM for **Sportconn**,
forked from the Roseway CRM codebase with only the UI-facing labels rebranded
("Residents" → "Members", "Properties" → "Facilities", etc. — see
`frontend/src/lib/branding.ts` and `frontend/src/lib/constants.ts`).
The underlying Postgres schema, tables, and columns are unchanged from the
original and still use their Roseway-era names (schema `roseway`, tables
`residents`/`properties`/`cases`/...) — code and docs below still refer to
those real identifiers even though the UI now says "members"/"facilities".
It manages **residents**, **properties**, **cases** (member issues/requests moving
through a pipeline), staff follow-up timing, and a live analytics dashboard.

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS. **Light theme.**
- **Data / Auth / API**: Supabase — Postgres, Supabase Auth, Row Level Security.
  The SPA talks **directly** to Supabase via `@supabase/supabase-js`. There is
  **no separate backend service** (no FastAPI). RLS is the real authorization
  boundary; Postgres triggers and one RPC do the server-side work.
- **Deploy**: Netlify (frontend static build). Supabase is the hosted backend.

## Golden Rules
1. **Supabase-native.** All data access is `supabase.from('<table>')…` or
   `supabase.rpc(...)` through the typed helpers in `src/lib/db.ts`. Never add an
   HTTP client or a custom API server unless explicitly asked.
2. **RLS is load-bearing.** Every table has RLS enabled with explicit policies.
   The anon key is the only key shipped to the browser. Never ship the service
   role key. UI-level role guards **mirror** RLS — they are not a substitute.
3. **Light theme only.** Use the design tokens below via Tailwind classes
   (`bg-surface`, `text-muted`, `border-line`, `text-primary`). No raw hex in JSX.
   Match the reference screenshots: dense KPI card rows, status badges, data
   tables, crimson primary.
4. **Drag & drop is `@dnd-kit` only.** `react-beautiful-dnd` is banned.
5. **Every fetch boundary renders four states:** skeleton → empty → error → data.
   No blank screens, no unhandled rejections on an empty database.
6. **Server state = TanStack Query v5.** Never `useEffect`+fetch for server data.
   Mutations either `invalidateQueries` or do an optimistic `setQueryData` with
   rollback in `onError`. Query keys are arrays, centralized per feature hook file.
7. **Realtime, not polling.** Analytics, the pipeline, follow-up flags, and
   notifications subscribe to Supabase Postgres changes and invalidate the
   relevant query keys. A slow fallback `refetchInterval` is allowed as a safety net.
8. **Validate before you call.** Forms validate client-side first; the database
   enforces again via `CHECK` constraints, `NOT NULL`, and RLS `WITH CHECK`.
9. **Confirm destructive actions** with a red-button `<ConfirmDialog>`. Deleting a
   resident is a **soft delete** (`status → 'former'`) unless an admin hard-deletes.
10. **Toasts, never `alert()`/`console.error`** for user-facing messages.

## Roles
`super_admin` · `admin` · `case_manager` · `read_only` — stored in
`auth.users.app_metadata.role`, mirrored into `roseway.users.role`. Enforced by
RLS and by `useRole()` UI guards, which also read the `roseway.role_permissions`
matrix (migration 0003).

- **super_admin** — everything, plus create/delete/disable users, grant Admin+,
  and edit the permission matrix (Settings → Access & governance). Privileged
  auth ops go through the `manage-users` Edge Function, never the browser.
- **admin** — full read/write/delete on records; read-only view of governance.
- **case_manager** — read all; create/update; CSV import/export; no delete (matrix default).
- **read_only** — read everything, write nothing (all mutating UI hidden).

`can_write()` / `can_delete()` in Postgres consult the matrix, so a `super_admin`
tightening a role takes effect in RLS immediately — not just the UI.

## Design Tokens (single source of truth — `frontend/tailwind.config.js`)
| Token | Value | Use |
|---|---|---|
| `bg` | `#F6F6F9` | app background |
| `surface` | `#FFFFFF` | cards, panels, table |
| `surface-2` | `#FBFBFD` | subtle fills, table header |
| `line` | `#E9E9EF` | borders, dividers |
| `primary` | `#E11D48` | brand crimson — **branding slot**, see `src/lib/branding.ts` |
| `primary-dark` | `#BE123C` | hover / active |
| `primary-tint` | `#FFF1F3` | primary background wash |
| `ink` | `#17171F` | headings / strong text |
| `body` | `#3F3F49` | body text |
| `muted` | `#6B7280` | secondary text |
| `success` | `#15803D` | resolved, active resident, on-track |
| `warning` | `#B45309` | aging, pending, due-soon |
| `danger` | `#DC2626` | urgent, at-risk, overdue |
| `info` | `#1D4ED8` | informational badges |
| radius `card` | `14px` | |
| radius `control` | `9px` | inputs, badges, buttons |
| font | Inter | |

Priority colors: `urgent`→danger solid · `high`→warning · `medium`→info · `low`→muted.
Resident status: `active`→success · `pending`→warning · `at_risk`→danger · `former`→muted.
Case aging: `<3d`→muted · `3–6d`→warning · `≥7d`→danger.
Follow-up: `overdue`→danger · `due today`→warning · `≤3 days`→info · else none.

## Repo Layout
```
supabase/
  migrations/0001_init.sql   schema, enums (CHECK), FKs, indexes, triggers, RLS,
                             analytics RPC, realtime publication
  seed.sql                   demo org data (optional, idempotent)
frontend/
  src/
    lib/        supabase client, db helpers, auth context, query client,
                branding, format, constants
    components/ ui primitives + layout shell (sidebar, topbar, command palette,
                health indicator, toasts)
    features/   one folder per domain: pipeline, residents, properties,
                analytics, followups, settings
    pages/      route-level screens
    hooks/      TanStack Query hooks + realtime subscription hooks
    types/      shared TS types (kept in sync with the SQL schema by hand)
```

## Build / Run
- `cd frontend && npm install && npm run dev` → http://localhost:5173
- Typecheck + build: `cd frontend && npm run build` (tsc -b + vite build)
- Database: paste `supabase/migrations/0001_init.sql` into the Supabase SQL editor
  (or `supabase db push` with the CLI). See `README.md`.

## Conventions
- TanStack Query v5 object signature. Keys: `['cases']`, `['case', id]`,
  `['residents', filters]`, `['analytics-summary']`, `['followups']`, `['notifications']`.
- Dates via `formatRelative` / `formatDate` / `daysInStage` in `lib/format.ts`.
- Toasts via `useToast()`. Confirm via `<ConfirmDialog>`.
- See `PROTOCOL.md` for the full coding standard and `ARCHITECTURE.md` for the
  schema, data flow, and RLS model.

## Not built yet (hooks left in place — do not implement unless asked)
- **Calendar integration** — `cases.next_follow_up_at` + `cases.calendar_event_id`
  (nullable, reserved) are the sync points; a "Sync to calendar" affordance slot
  is marked in the follow-up UI.
- **Granular security / role settings** — `roseway.users.is_active` and a
  reserved `roseway.role_permissions` concept; Settings has a disabled
  "Advanced permissions" section placeholder.
- **Scheduled reminder push** — true lapse-time notifications need `pg_cron` +
  a Supabase Edge Function writing `roseway.notifications`. Today the app derives
  overdue/due follow-ups from a live query while it is open.
