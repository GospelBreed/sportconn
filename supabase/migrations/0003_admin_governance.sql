-- ============================================================================
-- SportConn CRM — migration 0003: admin governance
--
-- Role hierarchy: super_admin > admin > (management/business_development/
-- sales/partnerships/investor_relations/marketing/community_manager) > viewer
-- (§28). Adds:
--   • sportconn.role_permissions — editable capability + nav matrix per role
--   • sportconn.audit_log        — record of user-management actions
--   • can_write()/can_delete() generalized to consult the matrix for every
--     non-super_admin role, so new departments can be added without code
--     changes — just a new row in role_permissions.
--
-- Privileged auth operations (create user, delete user, disable, set role in
-- app_metadata) run in the `manage-users` Edge Function with the service-role
-- key — never in the browser. This migration only prepares the database.
--
-- Run AFTER 0002_dealflow.sql. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROLE HIERARCHY
-- ----------------------------------------------------------------------------
alter table sportconn.users drop constraint if exists users_role_check;
alter table sportconn.users add constraint users_role_check
  check (role in (
    'super_admin','admin','management','business_development','sales',
    'partnerships','investor_relations','marketing','community_manager','viewer'
  ));

create or replace function sportconn.is_admin()
returns boolean language sql stable as $$
  select sportconn.jwt_role() in ('admin','super_admin');
$$;

create or replace function sportconn.is_super_admin()
returns boolean language sql stable as $$
  select sportconn.jwt_role() = 'super_admin';
$$;

-- ----------------------------------------------------------------------------
-- 2. ROLE PERMISSIONS MATRIX
-- ----------------------------------------------------------------------------
create table if not exists sportconn.role_permissions (
  role                 text primary key
                       check (role in (
                         'super_admin','admin','management','business_development','sales',
                         'partnerships','investor_relations','marketing','community_manager','viewer'
                       )),
  can_manage_users     boolean not null default false,
  can_edit_permissions boolean not null default false,
  can_manage_staff     boolean not null default false,
  can_write            boolean not null default false,
  can_delete           boolean not null default false,
  can_export           boolean not null default false,
  can_import           boolean not null default false,
  nav                  jsonb   not null default '{}'::jsonb,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references sportconn.users(id) on delete set null
);

-- Default matrix. Every working-staff role gets full write access and every
-- nav section by default; admins additionally get delete + export/import;
-- super_admin gets everything and cannot be locked out; viewer is read-only.
insert into sportconn.role_permissions
  (role, can_manage_users, can_edit_permissions, can_manage_staff, can_write, can_delete, can_export, can_import, nav)
values
  ('super_admin', true,  true,  true,  true,  true,  true,  true,  '{}'::jsonb),
  ('admin',       false, false, true,  true,  true,  true,  true,  '{}'::jsonb),
  ('management',           false, false, false, true, false, true, true, '{}'::jsonb),
  ('business_development', false, false, false, true, false, true, true, '{}'::jsonb),
  ('sales',                false, false, false, true, false, true, true, '{}'::jsonb),
  ('partnerships',         false, false, false, true, false, true, true, '{}'::jsonb),
  ('investor_relations',   false, false, false, true, false, true, true, '{}'::jsonb),
  ('marketing',            false, false, false, true, false, true, true, '{}'::jsonb),
  ('community_manager',    false, false, false, true, false, true, true, '{}'::jsonb),
  ('viewer',      false, false, false, false, false, false, false, '{}'::jsonb)
on conflict (role) do nothing;

drop trigger if exists trg_role_permissions_updated on sportconn.role_permissions;
create trigger trg_role_permissions_updated before update on sportconn.role_permissions
  for each row execute function sportconn.touch_updated_at();

-- super_admin's own governance powers cannot be revoked, and its row cannot be
-- deleted — otherwise the platform could be locked out of user management.
create or replace function sportconn.guard_role_permissions()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'super_admin' then
      raise exception 'The super_admin permission row cannot be deleted';
    end if;
    return old;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role is immutable';
  end if;
  if old.role = 'super_admin' and (new.can_manage_users = false or new.can_edit_permissions = false) then
    raise exception 'super_admin must retain user-management and permission-editing rights';
  end if;
  return new;
