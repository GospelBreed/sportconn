# TODO.md — Sportconn CRM Build Checklist (fork of Roseway CRM)

Mark items `[x]` as completed. Keep this file honest.

## Phase 0 — Docs
- [x] CLAUDE.md — operating instructions & design tokens
- [x] ARCHITECTURE.md — system design, schema, RLS, data flow
- [x] PROTOCOL.md — coding standards
- [x] TODO.md — this checklist
- [x] README.md — setup & deployment guide
- [x] Schema signed off by product owner (approved as-is)

## Phase 1 — Database (`supabase/migrations/0001_init.sql`)
- [x] `roseway` schema + `pgcrypto`
- [x] Tables: users, properties, residents, cases, activities, notifications
- [x] CHECK enums, FKs (with correct ON DELETE), `resident_id OR property_id` check
- [x] Indexes per ARCHITECTURE 3.7
- [x] `touch_updated_at` trigger on properties/residents/cases
- [x] `handle_new_user` trigger on `auth.users`
- [x] `cases_before_write` (property backfill, stage timestamps)
- [x] `cases_after_insert` / `cases_after_update` (activity log, assignment notification)
- [x] `residents_after_insert` (activity log)
- [x] `users_guard_role` (only admin changes role)
- [x] RLS enabled + policies on all tables; `jwt_role()` / `is_admin()` / `can_write()`
- [x] RPC `roseway.get_analytics_summary()` returning jsonb
- [x] Add tables to `supabase_realtime` publication
- [x] Grants + expose `roseway` schema to PostgREST
- [x] `supabase/seed.sql` — idempotent demo data (5 properties, 20 residents,
      24 cases across stages, activities, overdue/today/upcoming follow-ups)

## Phase 2 — Frontend scaffold
- [x] Vite + React 18 + TS; `package.json` deps
- [x] `tailwind.config.js` light tokens, `postcss.config.js`, `index.css`
- [x] `tsconfig.json` (solution) + `tsconfig.app.json` + `tsconfig.node.json`, `vite.config.ts`, `vite-env.d.ts`
- [x] `index.html` (Inter font, title), `netlify.toml`, `.env.example`, `.gitignore`
- [x] `src/lib/branding.ts` (name, primary color, logo slot) → `--brand` CSS var

## Phase 3 — Core libs
- [x] `lib/supabase.ts` — client pinned to `roseway` schema
- [x] `lib/db.ts` — typed fetchers (cases, residents, properties, activities,
      notifications, users, analytics RPC, health ping)
- [x] `lib/auth.tsx` — AuthProvider, `useAuth`, `useRole`
- [x] `lib/queryClient.ts`, `lib/cn.ts`, `lib/format.ts`, `lib/constants.ts`, `lib/branding.ts`
- [x] `types/index.ts` — unions + row/detail interfaces matching the schema
- [x] `hooks/useDebounced.ts`, `hooks/useRealtime.ts`, `hooks/useHealth.ts`, `hooks/useFollowupSweep.ts`
- [x] Query hooks: cases, residents, properties, analytics, followups,
      notifications, users, activity feed

## Phase 4 — UI primitives & shell
- [x] primitives: Button, Input, Textarea, Select, Field, Badge, Card, Avatar, Kbd, Progress
- [x] states: Skeleton, SkeletonRows, EmptyState, ErrorState
- [x] overlays: Modal, SlideOver, ConfirmDialog, Tabs, Menu/MenuItem
- [x] badges: Priority, Status, Stage, Category, Aging, Followup, ExperienceScore
- [x] InlineEdit
- [x] Toast store + provider
- [x] Icon set (inline SVG)
- [x] AppShell + Sidebar (nav, user card, role badge, follow-up count) + mobile drawer
- [x] Topbar: command trigger, HealthIndicator, NotificationBell
- [x] CommandPalette (Cmd/Ctrl-K): fuzzy search residents/properties/cases + quick actions

## Phase 5 — Case pipeline
- [x] `/pipeline` Kanban: 5 stages, `@dnd-kit`, horizontal scroll
- [x] CaseCard: subject, priority badge, aging badge, follow-up flag, quick-note inline, menu
- [x] Optimistic drag → `updateCaseStage` → invalidate + rollback/toast
- [x] Column counts, add-case per column
- [x] AddCaseModal (resident search, property, category, priority, stage, follow-up, description)
- [x] Resolved/Closed archive toggle
- [x] CaseSlideOver: Overview (edit stage/priority/category/assignee/follow-up/description) + Timeline
- [x] Realtime refresh

## Phase 6 — Resident directory + detail
- [x] `/residents` table: search (300ms), filters (status, property, case manager)
- [x] status badge, experience-score chip, property/unit, open-case count, last activity
- [x] ResidentSlideOver: Overview / Cases / Activity / Notes
- [x] Overview inline-edit + status/manager selects
- [x] Cases tab + "New case for this resident"
- [x] Activity + Notes tabs
- [x] AddResidentModal
- [x] Soft-delete (→ `former`) for case managers; hard delete for admin; confirm

## Phase 7 — Properties
- [x] `/properties` card grid: name, address, unit count, type badge, resident + open-case counts
- [x] `/properties/:id`: editable info + on-site manager, residents list, cases list, mini stats
- [x] AddPropertyModal
- [x] Delete (admin) with unlink messaging

## Phase 8 — Analytics dashboard
- [x] `/analytics` KPI cards: open cases, avg resolution days, at-risk residents, overdue follow-ups
- [x] Case-resolution funnel (recharts)
- [x] Cases-opened-per-week trend (8 wks)
- [x] Priority breakdown + caseload by manager
- [x] Live via `useRealtime` on cases/residents + 60s fallback
- [x] Skeleton / empty / error

