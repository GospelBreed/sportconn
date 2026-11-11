-- ============================================================================
-- SportConn CRM — migration 0007: controlled outreach (acquisition engine, group 2)
--
--   • contact_eligibility — where each address came from, the lawful basis
--     for contacting it, and its verification result. email_eligibility()
--     turns that into eligible / pending_review / ineligible + a reason.
--   • email_messages — AI or staff drafts → human review → approved queue →
--     sent → delivered / bounced / complained. Status changes made by staff
--     are limited to review moves; sending states are set only by the system.
--   • email_settings — daily sending budget, per-domain limit, sending days
--     and hours (Lagos), minimum gap between emails to one address, review
--     requirement, pause switch.
--   • email_events — Resend webhook events (delivered, bounced, complained…),
--     idempotent. Hard bounces and complaints are suppressed automatically.
--   • Unsubscribe tokens on every queued message → permanent suppression.
--   • engine_set_eligibility / engine_create_draft / email_claim_batch /
--     email_mark_sent / email_mark_failed / email_apply_event /
--     email_unsubscribe — service role only (engine-api + email-engine).
--
-- Run AFTER 0006. Idempotent.
-- ============================================================================

-- Start of the current day in Lagos, as a timestamp.
create or replace function sportconn.lagos_day_start()
returns timestamptz language sql stable as $$
  select date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
$$;

-- Unfilled template parts that must never reach a recipient.
create or replace function sportconn.email_has_placeholders(t text)
returns boolean language sql immutable as $$
  select coalesce(t, '') ~ '\[[^]\n]{2,120}\]'
      or coalesce(t, '') ~* 'NEEDS_RESEARCH'
      or coalesce(t, '') ~ '\{[a-z_]{2,40}\}';
$$;

-- ----------------------------------------------------------------------------
-- CONTACT ELIGIBILITY — evidence per email address (not per lead)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.contact_eligibility (
  email                 text primary key,
  lead_id               uuid references sportconn.leads(id) on delete set null,
  source_type           text check (source_type is null or source_type in (
                          'company_website','linkedin','data_provider','referral','event',
                          'inbound','existing_relationship','other')),
  source_url            text,
  lawful_basis          text not null default 'none_recorded' check (lawful_basis in (
                          'consent','legitimate_interest','existing_relationship','none_recorded')),
  basis_note            text,
  verification_status   text not null default 'unverified' check (verification_status in (
                          'unverified','valid','risky','invalid','unknown')),
  verification_provider text,
  verified_at           timestamptz,
  override              text check (override is null or override in ('eligible','ineligible')),
  override_reason       text,
  override_by           uuid references sportconn.users(id) on delete set null,
  override_at           timestamptz,
  updated_by            uuid references sportconn.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint contact_eligibility_override_reason check (
    override is null or nullif(trim(coalesce(override_reason, '')), '') is not null)
);

create or replace function sportconn.contact_eligibility_guard()
returns trigger language plpgsql as $$
declare
  is_system boolean := current_user not in ('authenticated', 'anon');
  changed   boolean;
begin
  new.email := lower(trim(new.email));
  if new.email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'That isn''t a valid email address.';
  end if;
  if new.source_url is not null and new.source_url !~* '^https?://' then
    raise exception 'The source must be a web address (http/https).';
  end if;
  new.updated_at := now();
  if not is_system then
    new.updated_by := auth.uid();
  end if;

  if tg_op = 'INSERT' then
    changed := new.override is not null;
  else
    changed := new.override is distinct from old.override
            or new.override_reason is distinct from old.override_reason;
  end if;
  if changed then
    if not is_system and not sportconn.can_approve() then
      raise exception 'Only management or admins can set or remove an eligibility override.';
    end if;
    if new.override is not null then
      new.override_by := coalesce(auth.uid(), new.override_by);
      new.override_at := now();
    else
      new.override_by := null; new.override_at := null; new.override_reason := null;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_contact_eligibility_guard on sportconn.contact_eligibility;
create trigger trg_contact_eligibility_guard before insert or update on sportconn.contact_eligibility
  for each row execute function sportconn.contact_eligibility_guard();

-- {status: eligible | pending_review | ineligible, reason}
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
      case r.verification_status when 'risky' then 'Verification flagged the address as risky'
                                  else 'Address not verified yet' end);
  end if;
  return jsonb_build_object('status', 'eligible', 'reason', 'Verified, source and lawful basis recorded');
