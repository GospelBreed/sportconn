-- ============================================================================
-- Roseway CRM — initial schema
--
-- Resident-services CRM for Roseway Resident Services. Everything lives in a
-- dedicated `roseway` schema so the project can share a Supabase instance.
--
-- Contents:
--   1. schema + extensions
--   2. tables (users, properties, residents, cases, activities, notifications)
--   3. indexes
--   4. helper functions (jwt_role / is_admin / can_write / stage_label)
--   5. triggers (updated_at, new-user mirror, case lifecycle, activity log,
--      assignment notifications, resident-created log, role guard)
--   6. row level security + policies
--   7. analytics RPC  roseway.get_analytics_summary()
--   8. realtime publication
--   9. grants + expose schema to the API
--  10. backfill existing auth users
--
-- Run this whole file once in the Supabase SQL editor (or `supabase db push`).
-- It is idempotent — safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

create schema if not exists roseway;

-- ----------------------------------------------------------------------------
-- 2. TABLES
-- ----------------------------------------------------------------------------

-- staff — mirror of auth.users, populated by trigger on signup
create table if not exists roseway.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'case_manager'
              check (role in ('admin','case_manager','read_only')),
  title       text,
  phone       text,
  avatar_url  text,
  is_active   boolean not null default true,   -- reserved: future deactivation flow
  created_at  timestamptz not null default now()
);

