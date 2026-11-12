-- ============================================================================
-- SportConn CRM — migration 0011: automatic address verification (NeverBounce)
--
-- Every address recorded in contact_eligibility is checked with NeverBounce by
-- the CRM itself — nobody has to run a check or type a result:
--   • email_verify_claim()   hands the email-engine (/run) the next addresses
--     to check: not checked yet, or "couldn't verify" (retried up to 3 times,
--     a day apart). Generic inboxes, do-not-contact addresses and addresses
--     with a management decision are skipped (no credits spent on them).
--   • email_verify_record()  stores NeverBounce's answer:
--         valid → Verified · catchall → Risky · invalid / disposable → Invalid
--         unknown → Couldn't verify (retried later)
--     A temporary failure (NeverBounce busy, network) is retried later.
--     Invalid → the engine's drafts to that address are cancelled.
--   • email_release_ready_drafts()  with review switched off, an AI draft that
--     was held only because a check hadn't passed yet is approved as soon as
--     nothing blocks it (it then goes out in the next sending window). Drafts a
--     person has already handled (approved, sent back, rejected) are left alone.
--   • email_eligibility() explains catch-all / couldn't-verify in plain words.
--   • engine_set_eligibility() keeps a stored check when "verification" is left out.
--
-- Run AFTER 0010. Idempotent.
-- ============================================================================

alter table sportconn.contact_eligibility
  add column if not exists verification_result   text,
  add column if not exists verification_attempts integer not null default 0,
  add column if not exists verification_next_at  timestamptz,
  add column if not exists verification_error    text;

comment on column sportconn.contact_eligibility.verification_result is
  'Raw answer of the verification service (NeverBounce: valid, invalid, disposable, catchall, unknown)';
comment on column sportconn.contact_eligibility.verification_next_at is
  'Not checked again before this time (retry spacing, and a short lease while a check runs)';

create index if not exists contact_eligibility_to_verify_idx
  on sportconn.contact_eligibility (verification_next_at)
  where verification_status in ('unverified', 'unknown');

-- {status: eligible | pending_review | ineligible, reason}. Replaces 0007's;
-- only the catch-all / couldn't-verify wording is new.
create or replace function sportconn.email_eligibility(p_email text)
returns jsonb language plpgsql stable security definer set search_path = sportconn, public as $$
declare
  e    text := lower(trim(coalesce(p_email, '')));
  r    sportconn.contact_eligibility;
  v_by text;
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
  if sportconn.is_free_email_domain(split_part(e, '@', 2)) then
    return jsonb_build_object('status', 'pending_review', 'reason', 'Personal email address — needs a person to approve it');
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