end; $$;

-- Every address on a lead (its email field + its contacts) with eligibility.
create or replace function sportconn.lead_email_eligibility(p_lead uuid)
returns table (
  email text, contact_name text, status text, reason text, source_type text, source_url text,
  lawful_basis text, basis_note text, verification_status text, verification_provider text,
  verified_at timestamptz, override text, override_reason text
) language sql stable security definer set search_path = sportconn, public as $$
  with addrs as (
    select lower(m[1]) as email, l.full_name as contact_name, 0 as ord
      from leads l, regexp_matches(coalesce(l.email, ''), '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') as m
     where l.id = p_lead
    union all
    select lower(c.email), c.full_name, 1 from lead_contacts c where c.lead_id = p_lead and c.email is not null
  ), uniq as (
    select distinct on (email) email, contact_name, ord from addrs order by email, ord
  )
  select u.email, u.contact_name,
         (sportconn.email_eligibility(u.email))->>'status',
         (sportconn.email_eligibility(u.email))->>'reason',
         ce.source_type, ce.source_url, ce.lawful_basis, ce.basis_note, ce.verification_status,
         ce.verification_provider, ce.verified_at, ce.override, ce.override_reason
    from uniq u left join contact_eligibility ce on ce.email = u.email
   order by u.ord, u.email;
$$;

-- ----------------------------------------------------------------------------
-- EMAIL SETTINGS — one row
-- ----------------------------------------------------------------------------
create table if not exists sportconn.email_settings (
  id                       boolean primary key default true check (id),
  daily_send_limit         integer not null default 15 check (daily_send_limit between 0 and 500),
  per_domain_daily_limit   integer not null default 2  check (per_domain_daily_limit between 1 and 50),
  send_days                integer[] not null default '{1,2,3,4,5}'
                           check (send_days <@ array[1,2,3,4,5,6,7] and cardinality(send_days) > 0),
  send_hour_start          integer not null default 9  check (send_hour_start between 0 and 23),
  send_hour_end            integer not null default 17 check (send_hour_end between 1 and 24),
  min_days_between_emails  integer not null default 14 check (min_days_between_emails between 0 and 365),
  require_review           boolean not null default true,
  default_sender_id        uuid references sportconn.users(id) on delete set null,
  sending_paused           boolean not null default false,
  updated_by               uuid references sportconn.users(id) on delete set null,
  updated_at               timestamptz not null default now(),
  constraint email_settings_hours check (send_hour_end > send_hour_start),
  constraint email_settings_sender check (require_review or default_sender_id is not null)
);
insert into sportconn.email_settings default values on conflict (id) do nothing;

create or replace function sportconn.email_settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end; $$;

drop trigger if exists trg_email_settings_touch on sportconn.email_settings;
create trigger trg_email_settings_touch before update on sportconn.email_settings
  for each row execute function sportconn.email_settings_touch();

-- ----------------------------------------------------------------------------
-- EMAIL MESSAGES — drafts, review, queue, delivery
-- ----------------------------------------------------------------------------
create table if not exists sportconn.email_messages (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid not null references sportconn.leads(id) on delete cascade,
  to_email                 text not null,
  to_name                  text,
  subject                  text not null check (length(trim(subject)) between 1 and 200),
  body                     text not null check (length(trim(body)) between 1 and 6000),
  origin                   text not null default 'staff' check (origin in ('ai_engine','staff')),
  status                   text not null default 'draft' check (status in (
                             'draft','approved','sending','sent','delivered','bounced','complained',
                             'failed','rejected','cancelled')),
  partnership_concept      text,
  personalization_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(personalization_evidence) = 'array'),
  facts_to_verify          jsonb not null default '[]'::jsonb check (jsonb_typeof(facts_to_verify) = 'array'),
  confidence               numeric(3,2) check (confidence is null or confidence between 0 and 1),
  sequence_step            integer not null default 1 check (sequence_step between 1 and 10),
  review_note              text,
  reviewed_by              uuid references sportconn.users(id) on delete set null,
  reviewed_at              timestamptz,
  approved_at              timestamptz,
  unsubscribe_token        uuid not null default gen_random_uuid() unique,
  provider_id              text,
  attempts                 integer not null default 0,
  claimed_at               timestamptz,
  sent_at                  timestamptz,
  delivered_at             timestamptz,
  bounced_at               timestamptz,
  complained_at            timestamptz,
  error                    text,
  outreach_id              uuid references sportconn.outreach(id) on delete set null,
  engine_run_id            uuid references sportconn.engine_runs(id) on delete set null,
  created_by               uuid references sportconn.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists idx_email_messages_status   on sportconn.email_messages(status, approved_at);
