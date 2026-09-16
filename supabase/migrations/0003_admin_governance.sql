-- ============================================================================
-- Roseway CRM — migration 0003: admin governance
--
-- Adds a `super_admin` tier above `admin` and the machinery for it to govern
-- the platform:
--   • role hierarchy         super_admin > admin > case_manager > read_only
--   • roseway.role_permissions   editable capability matrix per role
--   • roseway.audit_log          record of user-management actions
--   • helpers is_super_admin() / can_delete(); can_write()/is_admin() updated
--   • RLS: delete gated by can_delete(); matrix editable only by super_admin
--
-- Privileged auth operations (create user, delete user, ban/unban, set role in
-- app_metadata) run in the `manage-users` Edge Function with the service-role
-- key — never in the browser. This migration only prepares the database.
--
-- Run AFTER 0002_dealflow.sql. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROLE HIERARCHY
-- ----------------------------------------------------------------------------
alter table roseway.users drop constraint if exists users_role_check;
alter table roseway.users add constraint users_role_check
  check (role in ('super_admin','admin','case_manager','read_only'));

-- roseway.users.is_active already exists (0001); the manage-users function flips it.

-- super_admin inherits every admin-gated policy
create or replace function roseway.is_admin()
returns boolean language sql stable as $$
  select roseway.jwt_role() in ('admin','super_admin');
$$;

create or replace function roseway.is_super_admin()
returns boolean language sql stable as $$
  select roseway.jwt_role() = 'super_admin';
$$;

-- ----------------------------------------------------------------------------
-- 2. ROLE PERMISSIONS MATRIX
-- ----------------------------------------------------------------------------
create table if not exists roseway.role_permissions (
  role                 text primary key
                       check (role in ('super_admin','admin','case_manager','read_only')),
  can_manage_users     boolean not null default false,  -- create/delete/disable users, set admin+ roles
  can_edit_permissions boolean not null default false,  -- edit this matrix
  can_manage_staff     boolean not null default false,  -- edit staff profiles, set case_manager/read_only roles
  can_write            boolean not null default false,  -- create / update records
  can_delete           boolean not null default false,  -- delete records
  can_export           boolean not null default false,  -- CSV export
  can_import           boolean not null default false,  -- CSV import
  nav                  jsonb   not null default '{}'::jsonb,  -- { "<section>": bool }
  updated_at           timestamptz not null default now(),
  updated_by           uuid references roseway.users(id) on delete set null
);

-- default matrix (matches behaviour prior to 0003)
insert into roseway.role_permissions
  (role, can_manage_users, can_edit_permissions, can_manage_staff, can_write, can_delete, can_export, can_import, nav)
values
  ('super_admin', true,  true,  true,  true,  true,  true,  true,
   '{"dashboard":true,"leads":true,"pipeline":true,"cases":true,"residents":true,"properties":true,"experience":true,"outreach":true,"tasks":true,"analytics":true,"campaigns":true}'::jsonb),
  ('admin', false, false, true,  true,  true,  true,  true,
   '{"dashboard":true,"leads":true,"pipeline":true,"cases":true,"residents":true,"properties":true,"experience":true,"outreach":true,"tasks":true,"analytics":true,"campaigns":true}'::jsonb),
  ('case_manager', false, false, false, true, false, true, true,
   '{"dashboard":true,"leads":true,"pipeline":true,"cases":true,"residents":true,"properties":true,"experience":true,"outreach":true,"tasks":true,"analytics":true,"campaigns":true}'::jsonb),
  ('read_only', false, false, false, false, false, false, false,
   '{"dashboard":true,"leads":true,"pipeline":true,"cases":true,"residents":true,"properties":true,"experience":true,"outreach":true,"tasks":true,"analytics":true,"campaigns":true}'::jsonb)
on conflict (role) do nothing;

drop trigger if exists trg_role_permissions_updated on roseway.role_permissions;
create trigger trg_role_permissions_updated before update on roseway.role_permissions
  for each row execute function roseway.touch_updated_at();

-- super_admin's own governance powers cannot be revoked, and its row cannot be
-- deleted — otherwise the platform could be locked out of user management.
create or replace function roseway.guard_role_permissions()
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

