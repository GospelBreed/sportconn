# ARCHITECTURE.md — Sportconn CRM (fork of Roseway CRM; schema/tables unchanged, see CLAUDE.md)

## 1. System Overview

```
┌────────────────────┐   supabase-js (anon key, user JWT)   ┌───────────────────────┐
│   React SPA        │ ──────────────────────────────────▶  │  Supabase             │
│   (Vite, Netlify)  │ ◀──────────────────────────────────  │  • Postgres (schema   │
│                    │        rows / RPC json / errors      │    `roseway`)         │
│  TanStack Query    │                                      │  • Auth (email+pw)    │
│  + Realtime subs   │ ◀───── Postgres CDC (websocket) ───── │  • RLS policies       │
└────────────────────┘                                      │  • Triggers + 1 RPC   │
                                                            └───────────────────────┘
```

There is **no application server**. The browser holds the Supabase **anon key**
and the signed-in user's **JWT**; every query runs *as that user* and is filtered
by Row Level Security. Server-side behaviour that a backend would normally do
(activity logging, stage timestamps, assignment notifications, analytics
aggregation) is done by **Postgres triggers** and **one `SECURITY DEFINER` RPC**.

### Why Supabase-native
- Fewer moving parts to deploy and secure (one hosted service + a static site).
- RLS is a single, testable authorization surface.
- Realtime is built in — the dashboard and board update live with no polling loop.
- Trade-off: aggregation logic lives in SQL, not Python. Kept to one RPC.

## 2. Auth Flow
1. User submits email + password → `supabase.auth.signInWithPassword`.
2. Supabase returns an `access_token` (JWT, contains `sub`, `email`,
   `app_metadata.role`) + refresh token; `supabase-js` persists and auto-refreshes.
3. `AuthProvider` (`src/lib/auth.tsx`) exposes `session`, `user`, `role`,
   `signIn`, `signOut`. It derives `role` from `app_metadata.role`
   (`admin` | `case_manager` | `read_only`, default `case_manager`).
4. `onAuthStateChange` keeps context in sync across tabs.
5. `ProtectedRoute` gates the app shell; unauthenticated → `/login`.
6. A Postgres trigger mirrors every new `auth.users` row into `roseway.users`.

**First user / admin bootstrap**: create the user in the Supabase dashboard, then
set `app_metadata` to `{ "role": "admin" }`. See `README.md`.

## 3. Database Schema

Everything lives in a dedicated **`roseway`** schema (not `public`) so the project
can share a Supabase instance with other apps. All PKs are `uuid`
(`gen_random_uuid()`); all timestamps are `timestamptz default now()`.

`supabase-js` is pinned to the schema with `db: { schema: 'roseway' }`, and the
schema is exposed to PostgREST at the end of the migration.

### 3.1 `roseway.users` — staff (mirror of `auth.users`)
| column | type | notes |
|---|---|---|
| id | uuid PK | = `auth.users.id`, `on delete cascade` |
| email | text | |
| full_name | text | from `user_metadata.full_name` or email local-part |
| role | text | `admin` \| `case_manager` \| `read_only`, default `case_manager` |
| title | text | job title, nullable |
| phone | text | nullable |
| avatar_url | text | nullable |
| is_active | boolean | default `true` — **reserved** for future deactivation flow |
| created_at | timestamptz | |

### 3.2 `roseway.properties`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| address_line1 | text | |
| city | text | |
| state | text | 2-letter, nullable |
| postal_code | text | |
| unit_count | integer | default 0, `check (unit_count >= 0)` |
| property_type | text | `conventional` \| `luxury` \| `senior` \| `affordable` \| `mixed_use`, default `conventional` |
| manager_name | text | on-site contact |
| manager_email | text | |
| manager_phone | text | |
| notes | text | |
| created_at / updated_at | timestamptz | `updated_at` bumped by trigger |

### 3.3 `roseway.residents`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| full_name | text NOT NULL | |
| email | text | |
| phone | text | |
| property_id | uuid FK→properties | `on delete set null` |
| unit_number | text | |
| status | text | `active` \| `pending` \| `at_risk` \| `former`, default `active` |
| experience_score | integer | 0–100, nullable — resident-experience score from the reference UI; `check (experience_score between 0 and 100)` |
| assigned_case_manager | uuid FK→users | `on delete set null` |
| move_in_date | date | nullable |
| notes | text | free-form; timeline notes live in `activities` |
| created_at / updated_at | timestamptz | `updated_at` bumped by trigger |

Soft delete = `status = 'former'`. Hard delete is admin-only (RLS).