end; $$;

drop trigger if exists trg_guard_role_permissions on sportconn.role_permissions;
create trigger trg_guard_role_permissions
  before update or delete on sportconn.role_permissions
  for each row execute function sportconn.guard_role_permissions();

-- ----------------------------------------------------------------------------
-- 3. CAPABILITY HELPERS — consult the matrix for every non-super_admin role,
--    so new departments/roles don't require code changes.
-- ----------------------------------------------------------------------------
create or replace function sportconn.can_write()
returns boolean language sql stable as $$
  select case when sportconn.jwt_role() = 'super_admin' then true
    else coalesce((select can_write from sportconn.role_permissions where role = sportconn.jwt_role()), true)
  end;
$$;

create or replace function sportconn.can_delete()
returns boolean language sql stable as $$
  select case when sportconn.jwt_role() = 'super_admin' then true
    else coalesce((select can_delete from sportconn.role_permissions where role = sportconn.jwt_role()), false)
  end;
$$;

-- ----------------------------------------------------------------------------
-- 4. AUDIT LOG (written by the Edge Function via service role)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references sportconn.users(id) on delete set null,
  actor_email    text,
  action         text not null,          -- user.create | user.delete | user.set_role | user.set_active | permissions.update
  target_user_id uuid references sportconn.users(id) on delete set null,
  target_email   text,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_audit_created on sportconn.audit_log(created_at desc);

-- ----------------------------------------------------------------------------
-- 5. GUARD: who may set which role (defence-in-depth behind the Edge Function)
-- ----------------------------------------------------------------------------
create or replace function sportconn.users_guard_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role then
    if not sportconn.is_admin() then
      raise exception 'Only an admin can change a user role';
    end if;
    if (new.role in ('admin','super_admin') or old.role in ('admin','super_admin'))
       and not sportconn.is_super_admin() then
      raise exception 'Only a super_admin can grant or revoke admin / super_admin';
    end if;
  end if;
  return new;
end; $$;
-- trigger trg_users_guard_role already exists from 0001 and now uses this body.

-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------
alter table sportconn.role_permissions enable row level security;
alter table sportconn.audit_log        enable row level security;

drop policy if exists role_permissions_select on sportconn.role_permissions;
create policy role_permissions_select on sportconn.role_permissions
  for select to authenticated using (true);
drop policy if exists role_permissions_write on sportconn.role_permissions;
create policy role_permissions_write on sportconn.role_permissions
  for all to authenticated using (sportconn.is_super_admin()) with check (sportconn.is_super_admin());

drop policy if exists audit_log_select on sportconn.audit_log;
create policy audit_log_select on sportconn.audit_log
  for select to authenticated using (sportconn.is_admin());
-- no INSERT/UPDATE/DELETE policy: only the service-role Edge Function writes here.

-- ----------------------------------------------------------------------------
-- 7. Re-point DELETE policies at can_delete() for every domain table
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'facilities','captains','leads','campaigns','outreach','tasks'
  ] loop
    execute format('drop policy if exists %1$s_delete on sportconn.%1$s', t);
    execute format(
      'create policy %1$s_delete on sportconn.%1$s for delete to authenticated using (sportconn.can_delete())', t);
  end loop;
end $$;

-- activities delete stays admin-only
drop policy if exists activities_delete on sportconn.activities;
create policy activities_delete on sportconn.activities for delete to authenticated
  using (sportconn.is_admin());

-- ----------------------------------------------------------------------------
-- 8. GRANTS
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on sportconn.role_permissions to authenticated;
grant select on sportconn.audit_log to authenticated;
grant all on sportconn.role_permissions, sportconn.audit_log to service_role;

-- ----------------------------------------------------------------------------
-- 9. Promote an existing user to super_admin (edit the email, then run)
-- ----------------------------------------------------------------------------
-- update sportconn.users set role = 'super_admin' where email = 'you@sportconn.com';
--   ...and in Supabase Auth set that user's app_metadata to { "role": "super_admin" }
--   (Authentication → Users → the user → Edit → Raw app metadata). RLS reads the JWT.