drop trigger if exists trg_guard_role_permissions on roseway.role_permissions;
create trigger trg_guard_role_permissions
  before update or delete on roseway.role_permissions
  for each row execute function roseway.guard_role_permissions();

-- ----------------------------------------------------------------------------
-- 3. CAPABILITY HELPERS (consult the matrix for non-privileged roles)
-- ----------------------------------------------------------------------------
create or replace function roseway.can_write()
returns boolean language sql stable as $$
  select case roseway.jwt_role()
    when 'super_admin' then true
    when 'admin' then true
    when 'case_manager' then
      coalesce((select can_write from roseway.role_permissions where role = 'case_manager'), true)
    else false
  end;
$$;

create or replace function roseway.can_delete()
returns boolean language sql stable as $$
  select case roseway.jwt_role()
    when 'super_admin' then true
    when 'admin' then
      coalesce((select can_delete from roseway.role_permissions where role = 'admin'), true)
    when 'case_manager' then
      coalesce((select can_delete from roseway.role_permissions where role = 'case_manager'), false)
    else false
  end;
$$;

-- ----------------------------------------------------------------------------
-- 4. AUDIT LOG (written by the Edge Function via service role)
-- ----------------------------------------------------------------------------
create table if not exists roseway.audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references roseway.users(id) on delete set null,
  actor_email    text,
  action         text not null,          -- user.create | user.delete | user.set_role | user.set_active | permissions.update
  target_user_id uuid references roseway.users(id) on delete set null,
  target_email   text,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_audit_created on roseway.audit_log(created_at desc);

-- ----------------------------------------------------------------------------
-- 5. GUARD: who may set which role (defence-in-depth behind the Edge Function)
-- ----------------------------------------------------------------------------
create or replace function roseway.users_guard_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role then
    if not roseway.is_admin() then
      raise exception 'Only an admin can change a user role';
    end if;
    if (new.role in ('admin','super_admin') or old.role in ('admin','super_admin'))
       and not roseway.is_super_admin() then
      raise exception 'Only a super_admin can grant or revoke admin / super_admin';
    end if;
  end if;
  return new;
end; $$;
-- trigger trg_users_guard_role already exists from 0001 and now uses the new body.

-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------
alter table roseway.role_permissions enable row level security;
alter table roseway.audit_log        enable row level security;

drop policy if exists role_permissions_select on roseway.role_permissions;
create policy role_permissions_select on roseway.role_permissions
  for select to authenticated using (true);
drop policy if exists role_permissions_write on roseway.role_permissions;
create policy role_permissions_write on roseway.role_permissions
  for all to authenticated using (roseway.is_super_admin()) with check (roseway.is_super_admin());

drop policy if exists audit_log_select on roseway.audit_log;
create policy audit_log_select on roseway.audit_log
  for select to authenticated using (roseway.is_admin());
-- no INSERT/UPDATE/DELETE policy: only the service-role Edge Function writes here.

-- ----------------------------------------------------------------------------
-- 7. Re-point DELETE policies at can_delete()
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'properties','residents','cases','leads','campaigns','outreach','tasks','experience_assessments'
  ] loop
    execute format('drop policy if exists %1$s_delete on roseway.%1$s', t);
    execute format(
      'create policy %1$s_delete on roseway.%1$s for delete to authenticated using (roseway.can_delete())', t);
  end loop;
end $$;

-- activities delete stays admin-only
drop policy if exists activities_delete on roseway.activities;
create policy activities_delete on roseway.activities for delete to authenticated
  using (roseway.is_admin());

-- ----------------------------------------------------------------------------
-- 8. GRANTS
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on roseway.role_permissions to authenticated;
grant select on roseway.audit_log to authenticated;
grant all on roseway.role_permissions, roseway.audit_log to service_role;

-- ----------------------------------------------------------------------------
-- 9. Promote an existing user to super_admin (edit the email, then run)
-- ----------------------------------------------------------------------------
-- update roseway.users set role = 'super_admin' where email = 'you@rosewayresident.com';
--   ...and in Supabase Auth set that user's app_metadata to { "role": "super_admin" }
--   (Authentication → Users → the user → Edit → Raw app metadata). RLS reads the JWT.