create index if not exists idx_email_messages_lead     on sportconn.email_messages(lead_id, created_at desc);
create index if not exists idx_email_messages_provider on sportconn.email_messages(provider_id);
-- one live message per address at a time
create unique index if not exists uq_email_messages_active
  on sportconn.email_messages(to_email) where status in ('draft','approved','sending');

-- Why a message can't be sent right now (null = it can).
create or replace function sportconn.email_send_blocker(p_lead uuid, p_to text, p_subject text, p_body text)
returns text language plpgsql stable security definer set search_path = sportconn, public as $$
declare
  l  sportconn.leads;
  e  text := lower(trim(coalesce(p_to, '')));
  el jsonb;
begin
  select * into l from leads where id = p_lead;
  if l.id is null then return 'The lead no longer exists'; end if;
  if l.status in ('won', 'lost') then return 'This deal is closed'; end if;
  if l.email_opt_out then return 'The lead is marked Do not email'; end if;
  if not exists (
       select 1 from regexp_matches(coalesce(l.email, ''), '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') m
        where lower(m[1]) = e)
     and not exists (select 1 from lead_contacts where lead_id = p_lead and lower(email) = e) then
    return 'The address isn''t saved on this lead or its contacts';
  end if;
  el := sportconn.email_eligibility(e);
  if el->>'status' <> 'eligible' then
    return 'Contact not eligible: ' || (el->>'reason');
  end if;
  if nullif(trim(coalesce(p_subject, '')), '') is null or nullif(trim(coalesce(p_body, '')), '') is null then
    return 'The email needs a subject and a message';
  end if;
  if sportconn.email_has_placeholders(p_subject) or sportconn.email_has_placeholders(p_body) then
    return 'The email still has placeholders to fill in';
  end if;
  return null;
end; $$;

-- Staff can review (draft ↔ approved / rejected / cancelled, retry failed) and
-- edit drafts. Sending states and provider fields belong to the system.
create or replace function sportconn.email_messages_guard()
returns trigger language plpgsql as $$
declare
  is_system boolean := current_user not in ('authenticated', 'anon');
  blocker   text;
begin
  new.to_email := lower(trim(new.to_email));
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if not is_system then
      if new.status <> 'draft' then raise exception 'New emails start as drafts.'; end if;
      new.origin := 'staff';
      new.created_by := auth.uid();
      new.reviewed_by := null; new.reviewed_at := null; new.approved_at := null;
      new.provider_id := null; new.sent_at := null; new.attempts := 0; new.outreach_id := null;
    end if;
    return new;
  end if;

  if is_system then return new; end if;

  if new.lead_id is distinct from old.lead_id or new.origin is distinct from old.origin
     or new.created_by is distinct from old.created_by or new.unsubscribe_token is distinct from old.unsubscribe_token
     or new.provider_id is distinct from old.provider_id or new.attempts is distinct from old.attempts
     or new.claimed_at is distinct from old.claimed_at or new.sent_at is distinct from old.sent_at
     or new.delivered_at is distinct from old.delivered_at or new.bounced_at is distinct from old.bounced_at
     or new.complained_at is distinct from old.complained_at or new.outreach_id is distinct from old.outreach_id
     or new.engine_run_id is distinct from old.engine_run_id then
    raise exception 'That part of the email is set by the system.';
  end if;

  if (new.subject, new.body, new.to_email, new.to_name) is distinct from (old.subject, old.body, old.to_email, old.to_name)
     and old.status <> 'draft' then
    raise exception 'Only drafts can be edited. Move it back to draft first.';
  end if;

  if new.status is distinct from old.status then
    if not (old.status, new.status) in (
         ('draft','approved'), ('draft','rejected'), ('draft','cancelled'),
         ('approved','draft'), ('approved','cancelled'),
         ('rejected','draft'), ('failed','approved')) then
      raise exception 'An email can''t move from % to %.', old.status, new.status;
    end if;
    if new.status = 'approved' then
      blocker := sportconn.email_send_blocker(new.lead_id, new.to_email, new.subject, new.body);
      if blocker is not null then raise exception 'Can''t approve: %.', blocker; end if;
      new.reviewed_by := auth.uid(); new.reviewed_at := now(); new.approved_at := now(); new.error := null;
    elsif new.status = 'rejected' then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    elsif new.status = 'draft' then
      new.approved_at := null;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_email_messages_guard on sportconn.email_messages;
