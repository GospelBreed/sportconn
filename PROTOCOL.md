# PROTOCOL.md — Coding Standards & Rules

## TypeScript / React
1. **Strict TS.** `strict: true`. No `any` in committed code except at an untyped
   third-party boundary — cast immediately to a named type. Prefer discriminated
   unions / string-literal unions for `stage`, `status`, `priority`, `role`,
   `category`, `activity type` — defined once in `src/types`.
2. **Function components + hooks only.** No class components.
3. **One responsibility per file.** Feature UI under `src/features/<domain>/`;
   reusable primitives under `src/components/ui/`; layout under
   `src/components/layout/`.
4. **Server state = TanStack Query.** Never `useEffect`+`await supabase…` for
   server data. Query keys are arrays, centralized in the feature's hook file:
   `['cases']`, `['case', id]`, `['residents', filters]`, `['resident', id]`,
   `['properties', q]`, `['property', id]`, `['analytics-summary']`,
   `['followups']`, `['notifications']`, `['users']`, `['activities']`.
5. **Mutations invalidate or roll back.** Every `useMutation` either
   `queryClient.invalidateQueries` for the affected keys, or does an optimistic
   `setQueryData` and restores the snapshot in `onError` (the pipeline board).
6. **No raw hex in JSX.** Use Tailwind token classes (`bg-surface`, `text-ink`,
   `text-muted`, `border-line`, `text-primary`, `bg-primary-tint`). Tokens are
   defined once in `tailwind.config.js`. The brand crimson is also mirrored to a
   CSS variable via `src/lib/branding.ts` so it can be reskinned in one place.
7. **Accessibility.** Interactive elements are real `<button>`/`<a>`. Modals and
   the slide-over trap focus and close on `Esc`. Inputs have a `<label>` or
   `aria-label`. Color is never the only signal — pair every status color with
   text or an icon. Target contrast ≥ 4.5:1 on the light theme.
8. **Responsive.** Everything works at ≥ 320px. Sidebar collapses to a drawer
   under `md`. The pipeline board scrolls horizontally; tables get an
   `overflow-x-auto` wrapper and hide non-essential columns under `lg`.

## Data access (Supabase)
1. **All reads/writes go through `src/lib/db.ts`.** Each function is a thin typed
   wrapper: run the `supabase` call, `if (error) throw new Error(error.message)`,
   return `data`. No `supabase.from(...)` calls scattered in components.
2. **Select only what you render**, and use PostgREST embeds for joins, e.g.
   `.select('*, residents(id,full_name), properties(id,name), assignee:assigned_to(id,full_name)')`.
3. **Never** import or reference a service-role key in `frontend/`. Only
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist client-side.
4. **Trust RLS, mirror it in UI.** Before rendering a mutating control, check
   `useRole()`. A `read_only` user sees no add/edit/delete/drag affordances.
5. **Let the database do server work.** Stage timestamps, activity logging,
   assignment notifications, `property_id` backfill, analytics aggregation are
   triggers / the RPC — do not re-implement them in the client.
6. **Realtime subscriptions** are created in a `useRealtime` hook, always cleaned
   up on unmount, and only `invalidateQueries` (never mutate cache directly from
   a socket payload). Debounce bursts (~250ms).

## State / UX Rules
- Every data component renders **Skeleton → Empty → Error → Data** using the
  `<Skeleton>` / `<EmptyState>` / `<ErrorState>` primitives. No exceptions.
- **Toasts**, never `alert` / `console.error`, for user-facing outcomes.
  `success` / `error` / `info`, auto-dismiss 4s, top-right.
- **Confirm before destructive actions** via `<ConfirmDialog>` (red primary).
  Resident delete for a case_manager is a soft delete (`status → 'former'`).
- **Debounce** search inputs at 300ms (`useDebounced`).
- Forms validate client-side before the network call; disable submit while
  pending; show inline field errors; keep the entered values on failure.
- Optimistic UI only where rollback is implemented (pipeline drag, mark-read).

## Naming
- Components `PascalCase`; hooks `useCamelCase`; a file's name matches its
  primary export.
- `db.ts` functions: `listCases`, `getCase`, `createCase`, `updateCase`,
  `updateCaseStage`, `deleteCase`; same verb set for `residents`, `properties`.
- Query-key arrays as in rule 4 above. Realtime channel names:
  `rt-cases`, `rt-activities`, `rt-notifications`.

## SQL / Migrations
1. **One schema: `roseway`.** Every object is `roseway.<name>`. Idempotent DDL
   (`create table if not exists`, `drop policy if exists` before `create policy`,
   `create or replace function`).
2. **Enums as `CHECK` constraints**, not Postgres `enum` types (cheap to evolve).
3. **RLS enabled on every table** with explicit, named policies. New table ⇒ new
   policies in the same migration.
4. Trigger functions are `security definer` with `set search_path = roseway, public`.
5. Migrations are **append-only** and numbered `NNNN_description.sql`. Never edit
   a migration that has been run against a shared database — add the next one.
6. Keep `src/types/index.ts` in sync with the schema by hand; note the mapping in
   the PR / commit message.

## Definition of Done (per feature)
- [ ] Typed end to end (TS union types agree with the SQL `CHECK` values)
- [ ] Skeleton + empty + error + data states present
- [ ] Validates input; surfaces 4xx/RLS/network failures as a toast
- [ ] Role-guarded: `read_only` sees no mutating controls; matches RLS
- [ ] Uses design tokens only; light theme; matches the reference density
- [ ] Responsive at 320 / 768 / 1280
- [ ] Realtime or explicit refetch keeps it fresh; no stale board after a write
- [ ] `npm run build` typechecks and builds clean
- [ ] `TODO.md` checkboxes updated to match reality

## Git / Commits (if used)
- Conventional-ish: `feat(pipeline): optimistic stage change`,
  `feat(db): 0002 add caseload index`.
- End commit messages with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
