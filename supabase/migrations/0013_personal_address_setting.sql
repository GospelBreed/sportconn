-- ============================================================================
-- SportConn CRM — migration 0013: setting for personal email addresses
--
-- Until now every address on a free provider (gmail.com, yahoo.com…) was held
-- for a person to approve, with no way to change that. This adds a setting:
--   email_settings.auto_send_personal_addresses (default OFF — behaviour unchanged)
-- When it is ON, a personal address is treated like any other address: it is
-- sent automatically only if it passed verification and its source and lawful
-- basis are recorded. Do-not-contact, failed checks and management decisions
-- still apply exactly as before.
--
-- Changing the setting is written to the audit log (who, when, on/off).
-- Drafts already waiting on a personal address are released by the next
-- email-engine run (email_release_ready_drafts) once the setting is ON and
-- review is switched off — drafts a person already handled are left alone.
--
-- Run AFTER 0012. Idempotent. No function redeploy needed.
-- ============================================================================

alter table sportconn.email_settings
  add column if not exists auto_send_personal_addresses boolean not null default false;

comment on column sportconn.email_settings.auto_send_personal_addresses is
  'When true, personal addresses (gmail.com, yahoo.com…) need no manual approval; verification, source and lawful basis are still required';

-- {status: eligible | pending_review | ineligible, reason}. Replaces 0011's;
-- only the personal-address check is new (it now reads the setting).
create or replace function sportconn.email_eligibility(p_email text)
returns jsonb language plpgsql stable security definer set search_path = sportconn, public as $$
declare
  e          text := lower(trim(coalesce(p_email, '')));
  r          sportconn.contact_eligibility;
  v_by       text;
  v_personal boolean;
begin
  if e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    return jsonb_build_object('status', 'ineligible', 'reason', 'Not a valid email address');
  end if;
  if sportconn.is_suppressed(e) then
    return jsonb_build_object('status', 'ineligible', 'reason', 'On the do-not-contact list');
  end if;
  select * into r from contact_eligibility where email = e;
  if r.email is null then
    return jsonb_build_object('status', 'pending_review', 'reason', 'Source and lawful basis not recorded');
  end if;
  if r.verification_status = 'invalid' then
    return jsonb_build_object('status', 'ineligible', 'reason', 'Address failed verification');
  end if;
  if r.override = 'ineligible' then
    return jsonb_build_object('status', 'ineligible', 'reason', r.override_reason);
  end if;
  if r.override = 'eligible' then
    select full_name into v_by from users where id = r.override_by;
    return jsonb_build_object('status', 'eligible', 'reason', 'Approved by ' || coalesce(v_by, 'management') || ': ' || r.override_reason);
  end if;
  select coalesce(bool_or(auto_send_personal_addresses), false) into v_personal from email_settings;
  if sportconn.is_free_email_domain(split_part(e, '@', 2)) and not v_personal then
    return jsonb_build_object('status', 'pending_review', 'reason',
      'Personal email address — needs a person to approve it (can be changed in Settings → Email sending)');
  end if;
  if r.lawful_basis = 'none_recorded' then
    return jsonb_build_object('status', 'pending_review', 'reason', 'No lawful basis recorded');
  end if;
  if r.source_type is null then
    return jsonb_build_object('status', 'pending_review', 'reason', 'Where the address came from is not recorded');
  end if;
  if r.verification_status <> 'valid' then
    return jsonb_build_object('status', 'pending_review', 'reason',
      case
        when r.verification_status = 'risky' and r.verification_result = 'catchall'
          then 'The company''s mail server accepts every address, so this mailbox can''t be confirmed — a person must approve it'
        when r.verification_status = 'risky'
          then 'Verification flagged the address as risky'
        when r.verification_status = 'unknown' and r.verification_attempts < 3
          then 'The address couldn''t be confirmed yet — it will be checked again automatically'
        when r.verification_status = 'unknown'
          then 'The address couldn''t be confirmed after several checks — a person must approve it'
        else 'Address not verified yet — it will be checked automatically'
      end);
  end if;
  return jsonb_build_object('status', 'eligible', 'reason', 'Verified, source and lawful basis recorded');
end; $$;

revoke execute on function sportconn.email_eligibility(text) from public, anon;
grant  execute on function sportconn.email_eligibility(text) to authenticated, service_role;

-- Audit: who switched the personal-address setting, and to what.
create or replace function sportconn.email_settings_audit()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.auto_send_personal_addresses is distinct from old.auto_send_personal_addresses then
    insert into audit_log (actor_id, action, detail)
    values (coalesce(auth.uid(), new.updated_by), 'email.settings.personal_addresses',
            jsonb_build_object('auto_send_personal_addresses', new.auto_send_personal_addresses));
  end if;
  return new;
end; $$;
revoke execute on function sportconn.email_settings_audit() from public, anon, authenticated;

drop trigger if exists trg_email_settings_audit on sportconn.email_settings;
create trigger trg_email_settings_audit after update on sportconn.email_settings
  for each row execute function sportconn.email_settings_audit();