create trigger trg_email_messages_guard before insert or update on sportconn.email_messages
  for each row execute function sportconn.email_messages_guard();

create or replace function sportconn.email_messages_log()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if tg_op = 'INSERT' and new.origin = 'ai_engine' then
    insert into activities (lead_id, type, description, created_by)
    values (new.lead_id, 'system', 'AI drafted an email to ' || new.to_email || ': ' || new.subject, new.created_by);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'approved' then
      insert into activities (lead_id, type, description, created_by)
      values (new.lead_id, 'system', 'Email approved for sending to ' || new.to_email || ': ' || new.subject, new.reviewed_by);
    elsif new.status = 'rejected' then
      insert into activities (lead_id, type, description, created_by)
      values (new.lead_id, 'system', 'Email draft rejected' || coalesce(': ' || nullif(new.review_note, ''), ''), new.reviewed_by);
    elsif new.status in ('bounced', 'complained') then
      insert into activities (lead_id, type, description, created_by)
      values (new.lead_id, 'system',
              case new.status when 'bounced' then 'Email bounced: ' else 'Recipient marked the email as spam: ' end
              || new.to_email || ' — address added to the do-not-contact list', null);
    end if;
  end if;
  return null;
end; $$;

drop trigger if exists trg_email_messages_log on sportconn.email_messages;
create trigger trg_email_messages_log after insert or update on sportconn.email_messages
  for each row execute function sportconn.email_messages_log();

-- ----------------------------------------------------------------------------
-- EMAIL EVENTS — provider webhooks (idempotent by event id)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.email_events (
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null unique,
  type         text not null,
  provider_id  text,
  payload      jsonb not null default '{}'::jsonb,
  received_at  timestamptz not null default now()
);
create index if not exists idx_email_events_provider on sportconn.email_events(provider_id);