### 3.4 `roseway.cases` — the pipeline entity
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| title | text NOT NULL | |
| resident_id | uuid FK→residents | `on delete cascade`, nullable |
| property_id | uuid FK→properties | `on delete set null`, nullable; auto-filled from resident by trigger when null |
| category | text | `maintenance` \| `billing` \| `lease` \| `complaint` \| `community` \| `wellness` \| `other`, default `other` |
| description | text | |
| stage | text | `intake` \| `in_progress` \| `awaiting_resident` \| `resolved` \| `closed`, default `intake` |
| priority | text | `low` \| `medium` \| `high` \| `urgent`, default `medium` |
| assigned_to | uuid FK→users | `on delete set null` |
| stage_entered_at | timestamptz | default `now()`; **reset by trigger** on stage change → drives days-in-stage aging |
| next_follow_up_at | timestamptz | nullable — the follow-up timing engine reads this |
| calendar_event_id | text | nullable — **reserved** for calendar integration |
| opened_at | timestamptz | default `now()` |
| resolved_at | timestamptz | set by trigger when stage → `resolved`/`closed`; cleared if reopened |
| closed_at | timestamptz | set by trigger when stage → `closed` |
| created_by | uuid FK→users | `on delete set null` |
| created_at / updated_at | timestamptz | `updated_at` bumped by trigger |

`check (resident_id is not null or property_id is not null)` — a case is about a
resident, a property, or both.

### 3.5 `roseway.activities` — auto + manual timeline
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| resident_id | uuid FK→residents | `on delete cascade`, nullable |
| case_id | uuid FK→cases | `on delete cascade`, nullable |
| property_id | uuid FK→properties | `on delete set null`, nullable |
| type | text | `call` \| `visit` \| `note` \| `stage_change` \| `case_opened` \| `case_closed` \| `follow_up_set` \| `resident_created` \| `system` |
| description | text | |
| created_by | uuid FK→users | `on delete set null` |
| created_at | timestamptz | |

Manual entries (`call`, `visit`, `note`) are inserted by the client. Structural
entries (`stage_change`, `case_opened`, `case_closed`, `resident_created`,
`follow_up_set`) are inserted by triggers so the log is authoritative.

### 3.6 `roseway.notifications` — in-app reminders
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | `on delete cascade` — recipient |
| case_id | uuid FK→cases | `on delete cascade`, nullable |
| resident_id | uuid FK→residents | `on delete cascade`, nullable |
| type | text | `follow_up_due` \| `follow_up_overdue` \| `case_assigned` \| `stage_change`, default `follow_up_due` |
| title | text NOT NULL | |
| body | text | |
| read_at | timestamptz | nullable |
| created_at | timestamptz | |

Populated today by: (a) the `case_assigned` trigger when `assigned_to` changes,
(b) a client-side sweep that materializes an overdue/ due-today follow-up into a
row once, deduped on `(user_id, case_id, type, date)`. Future: `pg_cron` + Edge
Function does the sweep server-side. The bell in the top bar reads
`notifications where user_id = auth.uid()` live.

### 3.7 Indexes
`residents(status)`, `residents(property_id)`, `residents(assigned_case_manager)`,
`cases(stage)`, `cases(priority)`, `cases(assigned_to)`, `cases(resident_id)`,
`cases(property_id)`, `cases(next_follow_up_at)`,
`activities(case_id, created_at desc)`, `activities(resident_id, created_at desc)`,
`activities(created_at desc)`, `notifications(user_id, read_at, created_at desc)`.

### 3.8 Triggers (all in `roseway`, `security definer`, `search_path = roseway, public`)
| trigger | table / timing | effect |
|---|---|---|
| `touch_updated_at` | BEFORE UPDATE on properties, residents, cases | `new.updated_at = now()` |
| `handle_new_user` | AFTER INSERT on `auth.users` | upsert into `roseway.users` (id, email, full_name, role from `raw_app_meta_data`) |
| `cases_before_write` | BEFORE INSERT/UPDATE on cases | fill `property_id` from resident if null; on stage change → set `stage_entered_at = now()`, set/clear `resolved_at` (`resolved`/`closed`) and `closed_at` (`closed`) |
| `cases_after_insert` | AFTER INSERT on cases | activity `case_opened`; if `next_follow_up_at` set → activity `follow_up_set` |
| `cases_after_update` | AFTER UPDATE on cases | on stage change → activity `stage_change` (+ `case_closed` when →`closed`); on `assigned_to` change → `notifications` row `case_assigned` for the new assignee (unless assignee = actor); on `next_follow_up_at` change → activity `follow_up_set` |
| `residents_after_insert` | AFTER INSERT on residents | activity `resident_created` |