-- Record where an address came from. Replaces 0007's: leaving "verification"
-- out now keeps the stored result (re-recording a source no longer resets a
-- checked address to "Not checked", which would pay for the check again).
create or replace function sportconn.engine_set_eligibility(p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  e     text := lower(trim(coalesce(p->>'email', '')));
  v     jsonb := coalesce(p->'verification', '{}'::jsonb);
  v_set boolean := nullif(p->'verification'->>'status', '') is not null;
  lid   uuid;
begin
  if e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email', 'message', 'email is not a valid address');
  end if;
  if coalesce(p->>'source_type', '') not in ('company_website','linkedin','data_provider','referral','event','inbound','existing_relationship','other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_source_type', 'message',
      'source_type must be company_website, linkedin, data_provider, referral, event, inbound, existing_relationship or other');
  end if;
  if nullif(p->>'source_url', '') is not null and p->>'source_url' !~* '^https?://' then
    return jsonb_build_object('ok', false, 'error', 'invalid_source_url', 'message', 'source_url must be an http(s) URL');
  end if;
  if coalesce(p->>'lawful_basis', 'none_recorded') not in ('consent','legitimate_interest','existing_relationship','none_recorded') then
    return jsonb_build_object('ok', false, 'error', 'invalid_lawful_basis', 'message',
      'lawful_basis must be consent, legitimate_interest, existing_relationship or none_recorded');
  end if;
  if coalesce(v->>'status', 'unverified') not in ('unverified','valid','risky','invalid','unknown') then
    return jsonb_build_object('ok', false, 'error', 'invalid_verification', 'message',
      'verification.status must be unverified, valid, risky, invalid or unknown');
  end if;
  begin
    lid := nullif(p->>'lead_id', '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_lead_id', 'message', 'lead_id must be a uuid');
  end;
  if lid is not null and not exists (select 1 from leads where id = lid) then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found', 'message', 'lead_id not found');
  end if;

  insert into contact_eligibility (email, lead_id, source_type, source_url, lawful_basis, basis_note,
                                   verification_status, verification_provider, verified_at, updated_by)
  values (e, lid, p->>'source_type', nullif(p->>'source_url', ''),
          coalesce(nullif(p->>'lawful_basis', ''), 'none_recorded'), nullif(p->>'basis_note', ''),
          coalesce(nullif(v->>'status', ''), 'unverified'), nullif(v->>'provider', ''),
          case when coalesce(v->>'status', 'unverified') = 'unverified' then null
               else coalesce(nullif(v->>'checked_at', '')::timestamptz, now()) end,
          p_actor)
  on conflict (email) do update set
    lead_id               = coalesce(excluded.lead_id, contact_eligibility.lead_id),
    source_type           = excluded.source_type,
    source_url            = coalesce(excluded.source_url, contact_eligibility.source_url),
    lawful_basis          = excluded.lawful_basis,
    basis_note            = coalesce(excluded.basis_note, contact_eligibility.basis_note),
    verification_status   = case when v_set then excluded.verification_status else contact_eligibility.verification_status end,
    verification_provider = case when v_set then coalesce(excluded.verification_provider, contact_eligibility.verification_provider)
                                 else contact_eligibility.verification_provider end,
    verified_at           = case when v_set then coalesce(excluded.verified_at, contact_eligibility.verified_at)
                                 else contact_eligibility.verified_at end,
    updated_by            = p_actor;

  insert into audit_log (actor_id, action, detail)
  values (p_actor, 'engine.eligibility.set', jsonb_build_object('email', e, 'lead_id', lid,
          'lawful_basis', p->>'lawful_basis', 'verification', v->>'status'));
  return jsonb_build_object('ok', true, 'email', e) || jsonb_build_object('eligibility', sportconn.email_eligibility(e));
end; $$;

-- Next addresses to check. Each claimed address is leased for 10 minutes so
-- overlapping runs can't pay for the same check twice.
create or replace function sportconn.email_verify_claim(p_max integer default 5)
returns setof text language plpgsql security definer set search_path = sportconn, public as $$
begin
  return query
  with picked as (
    select ce.email
      from contact_eligibility ce
     where (ce.verification_status = 'unverified'
            or (ce.verification_status = 'unknown' and ce.verification_attempts < 3))
       and ce.override is null
       and coalesce(ce.verification_next_at, '-infinity') <= now()
       and not sportconn.is_generic_inbox(ce.email)
       and not sportconn.is_suppressed(ce.email)
     order by
       -- addresses with an email waiting on them first
       (exists (select 1 from email_messages m where m.to_email = ce.email and m.status = 'draft')) desc,
       ce.updated_at
     limit greatest(1, least(coalesce(p_max, 5), 25))
     for update skip locked
  ), leased as (
    update contact_eligibility ce
       set verification_next_at = now() + interval '10 minutes'
      from picked
     where ce.email = picked.email
    returning ce.email
  )
  select leased.email from leased;
end; $$;

-- Approve AI drafts that were held only by checks that have since passed
-- (review switched off, a default sender set, nothing blocking). p_email limits
-- it to one address. Returns how many were approved.
create or replace function sportconn.email_release_ready_drafts(p_email text default null, p_max integer default 50)
returns integer language plpgsql security definer set search_path = sportconn, public as $$
declare
  s sportconn.email_settings;
  m sportconn.email_messages;
  n integer := 0;
begin
  select * into s from email_settings limit 1;
  if s.require_review or s.default_sender_id is null then return 0; end if;

  for m in
    select * from email_messages
     where status = 'draft' and origin = 'ai_engine' and reviewed_at is null
       and (p_email is null or to_email = lower(trim(p_email)))
     order by created_at
     limit greatest(1, least(coalesce(p_max, 50), 200))
     for update skip locked
  loop
    if sportconn.email_message_blocker(m.lead_id, m.to_email, m.subject, m.body, m.follow_up_of) is null then
      update email_messages
         set status = 'approved',
             review_note = 'Approved automatically once the address checks passed (review switched off in Settings)',
             reviewed_by = s.default_sender_id, reviewed_at = now(), approved_at = now(), error = null
       where id = m.id;
      insert into audit_log (actor_id, action, detail)
      values (null, 'engine.email.released', jsonb_build_object('email_id', m.id, 'lead_id', m.lead_id, 'to', m.to_email));
      n := n + 1;
    end if;
  end loop;
  return n;
end; $$;

-- Store a verification answer. p_result = NeverBounce's result, or null with
-- p_error when the check itself failed (it is then retried later).
create or replace function sportconn.email_verify_record(p_email text, p_result text, p_error text default null)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  e         text := lower(trim(coalesce(p_email, '')));
  res       text := lower(trim(coalesce(p_result, '')));
  r         sportconn.contact_eligibility;
  v_status  text;
  released  integer := 0;
  cancelled integer := 0;
begin
  select * into r from contact_eligibility where email = e for update;
  if r.email is null then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'message', 'No source is recorded for that address');
  end if;

  -- The check didn't happen (service busy, network…): try again in an hour, at most 3 times.
  if res = '' then
    update contact_eligibility
       set verification_attempts = verification_attempts + 1,
           verification_error = left(coalesce(nullif(p_error, ''), 'The check failed'), 500),
           verification_next_at = now() + interval '1 hour'
     where email = e;
    return jsonb_build_object('ok', true, 'email', e, 'checked', false);
  end if;

  v_status := case res
                when 'valid'      then 'valid'
                when 'catchall'   then 'risky'
                when 'invalid'    then 'invalid'
                when 'disposable' then 'invalid'
                when 'unknown'    then 'unknown'
              end;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_result', 'message', 'Unrecognised verification result: ' || res);
  end if;

  update contact_eligibility
     set verification_status   = v_status,
         verification_result   = res,
         verification_provider = 'NeverBounce',
         verified_at           = now(),
         verification_error    = null,
         verification_attempts = verification_attempts + 1,
         -- "couldn't verify" is often temporary: look again tomorrow
         verification_next_at  = case when v_status = 'unknown' then now() + interval '1 day' end
   where email = e;

  insert into audit_log (actor_id, action, detail)
  values (null, 'engine.eligibility.verified', jsonb_build_object('email', e, 'provider', 'NeverBounce', 'result', res, 'status', v_status));

  if v_status = 'invalid' then
    with c as (
      update email_messages
         set status = 'cancelled',
             error = 'Cancelled automatically: NeverBounce says this address can''t receive email (' || res || ')'
       where to_email = e and origin = 'ai_engine' and status in ('draft', 'approved')
      returning lead_id
    ), logged as (
      insert into activities (lead_id, type, description, created_by)
      select distinct lead_id, 'system',
             'Queued email to ' || e || ' cancelled: NeverBounce says the address can''t receive email', null::uuid
        from c
      returning 1
    )
    select count(*) into cancelled from c;
  elsif v_status = 'valid' then
    released := sportconn.email_release_ready_drafts(e);
  end if;

  return jsonb_build_object('ok', true, 'email', e, 'checked', true, 'result', res, 'verification_status', v_status,
                            'released', released, 'cancelled', cancelled,
                            'eligibility', sportconn.email_eligibility(e));
end; $$;

-- CLAUDE.md rule 14: no function callable with the public key.
revoke execute on function sportconn.engine_set_eligibility(jsonb, uuid) from public, anon, authenticated;
grant  execute on function sportconn.engine_set_eligibility(jsonb, uuid) to service_role;
revoke execute on function sportconn.email_eligibility(text) from public, anon;
grant  execute on function sportconn.email_eligibility(text) to authenticated, service_role;
revoke execute on function sportconn.email_verify_claim(integer) from public, anon, authenticated;
grant  execute on function sportconn.email_verify_claim(integer) to service_role;
revoke execute on function sportconn.email_release_ready_drafts(text, integer) from public, anon, authenticated;
grant  execute on function sportconn.email_release_ready_drafts(text, integer) to service_role;
revoke execute on function sportconn.email_verify_record(text, text, text) from public, anon, authenticated;
grant  execute on function sportconn.email_verify_record(text, text, text) to service_role;