create table if not exists roseway.properties (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  address_line1  text,
  city           text,
  state          text,
  postal_code    text,
  unit_count     integer not null default 0 check (unit_count >= 0),
  property_type  text not null default 'conventional'
                 check (property_type in ('conventional','luxury','senior','affordable','mixed_use')),
  manager_name   text,
  manager_email  text,
  manager_phone  text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists roseway.residents (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text not null,
  email                 text,
  phone                 text,
  property_id           uuid references roseway.properties(id) on delete set null,
  unit_number           text,
  status                text not null default 'active'
                        check (status in ('active','pending','at_risk','former')),
  experience_score      integer check (experience_score between 0 and 100),
  assigned_case_manager uuid references roseway.users(id) on delete set null,
  move_in_date          date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists roseway.cases (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  resident_id       uuid references roseway.residents(id) on delete cascade,
  property_id       uuid references roseway.properties(id) on delete set null,
  category          text not null default 'other'
                    check (category in ('maintenance','billing','lease','complaint','community','wellness','other')),
  description       text,
  stage             text not null default 'intake'
                    check (stage in ('intake','in_progress','awaiting_resident','resolved','closed')),
  priority          text not null default 'medium'
                    check (priority in ('low','medium','high','urgent')),
  assigned_to       uuid references roseway.users(id) on delete set null,
  stage_entered_at  timestamptz not null default now(),
  next_follow_up_at timestamptz,
  calendar_event_id text,                       -- reserved: calendar integration
  opened_at         timestamptz not null default now(),
  resolved_at       timestamptz,
  closed_at         timestamptz,
  created_by        uuid references roseway.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint cases_subject_present check (resident_id is not null or property_id is not null)
);

create table if not exists roseway.activities (
  id          uuid primary key default gen_random_uuid(),
  resident_id uuid references roseway.residents(id) on delete cascade,
  case_id     uuid references roseway.cases(id) on delete cascade,
  property_id uuid references roseway.properties(id) on delete set null,
  type        text not null
              check (type in ('call','visit','note','stage_change','case_opened',
                              'case_closed','follow_up_set','resident_created','system')),
  description text,
  created_by  uuid references roseway.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists roseway.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references roseway.users(id) on delete cascade,
  case_id     uuid references roseway.cases(id) on delete cascade,
  resident_id uuid references roseway.residents(id) on delete cascade,
  type        text not null default 'follow_up_due'
              check (type in ('follow_up_due','follow_up_overdue','case_assigned','stage_change')),
  title       text not null,
  body        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_residents_status     on roseway.residents(status);
create index if not exists idx_residents_property    on roseway.residents(property_id);
create index if not exists idx_residents_manager     on roseway.residents(assigned_case_manager);
create index if not exists idx_cases_stage           on roseway.cases(stage);
create index if not exists idx_cases_priority        on roseway.cases(priority);
create index if not exists idx_cases_assigned        on roseway.cases(assigned_to);
create index if not exists idx_cases_resident        on roseway.cases(resident_id);
create index if not exists idx_cases_property        on roseway.cases(property_id);
create index if not exists idx_cases_followup        on roseway.cases(next_follow_up_at);
create index if not exists idx_activities_case       on roseway.activities(case_id, created_at desc);
create index if not exists idx_activities_resident   on roseway.activities(resident_id, created_at desc);
create index if not exists idx_activities_created    on roseway.activities(created_at desc);
create index if not exists idx_notifications_user    on roseway.notifications(user_id, read_at, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. HELPER FUNCTIONS
-- ----------------------------------------------------------------------------
-- Role comes from the Supabase Auth JWT (app_metadata.role). Reading the JWT --
-- rather than a table keeps these helpers free of RLS recursion.
create or replace function roseway.jwt_role()
returns text language sql stable as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role',
    'case_manager'
  );
$$;

create or replace function roseway.is_admin()
returns boolean language sql stable as $$
  select roseway.jwt_role() = 'admin';
$$;

create or replace function roseway.can_write()
returns boolean language sql stable as $$
  select roseway.jwt_role() in ('admin','case_manager');
$$;

create or replace function roseway.stage_label(s text)
returns text language sql immutable as $$
  select case s
    when 'intake' then 'Intake'
    when 'in_progress' then 'In Progress'
    when 'awaiting_resident' then 'Awaiting Resident'
    when 'resolved' then 'Resolved'
    when 'closed' then 'Closed'
    else s end;
$$;

-- ----------------------------------------------------------------------------
-- 5. TRIGGERS
-- ----------------------------------------------------------------------------

-- 5a. updated_at bump
create or replace function roseway.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_properties_updated on roseway.properties;
create trigger trg_properties_updated before update on roseway.properties
  for each row execute function roseway.touch_updated_at();

drop trigger if exists trg_residents_updated on roseway.residents;
create trigger trg_residents_updated before update on roseway.residents
  for each row execute function roseway.touch_updated_at();

drop trigger if exists trg_cases_updated on roseway.cases;
create trigger trg_cases_updated before update on roseway.cases
  for each row execute function roseway.touch_updated_at();

-- 5b. mirror new auth users into roseway.users
create or replace function roseway.handle_new_user()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  insert into roseway.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data->>'role', 'case_manager')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_auth_user_created_roseway on auth.users;
create trigger trg_auth_user_created_roseway
  after insert on auth.users
  for each row execute function roseway.handle_new_user();

-- 5c. case lifecycle: backfill property, stamp stage timestamps
create or replace function roseway.cases_before_write()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  if new.property_id is null and new.resident_id is not null then
    select property_id into new.property_id from roseway.residents where id = new.resident_id;
  end if;

  if tg_op = 'INSERT' then
    new.stage_entered_at := now();
    if new.stage in ('resolved','closed') then
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    if new.stage = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
    end if;
  elsif tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_entered_at := now();
    if new.stage in ('resolved','closed') and old.stage not in ('resolved','closed') then
      new.resolved_at := now();
    end if;
    if new.stage = 'closed' then
      new.closed_at := coalesce(old.closed_at, now());
    end if;
    if new.stage not in ('resolved','closed') then
      new.resolved_at := null;
      new.closed_at := null;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_cases_before_write on roseway.cases;
create trigger trg_cases_before_write before insert or update on roseway.cases
  for each row execute function roseway.cases_before_write();

-- 5d. case created → activity (+ follow-up activity)
create or replace function roseway.cases_after_insert()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  insert into roseway.activities (resident_id, case_id, property_id, type, description, created_by)
  values (new.resident_id, new.id, new.property_id, 'case_opened',
          'Case opened: ' || new.title || ' (' || roseway.stage_label(new.stage) || ')', auth.uid());

  if new.next_follow_up_at is not null then
    insert into roseway.activities (resident_id, case_id, property_id, type, description, created_by)
    values (new.resident_id, new.id, new.property_id, 'follow_up_set',
            'Follow-up set for ' || to_char(new.next_follow_up_at, 'Mon DD, YYYY'), auth.uid());
  end if;

  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    insert into roseway.notifications (user_id, case_id, resident_id, type, title, body)
    values (new.assigned_to, new.id, new.resident_id, 'case_assigned',
            'Case assigned to you', new.title);
  end if;
  return new;
end; $$;

drop trigger if exists trg_cases_after_insert on roseway.cases;
create trigger trg_cases_after_insert after insert on roseway.cases
  for each row execute function roseway.cases_after_insert();

-- 5e. case updated → stage-change / close activity, assignment + follow-up
create or replace function roseway.cases_after_update()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  if new.stage is distinct from old.stage then
    insert into roseway.activities (resident_id, case_id, property_id, type, description, created_by)
    values (new.resident_id, new.id, new.property_id, 'stage_change',
            roseway.stage_label(old.stage) || ' → ' || roseway.stage_label(new.stage), auth.uid());

    if new.stage = 'closed' then
      insert into roseway.activities (resident_id, case_id, property_id, type, description, created_by)
      values (new.resident_id, new.id, new.property_id, 'case_closed',
              'Case closed: ' || new.title, auth.uid());
    end if;
  end if;

  if new.assigned_to is distinct from old.assigned_to
     and new.assigned_to is not null
     and new.assigned_to is distinct from auth.uid() then
    insert into roseway.notifications (user_id, case_id, resident_id, type, title, body)
    values (new.assigned_to, new.id, new.resident_id, 'case_assigned',
            'Case assigned to you', new.title);
  end if;

  if new.next_follow_up_at is distinct from old.next_follow_up_at
     and new.next_follow_up_at is not null then
    insert into roseway.activities (resident_id, case_id, property_id, type, description, created_by)
    values (new.resident_id, new.id, new.property_id, 'follow_up_set',
            'Follow-up set for ' || to_char(new.next_follow_up_at, 'Mon DD, YYYY'), auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_cases_after_update on roseway.cases;
create trigger trg_cases_after_update after update on roseway.cases
  for each row execute function roseway.cases_after_update();

-- 5f. resident created → activity
create or replace function roseway.residents_after_insert()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  insert into roseway.activities (resident_id, property_id, type, description, created_by)
  values (new.id, new.property_id, 'resident_created',
          'Resident added: ' || new.full_name, auth.uid());
  return new;
end; $$;

drop trigger if exists trg_residents_after_insert on roseway.residents;
create trigger trg_residents_after_insert after insert on roseway.residents
  for each row execute function roseway.residents_after_insert();

-- 5g. guard: only admins may change a user's role
create or replace function roseway.users_guard_role()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  if new.role is distinct from old.role and not roseway.is_admin() then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end; $$;

drop trigger if exists trg_users_guard_role on roseway.users;
create trigger trg_users_guard_role before update on roseway.users
  for each row execute function roseway.users_guard_role();

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table roseway.users         enable row level security;
alter table roseway.properties    enable row level security;
alter table roseway.residents     enable row level security;
alter table roseway.cases         enable row level security;
alter table roseway.activities    enable row level security;
alter table roseway.notifications enable row level security;

-- USERS ---------------------------------------------------------------------
drop policy if exists users_select on roseway.users;
create policy users_select on roseway.users for select to authenticated using (true);

drop policy if exists users_update_self on roseway.users;
create policy users_update_self on roseway.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists users_admin_write on roseway.users;
create policy users_admin_write on roseway.users for all to authenticated
  using (roseway.is_admin()) with check (roseway.is_admin());

-- PROPERTIES --------------------------------------------------------------
drop policy if exists properties_select on roseway.properties;
create policy properties_select on roseway.properties for select to authenticated using (true);

drop policy if exists properties_write on roseway.properties;
create policy properties_write on roseway.properties for insert to authenticated
  with check (roseway.can_write());

drop policy if exists properties_update on roseway.properties;
create policy properties_update on roseway.properties for update to authenticated
  using (roseway.can_write()) with check (roseway.can_write());

drop policy if exists properties_delete on roseway.properties;
create policy properties_delete on roseway.properties for delete to authenticated
  using (roseway.is_admin());

-- RESIDENTS -------------------------------------------------------------
drop policy if exists residents_select on roseway.residents;
create policy residents_select on roseway.residents for select to authenticated using (true);

drop policy if exists residents_insert on roseway.residents;
create policy residents_insert on roseway.residents for insert to authenticated
  with check (roseway.can_write());

drop policy if exists residents_update on roseway.residents;
create policy residents_update on roseway.residents for update to authenticated
  using (roseway.can_write()) with check (roseway.can_write());

drop policy if exists residents_delete on roseway.residents;
create policy residents_delete on roseway.residents for delete to authenticated
  using (roseway.is_admin());

-- CASES ---------------------------------------------------------------
drop policy if exists cases_select on roseway.cases;
create policy cases_select on roseway.cases for select to authenticated using (true);

drop policy if exists cases_insert on roseway.cases;
create policy cases_insert on roseway.cases for insert to authenticated
  with check (roseway.can_write());

drop policy if exists cases_update on roseway.cases;
create policy cases_update on roseway.cases for update to authenticated
  using (roseway.can_write()) with check (roseway.can_write());

drop policy if exists cases_delete on roseway.cases;
create policy cases_delete on roseway.cases for delete to authenticated
  using (roseway.can_write());

-- ACTIVITIES ------------------------------------------------------------
drop policy if exists activities_select on roseway.activities;
create policy activities_select on roseway.activities for select to authenticated using (true);

drop policy if exists activities_insert on roseway.activities;
create policy activities_insert on roseway.activities for insert to authenticated
  with check (roseway.can_write() and (created_by = auth.uid() or created_by is null));

drop policy if exists activities_delete on roseway.activities;
create policy activities_delete on roseway.activities for delete to authenticated
  using (roseway.is_admin());

-- NOTIFICATIONS -------------------------------------------------------
drop policy if exists notifications_select on roseway.notifications;
create policy notifications_select on roseway.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_insert on roseway.notifications;
create policy notifications_insert on roseway.notifications for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists notifications_update on roseway.notifications;
create policy notifications_update on roseway.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete on roseway.notifications;
create policy notifications_delete on roseway.notifications for delete to authenticated
  using (user_id = auth.uid() or roseway.is_admin());

-- ----------------------------------------------------------------------------
-- 7. ANALYTICS RPC
-- ----------------------------------------------------------------------------
create or replace function roseway.get_analytics_summary()
returns jsonb
language plpgsql
security definer
set search_path = roseway, public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_residents',    (select count(*) from residents where status <> 'former'),
    'total_properties',   (select count(*) from properties),
    'open_cases',         (select count(*) from cases where stage not in ('resolved','closed')),
    'at_risk_residents',  (select count(*) from residents where status = 'at_risk'),
    'overdue_followups',  (select count(*) from cases
                             where stage not in ('resolved','closed') and next_follow_up_at < now()),
    'due_today_followups',(select count(*) from cases
                             where stage not in ('resolved','closed')
                               and next_follow_up_at::date = current_date),
    'avg_resolution_days',(select coalesce(round(
                             avg(extract(epoch from (resolved_at - opened_at)) / 86400)::numeric, 1), 0)
                           from cases
                           where resolved_at is not null and resolved_at >= now() - interval '90 days'),
    'resolved_this_week', (select count(*) from cases
                             where resolved_at >= date_trunc('week', now())),
    'resolved_last_week', (select count(*) from cases
                             where resolved_at >= date_trunc('week', now()) - interval '7 days'
                               and resolved_at <  date_trunc('week', now())),
    'cases_by_stage', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'stage', s.stage, 'label', roseway.stage_label(s.stage),
               'count', coalesce(c.cnt, 0)) order by s.ord), '[]'::jsonb)
      from (values ('intake',1),('in_progress',2),('awaiting_resident',3),
                   ('resolved',4),('closed',5)) as s(stage, ord)
      left join (select stage, count(*) cnt from cases group by stage) c on c.stage = s.stage
    ),
    'priority_breakdown', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'priority', p.priority, 'count', coalesce(c.cnt, 0)) order by p.ord), '[]'::jsonb)
      from (values ('urgent',1),('high',2),('medium',3),('low',4)) as p(priority, ord)
      left join (select priority, count(*) cnt from cases
                 where stage not in ('resolved','closed') group by priority) c on c.priority = p.priority
    ),
    'resolution_funnel', (
      select jsonb_build_array(
        jsonb_build_object('label','Intake',       'count', (select count(*) from cases)),
        jsonb_build_object('label','In Progress',  'count', (select count(*) from cases
                             where stage in ('in_progress','awaiting_resident','resolved','closed'))),
        jsonb_build_object('label','Resolved',     'count', (select count(*) from cases
                             where stage in ('resolved','closed'))),
        jsonb_build_object('label','Closed',       'count', (select count(*) from cases
                             where stage = 'closed'))
      )
    ),
    'cases_opened_per_week', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'week_start', to_char(wk, 'YYYY-MM-DD'),
               'count', coalesce(c.cnt, 0)) order by wk), '[]'::jsonb)
      from generate_series(date_trunc('week', now()) - interval '7 weeks',
                           date_trunc('week', now()), interval '1 week') as wk
      left join (select date_trunc('week', opened_at) w, count(*) cnt from cases group by 1) c
        on c.w = wk
    ),
    'caseload_by_manager', (
      select coalesce(jsonb_agg(x order by (x->>'open_cases')::int desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'user_id', u.id, 'full_name', u.full_name,
                 'open_cases', count(c.id)) as x
        from users u
        join cases c on c.assigned_to = u.id and c.stage not in ('resolved','closed')
        group by u.id, u.full_name
        order by count(c.id) desc
        limit 6
      ) t
    )
  ) into result;
  return result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. REALTIME PUBLICATION