`created_by` / actor is `auth.uid()` (nullable-safe).

### 3.9 RPC — `roseway.get_analytics_summary()` (`SECURITY DEFINER`, returns `jsonb`)
Single round-trip for the dashboard. Returns:
- `open_cases` — count where stage ∉ {`resolved`,`closed`}
- `cases_by_stage` — `[{stage, count}]` in canonical order
- `avg_resolution_days` — avg(`resolved_at` − `opened_at`) over cases resolved in the last 90 days
- `at_risk_residents` — count where `status = 'at_risk'`
- `overdue_followups` — count of open cases with `next_follow_up_at < now()`
- `due_today_followups` — same, `next_follow_up_at::date = current_date`
- `resolved_this_week` / `resolved_last_week` — for the trend delta
- `cases_opened_per_week` — last 8 ISO weeks `[{week_start, count}]`
- `resolution_funnel` — cumulative counts intake→…→closed for the funnel chart
- `priority_breakdown` — `[{priority, count}]` over open cases
- `caseload_by_manager` — `[{user_id, full_name, open_cases}]` top 6

### 3.10 Realtime
The migration adds `roseway.cases`, `roseway.residents`, `roseway.activities`,
`roseway.notifications` (0001) and `roseway.leads`, `roseway.tasks`,
`roseway.outreach` (0002) to the `supabase_realtime` publication. The client
subscribes per screen and calls `queryClient.invalidateQueries` on the affected
keys (debounced). Analytics/Dashboard also keep a 60 s `refetchInterval` fallback.

### 3.11 Dealflow layer — migration `0002_dealflow.sql`

The resident-services core (0001) is joined by a sales / engagement surface
modelled on the reference screenshots. Same conventions (`roseway` schema, uuid
PKs, `timestamptz` defaults, CHECK-enums, RLS on every table).

#### `roseway.leads` — prospective property-management partners
`full_name` · `title` · `email` · `phone` · `linkedin_url` · `company_name` ·
`property_name` · `property_id`→properties · `location_city/state` · `unit_count`
· `asset_type` (conventional|luxury|senior|affordable|mixed_use) · `temperature`
(hot|warm|cold) · `experience_score` 0–100 · **`stage`** (new_lead → contacted →
qualified → discovery → proposal → pilot → closed_won|closed_lost) · `source`
(res_exp_check|cold_email|linkedin|referral|website|import|other) · `assigned_to`
· `estimated_arr` · `stage_entered_at` (aging) · `next_follow_up_at` ·
`last_activity_at` · `converted_property_id` · `notes` · `created_by`.

#### `roseway.campaigns` — outreach programs
`name` · `channel` (email|linkedin|event|multi) · `status`
(draft|active|paused|completed) · `goal` · `target_segment` · `start_date` /
`end_date` · `sent_count` / `reply_count` / `meeting_count` (bumped by the
outreach trigger) · `notes`.

#### `roseway.outreach` — logged touches
`lead_id`→leads (cascade) · `campaign_id`→campaigns (set null) · `channel`
(email|call|linkedin|meeting|sms|other) · `direction` (outbound|inbound) ·
`subject` · `body` · `outcome`
(sent|opened|replied|no_response|bounced|completed|scheduled) · `occurred_at`.

#### `roseway.tasks` — first-class to-dos
`title` · `description` · `status` (open|done) · `priority`
(low|medium|high|urgent) · `due_at` · `assigned_to` · `lead_id` / `resident_id` /
`case_id` (cascade) / `property_id` (set null) · `completed_at` · `created_by`.

#### `roseway.experience_assessments` — the resident-experience diagnostic
`lead_id` / `resident_id` / `property_id` (≥1 required) · `overall_score` 0–100 ·
`synthesis` · six `pillar_*` scores (engagement, programming, belonging, wellness,
resources, strategy) · `responses` jsonb `[{q,a}]` · `recommended_scope` text[] ·
`submitted_at`.

#### 0002 also
- extends `activities` with `lead_id` + event types
  (`lead_created`, `lead_stage_change`, `outreach`, `task_done`)
- extends `notifications` types (`lead_assigned`, `task_assigned`, `task_due`)
- triggers: `leads_before_write` (stamp `stage_entered_at`/`last_activity_at`),
  `leads_after_insert`/`leads_after_update` (activity log + assignment
  notification), `outreach_after_insert` (bump `last_activity_at`, timeline
  entry, campaign counters), `tasks_before_write` (`completed_at`),
  `tasks_after_write` (assignment notification)