## Phase 9 — Follow-up automation & notifications
- [x] `useFollowups` bucketing (overdue / due today / upcoming ≤3d)
- [x] `/followups` grouped view with snooze (+1d/+3d), Done (clear), Open
- [x] Sidebar + board badges from the same source
- [x] NotificationBell dropdown: unread count, mark read, mark all read (realtime)
- [x] Client sweep: materialize overdue/due follow-ups into `notifications` (deduped) + toast
- [x] "Sync to calendar" placeholder button (disabled) — deferred hook

## Phase 10 — Settings
- [x] Profile: display name, title, phone
- [x] Team list with role badges
- [x] Admin: change a member's role + invite (graceful without admin API)
- [x] Disabled "Advanced permissions" card — deferred hook
- [x] Non-admins: read-only view

## Phase 11 — Verify
- [x] `npm install` clean
- [x] `npm run build` — `tsc -b` (0 errors) + `vite build` (980 modules, chunked)
- [ ] Apply `supabase/migrations/0001_init.sql` then `0002_dealflow.sql`, optional `seed.sql`
- [ ] Manual smoke: login → dashboard → leads table → lead slide-over (diagnostic)
      → pipeline drag → cases drag → tasks → outreach log → campaigns → analytics
      → Cmd-K → notifications → role guard as `read_only`
- [ ] README steps reproduce from zero

## Phase 12 — Dealflow pivot (migration 0002 + growth surface)
- [x] `0002_dealflow.sql`: leads, campaigns, outreach, tasks, experience_assessments
- [x] Extend activities (`lead_id` + event types) + notifications types
- [x] Triggers: leads lifecycle + activity log + assignment; outreach → activity
      + campaign counters; tasks completed_at + assignment
- [x] RLS + indexes + realtime + grants for the 5 new tables
- [x] `get_dashboard_summary()` RPC
- [x] Seed: 15 leads (screenshot personas), 4 campaigns, 8 outreach, 6 tasks, 4 assessments
- [x] Types + constants + `db.ts` fetchers + query hooks for the new entities
- [x] Sidebar: 12-item nav (Dashboard, Leads, Pipeline, Case Pipeline, Residents,
      Properties, Resident Experience, Outreach, Tasks, Reports & Analytics,
      Campaigns, Settings) with Tasks-due badge
- [x] Pages: Dashboard, Leads (+ slide-over + add), Lead Pipeline kanban (+ card),
      Tasks (+ add), Outreach (+ log modal), Campaigns (+ add), Resident Experience
- [x] Shared: `ScoreRing`, `LeadSelect`, lead/temperature badges, `money.ts`
- [x] CommandPalette: leads search + new-lead/case/resident/task quick actions
- [x] Route rename: `/pipeline` = lead deals, `/cases` = resident cases,
      `/followups` → redirect `/tasks`, default landing `/dashboard`
- [x] `npm run build` green after the pivot

## Phase 13 — Leads CSV import / export
- [x] `lib/csv.ts` — RFC-4180 parser, `toCsv`, `downloadFile`, header normalizer
- [x] `features/leads/leadCsv.ts` — column spec, header aliases, enum/label/date/number
      normalizers, `csvRowToLead`, `leadsToCsvRows`, `leadCsvTemplate`
- [x] `db.createLeadsBulk` (chunked insert)
- [x] `LeadCsvModal` — 3-step wizard (upload → map columns → review & import) with
      drag-drop, auto-mapping, downloadable template, inline field guide, per-row
      validation + warnings
- [x] LeadsPage: Import CSV (canWrite) + Export CSV (filtered) buttons
- [x] `docs/LEADS_CSV.md` format spec + README links
- [x] `npm run build` green

## Phase 14 — Admin governance (super_admin)
- [x] `0003_admin_governance.sql`: `super_admin` role; `is_super_admin()` /
      `can_delete()`; `is_admin()` now includes super_admin
- [x] `roseway.role_permissions` matrix (7 flags + nav jsonb) + seed + RLS
      (super_admin write) + guard trigger (super_admin row locked)
- [x] `roseway.audit_log` + RLS (admin read, function-only write)
- [x] `users_guard_role` tightened (grant/revoke admin+ = super_admin only)
- [x] delete policies re-pointed to `can_delete()` (properties/residents/cases + dealflow)
- [x] `manage-users` Edge Function (Deno) — create / set_role / set_active / delete,
      super_admin-verified, last-super-admin + self-action guards, audit writes
- [x] types + `db.manageUsers` (functions.invoke) + `updateRolePermissions` + `listAuditLog`
- [x] `useRole()` resolves the matrix (with hardcoded fallback pre-0003):
      `canWrite/canDelete/canExport/canImport/canManageUsers/canEditPermissions/navAllowed`
- [x] Sidebar nav filtered by `navAllowed`
- [x] `features/settings/AccessGovernance.tsx` — Users (create/role/enable/delete),
      Role permission matrix editor, Audit log; gated by isAdmin / canManageUsers / canEditPermissions
- [x] SettingsPage rebuilt around Profile + `<AccessGovernance />` (old placeholder removed)
- [x] LeadsPage import/export/delete buttons gated by matrix flags
- [x] README §3/§8/§9, ARCHITECTURE §3.12–3.13, CLAUDE.md updated
- [x] `npm run build` green

> Deploy step for the operator: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=…`
> then `supabase functions deploy manage-users`. Bootstrap the first super_admin
> via the dashboard (README §3).

## Deferred (hooks only — do NOT build unless asked)
- [ ] Calendar integration (`cases.calendar_event_id`, sync button slot present)
- [ ] Granular security / permission matrix (`users.is_active`, Advanced card present)
- [ ] `pg_cron` + Edge Function reminder push (replaces client sweep)
- [ ] Resident self-service portal