-- ----------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table roseway.cases;         exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table roseway.residents;     exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table roseway.activities;    exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table roseway.notifications; exception when others then null; end $$;

-- ----------------------------------------------------------------------------
-- 9. GRANTS + EXPOSE SCHEMA
-- ----------------------------------------------------------------------------
grant usage on schema roseway to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema roseway to authenticated;
grant all on all tables in schema roseway to service_role;
grant select on all tables in schema roseway to anon;
grant execute on all routines in schema roseway to authenticated, service_role;
grant usage, select on all sequences in schema roseway to authenticated, service_role;

alter default privileges for role postgres in schema roseway
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema roseway
  grant all on tables to service_role;
alter default privileges for role postgres in schema roseway
  grant execute on routines to authenticated, service_role;

-- Expose the schema to the PostgREST API. If your role can't run the ALTER
-- (rare), instead add "roseway" under Project Settings → API → Exposed schemas.
do $$
begin
  execute 'alter role authenticator set pgrst.db_schemas = ' ||
          quote_literal('public, graphql_public, roseway');
  notify pgrst, 'reload config';
exception when insufficient_privilege then
  raise notice 'Could not set pgrst.db_schemas automatically — add "roseway" to Exposed schemas in the dashboard.';
end $$;

-- ----------------------------------------------------------------------------
-- 10. BACKFILL EXISTING AUTH USERS
-- ----------------------------------------------------------------------------
insert into roseway.users (id, email, full_name, role)
select u.id,
       u.email,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       coalesce(u.raw_app_meta_data->>'role', 'case_manager')
from auth.users u
on conflict (id) do nothing;
