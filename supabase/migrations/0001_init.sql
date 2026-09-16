-- ============================================================================
-- SportConn CRM — initial schema
--
-- Internal business-development / growth CRM for SportConn. Everything lives
-- in a dedicated `sportconn` schema so the project can share a Supabase
-- instance.
--
-- Contents:
--   1. schema + extensions
--   2. core tables (users, facilities, captains, activities, notifications)
--   3. indexes
--   4. helper functions (jwt_role / is_admin / can_write / can_delete)
--   5. triggers (updated_at, new-user mirror, facility/captain activity log,
--      assignment notifications, role guard)
--   6. row level security + policies
--   7. realtime publication
--   8. grants + expose schema to the API
--   9. backfill existing auth users
--
-- Run this whole file once in the Supabase SQL editor (or `supabase db push`).
-- It is idempotent — safe to re-run.
--
-- See migration 0002 for the pipelines/leads/campaigns/tasks dealflow layer
-- and 0003 for role governance.
-- ============================================================================

create extension if not exists pgcrypto;

create schema if not exists sportconn;

-- ----------------------------------------------------------------------------
-- 2. CORE TABLES
-- ----------------------------------------------------------------------------

-- staff — mirror of auth.users, populated by trigger on signup.
-- Role hierarchy: super_admin > admin > (working staff roles) > viewer.
-- Working staff roles map to SportConn's internal departments; each gets a
-- row in sportconn.role_permissions (migration 0003) controlling write/delete.
create table if not exists sportconn.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'business_development'
              check (role in (
                'super_admin','admin','management','business_development','sales',
                'partnerships','investor_relations','marketing','community_manager','viewer'
              )),
  department  text,
  title       text,
  phone       text,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Sports facilities / venues SportConn pursues as partnership opportunities