-- ----------------------------------------------------------------------------
-- ENGINE: record eligibility evidence for an address
-- ----------------------------------------------------------------------------
create or replace function sportconn.engine_set_eligibility(p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  e    text := lower(trim(coalesce(p->>'email', '')));
  v    jsonb := coalesce(p->'verification', '{}'::jsonb);
  lid  uuid;
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
    verification_status   = excluded.verification_status,
    verification_provider = coalesce(excluded.verification_provider, contact_eligibility.verification_provider),
    verified_at           = coalesce(excluded.verified_at, contact_eligibility.verified_at),
    updated_by            = p_actor;

  insert into audit_log (actor_id, action, detail)
  values (p_actor, 'engine.eligibility.set', jsonb_build_object('email', e, 'lead_id', lid,
          'lawful_basis', p->>'lawful_basis', 'verification', v->>'status'));
  return jsonb_build_object('ok', true, 'email', e) || jsonb_build_object('eligibility', sportconn.email_eligibility(e));
end; $$;

-- ----------------------------------------------------------------------------
-- ENGINE: create an email draft (auto-approved only when review is switched
-- off and nothing blocks it)
-- ----------------------------------------------------------------------------
create or replace function sportconn.engine_create_draft(p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  s        sportconn.email_settings;
  lid      uuid;
  l        sportconn.leads;
  e          text := lower(trim(coalesce(p->>'to', '')));
  v_subj     text := trim(coalesce(p->>'subject', ''));
  v_body     text := trim(coalesce(p->>'body', ''));
  conf       numeric;
  v_run      uuid;
  existing   uuid;
  blocker    text;
  st         text;
  mid        uuid;
  v_to_name  text;
begin
  select * into s from email_settings limit 1;
  begin
    lid := nullif(p->>'lead_id', '')::uuid;
    v_run := nullif(p->>'run_id', '')::uuid;
    conf := nullif(p->>'confidence', '')::numeric;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_request', 'message', 'lead_id/run_id must be uuids and confidence a number');
  end;
  if lid is null then return jsonb_build_object('ok', false, 'error', 'missing_lead_id', 'message', 'lead_id is required'); end if;
  select * into l from leads where id = lid;
  if l.id is null then return jsonb_build_object('ok', false, 'error', 'lead_not_found', 'message', 'lead_id not found'); end if;
  if conf is not null and (conf < 0 or conf > 1) then
    return jsonb_build_object('ok', false, 'error', 'invalid_confidence', 'message', 'confidence must be between 0 and 1');
  end if;
  if v_run is not null and not exists (select 1 from engine_runs where id = v_run) then
    return jsonb_build_object('ok', false, 'error', 'invalid_run_id', 'message', 'run_id not found');
  end if;
  if v_subj = '' or v_body = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_content', 'message', 'subject and body are required');
  end if;
  if length(v_subj) > 200 or length(v_body) > 6000 then
    return jsonb_build_object('ok', false, 'error', 'too_long', 'message', 'subject ≤ 200 and body ≤ 6000 characters');
  end if;
  if v_body ~* 'NEEDS_RESEARCH' or v_subj ~* 'NEEDS_RESEARCH' then
    return jsonb_build_object('ok', false, 'error', 'needs_research', 'message', 'The copywriter returned NEEDS_RESEARCH; no draft was created');
  end if;
  if sportconn.email_has_placeholders(v_subj) or sportconn.email_has_placeholders(v_body) then
    return jsonb_build_object('ok', false, 'error', 'unfilled_placeholders', 'message', 'subject/body contain [placeholders] or {variables}');
  end if;
  if l.status in ('won', 'lost') then
    return jsonb_build_object('ok', false, 'error', 'lead_closed', 'message', 'The deal is closed');
  end if;
  if l.email_opt_out or sportconn.is_suppressed(e) then
    return jsonb_build_object('ok', false, 'error', 'suppressed', 'message', 'The address or lead is on the do-not-contact list');
  end if;

  select id into existing from email_messages where to_email = e and status in ('draft','approved','sending') limit 1;
  if existing is not null then
    return jsonb_build_object('ok', false, 'error', 'already_queued', 'message', 'A draft or queued email already exists for this address', 'email_id', existing);
  end if;
  if exists (select 1 from outreach
              where channel = 'email' and direction = 'outbound' and lower(recipient) = e
                and occurred_at > now() - make_interval(days => s.min_days_between_emails)) then
    return jsonb_build_object('ok', false, 'error', 'recently_contacted',
      'message', format('This address was emailed in the last %s days', s.min_days_between_emails));
  end if;

  blocker := sportconn.email_send_blocker(lid, e, v_subj, v_body);
  if blocker = 'The address isn''t saved on this lead or its contacts' then
    return jsonb_build_object('ok', false, 'error', 'address_not_on_lead', 'message', blocker);
  end if;
  st := case when not s.require_review and blocker is null and s.default_sender_id is not null then 'approved' else 'draft' end;

  select c.full_name into v_to_name from lead_contacts c where c.lead_id = lid and lower(c.email) = e limit 1;
  if v_to_name is null then v_to_name := l.full_name; end if;

  insert into email_messages (
    lead_id, to_email, to_name, subject, body, origin, status, partnership_concept,
    personalization_evidence, facts_to_verify, confidence, review_note, reviewed_by, reviewed_at, approved_at,
    engine_run_id, created_by)
  values (
    lid, e, v_to_name, v_subj, v_body, 'ai_engine', st, nullif(p->>'partnership_concept', ''),
    case when jsonb_typeof(p->'personalization_evidence') = 'array' then p->'personalization_evidence' else '[]'::jsonb end,
    case when jsonb_typeof(p->'facts_to_verify') = 'array' then p->'facts_to_verify' else '[]'::jsonb end,
    conf,
    case when st = 'approved' then 'Approved automatically (review switched off in Settings)' end,
    case when st = 'approved' then s.default_sender_id end,
    case when st = 'approved' then now() end,
    case when st = 'approved' then now() end,
    v_run, p_actor)
  returning id into mid;

  insert into audit_log (actor_id, action, detail)
  values (p_actor, 'engine.email.draft', jsonb_build_object('email_id', mid, 'lead_id', lid, 'to', e, 'status', st));

  return jsonb_build_object('ok', true, 'email_id', mid, 'status', st, 'blocker', blocker,
                            'eligibility', sportconn.email_eligibility(e));
end; $$;

-- ----------------------------------------------------------------------------
-- SENDER: claim the next batch within budget, window and per-domain limits
-- ----------------------------------------------------------------------------
create or replace function sportconn.email_claim_batch(p_max integer default 10)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  s          sportconn.email_settings;
  local_now  timestamp := now() at time zone 'Africa/Lagos';
  day_start  timestamptz := sportconn.lagos_day_start();
  sent_today integer;
  remaining  integer;
  r          record;
  blocker    text;
  dom        text;
  dom_count  integer;
  batch_dom  jsonb := '{}'::jsonb;
  out        jsonb := '[]'::jsonb;
begin
  select * into s from email_settings limit 1;

  -- reclaim messages stuck in "sending" (the sender crashed mid-batch)
  update email_messages
     set status = case when attempts >= 3 then 'failed' else 'approved' end,
         error  = 'Sending was interrupted; ' || case when attempts >= 3 then 'gave up after 3 attempts' else 'will retry' end
   where status = 'sending' and claimed_at < now() - interval '15 minutes';

  if s.sending_paused then
    return jsonb_build_object('ok', true, 'paused', true, 'messages', out);
  end if;
  if not (extract(isodow from local_now)::int = any (s.send_days)
          and extract(hour from local_now)::int >= s.send_hour_start
          and extract(hour from local_now)::int < s.send_hour_end) then
    return jsonb_build_object('ok', true, 'outside_window', true, 'messages', out);
  end if;

  select count(*) into sent_today from outreach
   where channel = 'email' and direction = 'outbound' and external_id is not null and occurred_at >= day_start;
  sent_today := sent_today + (select count(*) from email_messages where status = 'sending');
  remaining := least(greatest(coalesce(p_max, 10), 0), s.daily_send_limit - sent_today);
  if remaining <= 0 then
    return jsonb_build_object('ok', true, 'budget_reached', true, 'sent_today', sent_today, 'messages', out);
  end if;

  for r in
    select m.*, u.full_name as sender_name, u.email as sender_email
      from email_messages m
      left join users u on u.id = m.reviewed_by
     where m.status = 'approved'
     order by m.approved_at nulls last, m.created_at
     for update of m skip locked
  loop
    exit when remaining <= 0;
    blocker := sportconn.email_send_blocker(r.lead_id, r.to_email, r.subject, r.body);
    if blocker is not null then
      update email_messages set status = 'cancelled', error = blocker where id = r.id;
      continue;
    end if;
    dom := split_part(r.to_email, '@', 2);
    select count(*) into dom_count from outreach
     where channel = 'email' and direction = 'outbound' and external_id is not null
       and occurred_at >= day_start and lower(recipient) like '%@' || dom;
    dom_count := dom_count + coalesce((batch_dom->>dom)::int, 0);
    if dom_count >= s.per_domain_daily_limit then
      continue;  -- stays approved for another day
    end if;
    update email_messages set status = 'sending', attempts = attempts + 1, claimed_at = now(), error = null
     where id = r.id;
    batch_dom := batch_dom || jsonb_build_object(dom, coalesce((batch_dom->>dom)::int, 0) + 1);
    out := out || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'lead_id', r.lead_id, 'to', r.to_email, 'to_name', r.to_name,
      'subject', r.subject, 'body', r.body, 'unsubscribe_token', r.unsubscribe_token,
      'sender_name', r.sender_name, 'sender_email', r.sender_email));
    remaining := remaining - 1;
  end loop;

  return jsonb_build_object('ok', true, 'sent_today', sent_today, 'messages', out);