- indexes on `leads(stage|temperature|assigned_to|next_follow_up_at|property_id)`,
  `outreach(lead_id|campaign_id|occurred_at)`, `tasks(status|due_at|assigned_to|lead_id)`,
  `experience_assessments(lead_id|property_id|overall_score)`, `activities(lead_id)`
- RLS: SELECT all authenticated; INSERT/UPDATE/DELETE `can_write()`
- RPC **`roseway.get_dashboard_summary()`** → jsonb for the Dashboard: open leads,
  newly-qualified, hot leads, assessments, consultations, pipeline/won ARR, open
  cases, at-risk residents, task counts, overdue lead follow-ups, `lead_flow`
  `[{stage,label,count,arr}]`, `temperature` {hot,warm,cold}, `experience_ranges`,
  `demand_heatmap` `[{pillar,gap}]` (largest pillar gaps), `median_experience`.

### 3.12 Admin governance — migration `0003_admin_governance.sql`

- **`super_admin`** added to the role CHECK; `is_admin()` now returns true for it,
  so it inherits every admin-gated policy. `is_super_admin()` gates the rest.
- **`roseway.role_permissions`** — one editable row per role:
  `can_manage_users`, `can_edit_permissions`, `can_manage_staff`, `can_write`,
  `can_delete`, `can_export`, `can_import`, and `nav` jsonb `{ "<section>": bool }`.
  Seeded to match pre-0003 behaviour. RLS: readable by all authenticated,
  writable only by `is_super_admin()`. A `guard_role_permissions` trigger blocks
  deleting the `super_admin` row or clearing its `can_manage_users` /
  `can_edit_permissions`.
- **`roseway.audit_log`** — `actor_id/email`, `action`, `target_user_id/email`,
  `detail` jsonb. Written only by the Edge Function (service role); readable by
  `is_admin()`.
- **`users_guard_role`** trigger tightened: any role change needs `is_admin()`;
  granting/revoking `admin` or `super_admin` needs `is_super_admin()`.

### 3.13 `manage-users` Edge Function (`supabase/functions/manage-users/`)

The only place privileged auth operations run — the service-role key lives in the
function's env, never the browser. Flow: read the caller's bearer JWT →
`auth.getUser()` → require `app_metadata.role === 'super_admin'` → act with a
service-role client. Actions:

| action | effect |
|---|---|
| `create` | `auth.admin.createUser` (email + temp password, `email_confirm`), sets `app_metadata.role` + `user_metadata.full_name`; reconciles `roseway.users` |
| `set_role` | `auth.admin.updateUserById` `app_metadata.role` + `roseway.users.role`; blocks self-demote and demoting the last `super_admin` |
| `set_active` | `ban_duration` `none` / `876000h` + `roseway.users.is_active`; blocks self |
| `delete` | `auth.admin.deleteUser` (cascades `roseway.users`); blocks self and the last `super_admin` |

Every action appends to `audit_log`. The frontend calls it via
`supabase.functions.invoke('manage-users', { body })` from
`db.manageUsers()`; a missing deployment surfaces a "not deployed" message
rather than a raw error.

## 4. Row Level Security

RLS is **enabled on every table**. Single-organization model: any authenticated
user may **read** all rows; **writes** are gated by role.

Role hierarchy: **`super_admin` > `admin` > `case_manager` > `read_only`**.

Helper functions (`stable`):
```
roseway.jwt_role()       -> text     -- coalesce(app_metadata.role, 'case_manager')
roseway.is_super_admin() -> boolean  -- jwt_role() = 'super_admin'
roseway.is_admin()       -> boolean  -- jwt_role() in ('admin','super_admin')
roseway.can_write()      -> boolean  -- true for admin+, else role_permissions.can_write
roseway.can_delete()     -> boolean  -- true for super_admin, else role_permissions.can_delete
```
`can_write()` / `can_delete()` consult `roseway.role_permissions` for the
non-privileged roles, so tightening a role in the matrix takes effect in RLS
immediately (0003).