-- (§10). The facility itself carries its own lifecycle stage — it is a
-- long-lived directory entry, not a disposable "deal" row.
create table if not exists sportconn.facilities (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  contact_name       text,
  contact_email      text,
  contact_phone      text,
  address_line1      text,
  city               text,
  area               text,
  state              text,
  country            text,
  facility_type      text not null default 'other'
                     check (facility_type in (
                       'football_turf','five_a_side','astroturf','sports_centre',
                       'recreation_centre','sports_complex','other'
                     )),
  pitch_count        integer check (pitch_count is null or pitch_count >= 0),
  operating_hours    text,
  booking_model      text,       -- e.g. "walk-in", "app-based", "phone booking"
  current_software   text,
  partnership_type   text,       -- e.g. "revenue share", "booking integration", "sponsorship host"
  stage              text not null default 'prospect',
  expected_value     numeric(14,2),
  currency           text not null default 'NGN',
  assigned_to        uuid references sportconn.users(id) on delete set null,
  next_follow_up_at  timestamptz,
  status             text not null default 'open' check (status in ('open','won','lost','nurture')),
  lost_reason        text,
  won_at             timestamptz,
  lost_at            timestamptz,
  notes              text,
  created_by         uuid references sportconn.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Local football/community captains who organize grassroots games (§12).
-- Also a long-lived directory entry with its own lifecycle stage.
create table if not exists sportconn.captains (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  email             text,
  phone             text,
  whatsapp          text,
  location_city     text,
  area              text,
  community         text,
  player_count      integer check (player_count is null or player_count >= 0),
  games_coordinated integer not null default 0,
  active            boolean not null default false,
  date_joined       date,
  next_game_at      date,
  last_activity_at  timestamptz not null default now(),
  stage             text not null default 'prospect',
  assigned_to       uuid references sportconn.users(id) on delete set null,
  notes             text,
  created_by        uuid references sportconn.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists sportconn.activities (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid,        -- FK added in 0002 once sportconn.leads exists
  facility_id  uuid references sportconn.facilities(id) on delete cascade,
  captain_id   uuid references sportconn.captains(id) on delete cascade,
  type         text not null
               check (type in (
                 'call','whatsapp','email','meeting','visit','note','stage_change',
                 'follow_up_set','follow_up_completed','lead_created','lead_stage_change',
                 'facility_created','captain_created','task_done','won','lost',
                 'document','outreach','system'
               )),
  description  text,
  created_by   uuid references sportconn.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists sportconn.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references sportconn.users(id) on delete cascade,
  lead_id     uuid,        -- FK added in 0002
  facility_id uuid references sportconn.facilities(id) on delete cascade,
  captain_id  uuid references sportconn.captains(id) on delete cascade,
  type        text not null default 'follow_up_due'
              check (type in (
                'follow_up_due','follow_up_overdue','lead_assigned','stage_change',
                'task_assigned','task_due','task_overdue','deal_won','deal_lost'
              )),
  title       text not null,
  body        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_facilities_stage      on sportconn.facilities(stage);
create index if not exists idx_facilities_assigned    on sportconn.facilities(assigned_to);
create index if not exists idx_facilities_followup    on sportconn.facilities(next_follow_up_at);
create index if not exists idx_captains_stage         on sportconn.captains(stage);
create index if not exists idx_captains_assigned      on sportconn.captains(assigned_to);
create index if not exists idx_activities_facility    on sportconn.activities(facility_id, created_at desc);
create index if not exists idx_activities_captain     on sportconn.activities(captain_id, created_at desc);
create index if not exists idx_activities_created     on sportconn.activities(created_at desc);
create index if not exists idx_notifications_user     on sportconn.notifications(user_id, read_at, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. HELPER FUNCTIONS
-- ----------------------------------------------------------------------------
-- Role comes from the Supabase Auth JWT (app_metadata.role). Reading the JWT --
-- rather than a table keeps these helpers free of RLS recursion.
create or replace function sportconn.jwt_role()
returns text language sql stable as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role',
    'business_development'
  );
$$;

create or replace function sportconn.is_admin()
returns boolean language sql stable as $$
  select sportconn.jwt_role() in ('admin','super_admin');
$$;

create or replace function sportconn.is_super_admin()
returns boolean language sql stable as $$
  select sportconn.jwt_role() = 'super_admin';
$$;

-- can_write()/can_delete() are redefined in 0003 to consult the editable
-- role_permissions matrix; these are safe fallbacks so 0001 alone still works.
create or replace function sportconn.can_write()
returns boolean language sql stable as $$
  select sportconn.jwt_role() <> 'viewer';
$$;

create or replace function sportconn.can_delete()
returns boolean language sql stable as $$
  select sportconn.jwt_role() in ('admin','super_admin');
$$;

-- ----------------------------------------------------------------------------
-- 5. TRIGGERS
-- ----------------------------------------------------------------------------

-- 5a. updated_at bump
create or replace function sportconn.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_facilities_updated on sportconn.facilities;
create trigger trg_facilities_updated before update on sportconn.facilities
  for each row execute function sportconn.touch_updated_at();

drop trigger if exists trg_captains_updated on sportconn.captains;
create trigger trg_captains_updated before update on sportconn.captains
  for each row execute function sportconn.touch_updated_at();

-- 5b. mirror new auth users into sportconn.users
create or replace function sportconn.handle_new_user()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  insert into sportconn.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data->>'role', 'business_development')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_auth_user_created_sportconn on auth.users;
create trigger trg_auth_user_created_sportconn
  after insert on auth.users
  for each row execute function sportconn.handle_new_user();

-- 5c. facility lifecycle: won/lost bookkeeping, activity log
create or replace function sportconn.facilities_before_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    if new.status = 'lost' and new.lost_reason is null then
      raise exception 'lost_reason is required when marking a facility opportunity Lost';
    end if;
    if new.status = 'won' then
      new.won_at := coalesce(new.won_at, now());
    elsif new.status = 'lost' then
      new.lost_at := coalesce(new.lost_at, now());
    else
      new.won_at := null;
      new.lost_at := null;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_facilities_before_write on sportconn.facilities;
create trigger trg_facilities_before_write before insert or update on sportconn.facilities
  for each row execute function sportconn.facilities_before_write();

create or replace function sportconn.facilities_after_insert()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  insert into sportconn.activities (facility_id, type, description, created_by)
  values (new.id, 'facility_created', 'Facility added: ' || new.name, auth.uid());
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    insert into sportconn.notifications (user_id, facility_id, type, title, body)
    values (new.assigned_to, new.id, 'lead_assigned', 'Facility opportunity assigned to you', new.name);
  end if;
  return new;
end; $$;

drop trigger if exists trg_facilities_after_insert on sportconn.facilities;
create trigger trg_facilities_after_insert after insert on sportconn.facilities
  for each row execute function sportconn.facilities_after_insert();

create or replace function sportconn.facilities_after_update()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.stage is distinct from old.stage then
    insert into sportconn.activities (facility_id, type, description, created_by)
    values (new.id, 'stage_change', old.stage || ' → ' || new.stage, auth.uid());
    if new.status = 'won' and old.status <> 'won' then
      insert into sportconn.activities (facility_id, type, description, created_by)
      values (new.id, 'won', 'Facility marked Won: ' || new.name, auth.uid());
    elsif new.status = 'lost' and old.status <> 'lost' then
      insert into sportconn.activities (facility_id, type, description, created_by)
      values (new.id, 'lost', 'Facility marked Lost: ' || coalesce(new.lost_reason, 'no reason given'), auth.uid());
    end if;
  end if;
  if new.assigned_to is distinct from old.assigned_to
     and new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    insert into sportconn.notifications (user_id, facility_id, type, title, body)
    values (new.assigned_to, new.id, 'lead_assigned', 'Facility opportunity assigned to you', new.name);
  end if;
  if new.next_follow_up_at is distinct from old.next_follow_up_at and new.next_follow_up_at is not null then
    insert into sportconn.activities (facility_id, type, description, created_by)
    values (new.id, 'follow_up_set', 'Follow-up set for ' || to_char(new.next_follow_up_at, 'Mon DD, YYYY'), auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_facilities_after_update on sportconn.facilities;
create trigger trg_facilities_after_update after update on sportconn.facilities
  for each row execute function sportconn.facilities_after_update();

-- 5d. captain lifecycle: activity log
create or replace function sportconn.captains_after_insert()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  insert into sportconn.activities (captain_id, type, description, created_by)
  values (new.id, 'captain_created', 'Captain added: ' || new.full_name, auth.uid());
  return new;
end; $$;

drop trigger if exists trg_captains_after_insert on sportconn.captains;
create trigger trg_captains_after_insert after insert on sportconn.captains
  for each row execute function sportconn.captains_after_insert();

create or replace function sportconn.captains_after_update()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.stage is distinct from old.stage then
    insert into sportconn.activities (captain_id, type, description, created_by)
    values (new.id, 'stage_change', old.stage || ' → ' || new.stage, auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_captains_after_update on sportconn.captains;
create trigger trg_captains_after_update after update on sportconn.captains
  for each row execute function sportconn.captains_after_update();

-- 5e. guard: only admins may change a user's role (tightened further in 0003)
create or replace function sportconn.users_guard_role()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.role is distinct from old.role and not sportconn.is_admin() then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end; $$;

drop trigger if exists trg_users_guard_role on sportconn.users;
create trigger trg_users_guard_role before update on sportconn.users
  for each row execute function sportconn.users_guard_role();

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table sportconn.users         enable row level security;
alter table sportconn.facilities    enable row level security;
alter table sportconn.captains      enable row level security;
alter table sportconn.activities    enable row level security;
alter table sportconn.notifications enable row level security;

-- USERS -----------------------------------------------------------------
drop policy if exists users_select on sportconn.users;
create policy users_select on sportconn.users for select to authenticated using (true);

drop policy if exists users_update_self on sportconn.users;
create policy users_update_self on sportconn.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists users_admin_write on sportconn.users;
create policy users_admin_write on sportconn.users for all to authenticated
  using (sportconn.is_admin()) with check (sportconn.is_admin());

-- FACILITIES / CAPTAINS / ACTIVITIES / NOTIFICATIONS ---------------------
do $$
declare t text;
begin
  foreach t in array array['facilities','captains'] loop
    execute format('drop policy if exists %1$s_select on sportconn.%1$s', t);
    execute format('create policy %1$s_select on sportconn.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_insert on sportconn.%1$s', t);
    execute format('create policy %1$s_insert on sportconn.%1$s for insert to authenticated with check (sportconn.can_write())', t);
    execute format('drop policy if exists %1$s_update on sportconn.%1$s', t);
    execute format('create policy %1$s_update on sportconn.%1$s for update to authenticated using (sportconn.can_write()) with check (sportconn.can_write())', t);
    execute format('drop policy if exists %1$s_delete on sportconn.%1$s', t);
    execute format('create policy %1$s_delete on sportconn.%1$s for delete to authenticated using (sportconn.can_delete())', t);
  end loop;
end $$;

drop policy if exists activities_select on sportconn.activities;
create policy activities_select on sportconn.activities for select to authenticated using (true);

drop policy if exists activities_insert on sportconn.activities;
create policy activities_insert on sportconn.activities for insert to authenticated
  with check (sportconn.can_write() and (created_by = auth.uid() or created_by is null));

drop policy if exists activities_delete on sportconn.activities;
create policy activities_delete on sportconn.activities for delete to authenticated
  using (sportconn.is_admin());

drop policy if exists notifications_select on sportconn.notifications;
create policy notifications_select on sportconn.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_insert on sportconn.notifications;
create policy notifications_insert on sportconn.notifications for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists notifications_update on sportconn.notifications;
create policy notifications_update on sportconn.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete on sportconn.notifications;
create policy notifications_delete on sportconn.notifications for delete to authenticated
  using (user_id = auth.uid() or sportconn.is_admin());

-- ----------------------------------------------------------------------------
-- 7. REALTIME PUBLICATION
-- ----------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table sportconn.facilities;    exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table sportconn.captains;      exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table sportconn.activities;    exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table sportconn.notifications; exception when others then null; end $$;

-- ----------------------------------------------------------------------------
-- 8. GRANTS + EXPOSE SCHEMA
-- ----------------------------------------------------------------------------
grant usage on schema sportconn to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema sportconn to authenticated;
grant all on all tables in schema sportconn to service_role;
grant select on all tables in schema sportconn to anon;
grant execute on all routines in schema sportconn to authenticated, service_role;
grant usage, select on all sequences in schema sportconn to authenticated, service_role;

alter default privileges for role postgres in schema sportconn
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema sportconn
  grant all on tables to service_role;
alter default privileges for role postgres in schema sportconn
  grant execute on routines to authenticated, service_role;

-- Expose the schema to the PostgREST API. If your role can't run the ALTER
-- (rare), instead add "sportconn" under Project Settings → API → Exposed schemas.
do $$
begin
  execute 'alter role authenticator set pgrst.db_schemas = ' ||
          quote_literal('public, graphql_public, sportconn');
  notify pgrst, 'reload config';
exception when insufficient_privilege then
  raise notice 'Could not set pgrst.db_schemas automatically — add "sportconn" to Exposed schemas in the dashboard.';
end $$;

-- ----------------------------------------------------------------------------
-- 9. BACKFILL EXISTING AUTH USERS
-- ----------------------------------------------------------------------------
insert into sportconn.users (id, email, full_name, role)
select u.id,
       u.email,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       coalesce(u.raw_app_meta_data->>'role', 'business_development')
from auth.users u
on conflict (id) do nothing;