end; $$;

create or replace function sportconn.email_mark_sent(p_id uuid, p_provider_id text)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  m   sportconn.email_messages;
  v_out uuid;
begin
  select * into m from email_messages where id = p_id for update;
  if m.id is null or m.status <> 'sending' then
    return jsonb_build_object('ok', false, 'error', 'not_sending');
  end if;
  insert into outreach (lead_id, channel, direction, subject, body, outcome, recipient, external_id, created_by)
  values (m.lead_id, 'email', 'outbound', m.subject, m.body, 'sent', m.to_email, p_provider_id, m.reviewed_by)
  returning id into v_out;
  update email_messages
     set status = 'sent', provider_id = p_provider_id, sent_at = now(), outreach_id = v_out, error = null
   where id = p_id;
  return jsonb_build_object('ok', true, 'outreach_id', v_out);
end; $$;

create or replace function sportconn.email_mark_failed(p_id uuid, p_error text, p_retry boolean default true)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  m sportconn.email_messages;
begin
  select * into m from email_messages where id = p_id for update;
  if m.id is null or m.status <> 'sending' then
    return jsonb_build_object('ok', false, 'error', 'not_sending');
  end if;
  update email_messages
     set status = case when p_retry and m.attempts < 3 then 'approved' else 'failed' end,
         error  = left(coalesce(p_error, 'Unknown error'), 500)
   where id = p_id;
  return jsonb_build_object('ok', true, 'status', case when p_retry and m.attempts < 3 then 'approved' else 'failed' end);