| table | SELECT | INSERT / UPDATE | DELETE |
|---|---|---|---|
| `users` | authenticated: all | self (safe columns) via `id = auth.uid()`; admin: all | admin only |
| `properties` | authenticated: all | `can_write()` | `is_admin()` |
| `residents` | authenticated: all | `can_write()` (`WITH CHECK` same) | `is_admin()` (case managers soft-delete via `status`) |
| `cases` | authenticated: all | `can_write()` | `can_write()` |
| `activities` | authenticated: all | `can_write()` **and** `created_by = auth.uid()` (or null) | `is_admin()` |
| `notifications` | `user_id = auth.uid()` | INSERT `user_id = auth.uid()`; UPDATE own (mark read). Trigger inserts run as definer | own or `is_admin()` |
| `leads` · `campaigns` · `outreach` · `tasks` · `experience_assessments` | authenticated: all | `can_write()` | `can_delete()` (0003) |
| `role_permissions` | authenticated: all | `is_super_admin()` (+ guard trigger keeps super_admin's row omnipotent) | `is_super_admin()` |
| `audit_log` | `is_admin()` | — (Edge Function writes via service role) | — |

DELETE on `properties` / `residents` / `cases` was re-pointed to `can_delete()` by
0003 (previously `is_admin()` / `can_write()`).

`read_only` users satisfy `SELECT` policies only — the UI additionally hides every
mutating control via `useRole()`, so they never hit an RLS denial in normal use.

Grants: `usage` on schema `roseway` to `anon, authenticated, service_role`;
table/‑routine/‑sequence privileges to `authenticated` and `service_role`
(no table DML granted to `anon`).

## 5. Frontend Data Flow
- **TanStack Query v5** owns all server state. Typed fetchers live in
  `src/lib/db.ts` (thin wrappers over `supabase.from(...)` that throw on
  `error`); hooks in `src/hooks/` wrap them and own the query keys.
- **Pipeline drag** = optimistic `setQueryData(['cases'], …)` → `updateCaseStage`
  → invalidate `['cases']` + `['analytics-summary']`; rollback + toast on error.
- **Realtime**: `useRealtime(table, keys[])` mounts a channel and invalidates on
  `INSERT|UPDATE|DELETE`. Mounted in `AppShell` for `cases`/`activities`/
  `notifications`; on `AnalyticsPage` for `residents` too.
- **Follow-up engine**: `useFollowups()` selects open cases with
  `next_follow_up_at not null`, buckets them client-side into
  `overdue | today | upcoming`, feeds the sidebar badge, the board flags, the
  `/followups` page, and the notification sweep.
- UI/local state (slide-overs, modals, command palette, bell) is component state.

## 6. Frontend Composition
- `main.tsx` → `QueryClientProvider` → `AuthProvider` → `ToastProvider` →
  `BrowserRouter` → `App`.
- `App` routes: `/login` (public) and a `ProtectedRoute` → `AppShell`
  (sidebar + top bar + `<Outlet/>`) wrapping:
  `/dashboard` · `/leads` · `/pipeline` (lead deal kanban) · `/cases` (resident
  case kanban) · `/residents` · `/properties` · `/properties/:id` · `/experience`
  · `/outreach` · `/tasks` · `/analytics` (Reports & Analytics) · `/campaigns` ·
  `/settings`. `/followups` → redirect `/tasks`. Unknown → `/dashboard`.
- Global at shell level: `<CommandPalette>` (Cmd/Ctrl-K), `<HealthIndicator>`,
  `<NotificationBell>`, realtime subscriptions, `useFollowupSweep`.
- Default landing route: `/dashboard`.

## 7. Health / Connection Indicator
`useHealth()` runs a cheap `select count` (`head: true`) against
`roseway.properties` every 30 s plus watches `supabase.realtime` connection
state. States: **online** (dot, silent) · **reconnecting** · **offline** (banner
with Retry). No `/health` endpoint exists — this is the Supabase-native
equivalent.

## 8. Deployment
- **Frontend → Netlify**: `netlify.toml` sets `base = "frontend"`,
  `command = "npm run build"`, `publish = "dist"`, SPA redirect `/* → /index.html`.
  Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Database → Supabase**: run `supabase/migrations/0001_init.sql` (SQL editor or
  `supabase db push`). Optionally run `supabase/seed.sql` for demo data.
- No backend service to deploy.

## 9. Deliberately deferred (schema/UI hooks noted, not implemented)
| Area | Hook already in place |
|---|---|
| Calendar sync | `cases.calendar_event_id`, `cases.next_follow_up_at`; "Sync to calendar" slot in follow-up UI |
| Server-side reminder push | `roseway.notifications` table + dedupe shape; swap the client sweep for `pg_cron` + Edge Function |
| Resident self-service portal | separate anon-scoped RLS policies would be additive; not started |

**Now built** (was deferred): admin governance — `super_admin`, `role_permissions`
matrix, `audit_log`, and the `manage-users` Edge Function (§3.12–3.13).