end; $$;

-- ----------------------------------------------------------------------------
-- WEBHOOKS: apply a provider event (Resend) to messages, outreach, suppression
-- ----------------------------------------------------------------------------
create or replace function sportconn.email_apply_event(p_event_id text, p_type text, p_provider_id text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  inserted uuid;
  m        sportconn.email_messages;
  o        sportconn.outreach;
  rcpt     text;
  btype    text;
  lid      uuid;
begin
  insert into email_events (event_id, type, provider_id, payload)
  values (p_event_id, p_type, p_provider_id, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do nothing
  returning id into inserted;
  if inserted is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select * into m from email_messages where provider_id = p_provider_id limit 1;
  select * into o from outreach where external_id = p_provider_id limit 1;
  if m.id is null and o.id is null then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;
  rcpt := lower(coalesce(m.to_email, o.recipient, p_payload #>> '{data,to,0}'));
  lid  := coalesce(m.lead_id, o.lead_id);

  if p_type = 'email.delivered' then
    update email_messages set status = 'delivered', delivered_at = now()
     where id = m.id and status = 'sent';
  elsif p_type = 'email.bounced' then
    btype := coalesce(p_payload #>> '{data,bounce,type}', '');
    if btype ~* 'transient|temporary|undetermined|soft' then
      update email_messages set error = 'Temporary bounce: ' || coalesce(p_payload #>> '{data,bounce,message}', '')
       where id = m.id;
    else
      insert into suppressions (email, reason, source, lead_id, note)
      values (rcpt, 'bounced', 'resend', lid, left(p_payload #>> '{data,bounce,message}', 300))
      on conflict (email) where email is not null do nothing;
      update outreach set outcome = 'bounced' where id = o.id;
      update email_messages
         set status = 'bounced', bounced_at = now(),
             error = coalesce(p_payload #>> '{data,bounce,message}', 'Bounced')
       where id = m.id;
      if m.id is null and lid is not null then
        insert into activities (lead_id, type, description) values
          (lid, 'system', 'Email bounced: ' || rcpt || ' — address added to the do-not-contact list');
      end if;
    end if;
  elsif p_type = 'email.complained' then
    insert into suppressions (email, reason, source, lead_id)
    values (rcpt, 'complained', 'resend', lid)
    on conflict (email) where email is not null do nothing;
    update email_messages set status = 'complained', complained_at = now() where id = m.id;
    if m.id is null and lid is not null then
      insert into activities (lead_id, type, description) values
        (lid, 'system', 'Recipient marked the email as spam: ' || rcpt || ' — address added to the do-not-contact list');
    end if;
  elsif p_type = 'email.opened' then
    update outreach set outcome = 'opened' where id = o.id and outcome = 'sent';
  end if;

  return jsonb_build_object('ok', true, 'matched', true, 'email_id', m.id, 'outreach_id', o.id);
end; $$;

-- ----------------------------------------------------------------------------
-- UNSUBSCRIBE by message token → permanent suppression
-- ----------------------------------------------------------------------------
create or replace function sportconn.email_unsubscribe(p_token uuid)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  m        sportconn.email_messages;
  was      boolean;
begin
  select * into m from email_messages where unsubscribe_token = p_token;
  if m.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  was := exists (select 1 from suppressions where email = m.to_email);
  insert into suppressions (email, reason, source, lead_id, note)
  values (m.to_email, 'unsubscribed', 'unsubscribe_link', m.lead_id, 'Unsubscribed from: ' || left(m.subject, 150))
  on conflict (email) where email is not null do nothing;
  update email_messages set status = 'cancelled', error = 'Recipient unsubscribed'
   where to_email = m.to_email and status in ('draft', 'approved');
  if not was then
    insert into activities (lead_id, type, description)
    values (m.lead_id, 'system', m.to_email || ' unsubscribed using the link in an email');
  end if;
  return jsonb_build_object('ok', true, 'email', m.to_email, 'already', was);
end; $$;

-- ----------------------------------------------------------------------------
-- PERMISSIONS
-- ----------------------------------------------------------------------------
revoke all on function sportconn.engine_set_eligibility(jsonb, uuid) from public, anon, authenticated;
revoke all on function sportconn.engine_create_draft(jsonb, uuid) from public, anon, authenticated;
revoke all on function sportconn.email_claim_batch(integer) from public, anon, authenticated;
revoke all on function sportconn.email_mark_sent(uuid, text) from public, anon, authenticated;
revoke all on function sportconn.email_mark_failed(uuid, text, boolean) from public, anon, authenticated;
revoke all on function sportconn.email_apply_event(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function sportconn.email_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function
  sportconn.engine_set_eligibility(jsonb, uuid), sportconn.engine_create_draft(jsonb, uuid),
  sportconn.email_claim_batch(integer), sportconn.email_mark_sent(uuid, text),
  sportconn.email_mark_failed(uuid, text, boolean), sportconn.email_apply_event(text, text, text, jsonb),
  sportconn.email_unsubscribe(uuid)
  to service_role;
grant execute on function
  sportconn.email_eligibility(text), sportconn.lead_email_eligibility(uuid),
  sportconn.email_send_blocker(uuid, text, text, text), sportconn.lagos_day_start(),
  sportconn.email_has_placeholders(text)
  to authenticated, service_role;

alter table sportconn.contact_eligibility enable row level security;
alter table sportconn.email_settings      enable row level security;
alter table sportconn.email_messages      enable row level security;
alter table sportconn.email_events        enable row level security;

drop policy if exists contact_eligibility_select on sportconn.contact_eligibility;
create policy contact_eligibility_select on sportconn.contact_eligibility for select to authenticated using (true);
drop policy if exists contact_eligibility_insert on sportconn.contact_eligibility;
create policy contact_eligibility_insert on sportconn.contact_eligibility for insert to authenticated with check (sportconn.can_write());
drop policy if exists contact_eligibility_update on sportconn.contact_eligibility;
create policy contact_eligibility_update on sportconn.contact_eligibility for update to authenticated
  using (sportconn.can_write()) with check (sportconn.can_write());

drop policy if exists email_settings_select on sportconn.email_settings;
create policy email_settings_select on sportconn.email_settings for select to authenticated using (true);
drop policy if exists email_settings_update on sportconn.email_settings;
create policy email_settings_update on sportconn.email_settings for update to authenticated
  using (sportconn.can_approve()) with check (sportconn.can_approve());

drop policy if exists email_messages_select on sportconn.email_messages;
create policy email_messages_select on sportconn.email_messages for select to authenticated using (true);
drop policy if exists email_messages_insert on sportconn.email_messages;
create policy email_messages_insert on sportconn.email_messages for insert to authenticated with check (sportconn.can_write());
drop policy if exists email_messages_update on sportconn.email_messages;
create policy email_messages_update on sportconn.email_messages for update to authenticated
  using (sportconn.can_write()) with check (sportconn.can_write());

drop policy if exists email_events_select on sportconn.email_events;
create policy email_events_select on sportconn.email_events for select to authenticated using (true);

grant select, insert, update on sportconn.contact_eligibility, sportconn.email_messages to authenticated;
grant select, update on sportconn.email_settings to authenticated;
grant select on sportconn.email_events to authenticated;
grant all on sportconn.contact_eligibility, sportconn.email_settings, sportconn.email_messages,
  sportconn.email_events to service_role;

do $$ begin alter publication supabase_realtime add table sportconn.email_messages; exception when others then null; end $$;
