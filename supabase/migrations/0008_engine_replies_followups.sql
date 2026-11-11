-- ============================================================================
-- SportConn CRM — migration 0008: replies, follow-ups, engine dashboard
-- (acquisition engine, group 3)
--
--   • email_replies — inbound replies (Resend receiving). Every queue email
--     gets a reply address reply+<token>@<REPLY_DOMAIN>, so a reply is matched
--     to its exact email and lead; otherwise matched by the sender's address.
--     A reply: is logged on the timeline (inbound outreach), marks the email
--     replied, cancels pending follow-ups, notifies the approver and owner.
--   • Follow-ups: email_messages.follow_up_of chains a follow-up to the email
--     it follows. At most email_settings.max_followups (≤ 2), spaced by
--     followup_1_after_days / followup_2_after_days, and blocked — at approval
--     and again at send time — once anyone at the company has replied.
--   • engine_classify_reply — the engine's reading of a reply (interested,
--     meeting requested, needs information, not interested, unsubscribe, out of
--     office, other) with the matching CRM effects.
--   • get_engine_dashboard(from, to) — the blueprint's acquisition metrics.
--   • Per-company daily limit no longer treats gmail.com, yahoo.com… as one
--     company.
--
-- Run AFTER 0007. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SETTINGS + MESSAGE COLUMNS
-- ----------------------------------------------------------------------------
alter table sportconn.email_settings
  add column if not exists max_followups         integer not null default 2 check (max_followups between 0 and 2),
  add column if not exists followup_1_after_days integer not null default 4 check (followup_1_after_days between 1 and 60),
  add column if not exists followup_2_after_days integer not null default 7 check (followup_2_after_days between 1 and 60);

alter table sportconn.email_messages
  add column if not exists follow_up_of uuid references sportconn.email_messages(id) on delete set null,
  add column if not exists reply_token  uuid not null default gen_random_uuid(),
  add column if not exists replied_at   timestamptz;
create unique index if not exists uq_email_messages_reply_token on sportconn.email_messages(reply_token);
create index if not exists idx_email_messages_follow_up_of on sportconn.email_messages(follow_up_of);
create index if not exists idx_email_messages_sent_at on sportconn.email_messages(sent_at);

-- notifications gain 'email_reply'
alter table sportconn.notifications drop constraint if exists notifications_type_check;
alter table sportconn.notifications add constraint notifications_type_check check (type in (
  'follow_up_due','follow_up_overdue','lead_assigned','stage_change',
  'task_assigned','task_due','task_overdue','deal_won','deal_lost','email_reply'));

-- ----------------------------------------------------------------------------
-- EMAIL REPLIES
-- ----------------------------------------------------------------------------
create table if not exists sportconn.email_replies (
  id                 uuid primary key default gen_random_uuid(),
  provider_id        text not null unique,
  lead_id            uuid references sportconn.leads(id) on delete set null,
  email_message_id   uuid references sportconn.email_messages(id) on delete set null,
  matched_by         text not null default 'none' check (matched_by in ('reply_address','sender_address','none')),
  from_email         text not null,
  from_name          text,
  to_addresses       jsonb not null default '[]'::jsonb check (jsonb_typeof(to_addresses) = 'array'),
  subject            text,
  body_text          text,
  received_at        timestamptz not null default now(),
  classification     text check (classification is null or classification in (
                       'interested','meeting_requested','needs_information','not_interested',
                       'unsubscribe','out_of_office','other')),
  summary            text,
  suggested_response text,
  classified_by      text check (classified_by is null or classified_by in ('ai','staff')),
  classified_at      timestamptz,
  handled            boolean not null default false,
  handled_by         uuid references sportconn.users(id) on delete set null,
  handled_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists idx_email_replies_lead     on sportconn.email_replies(lead_id, received_at desc);
create index if not exists idx_email_replies_from     on sportconn.email_replies(lower(from_email), received_at desc);
create index if not exists idx_email_replies_received on sportconn.email_replies(received_at desc);

-- Staff may only classify and mark handled; everything else is the system's.
create or replace function sportconn.email_replies_guard()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (new.provider_id, new.lead_id, new.email_message_id, new.matched_by, new.from_email, new.from_name,
      new.to_addresses, new.subject, new.body_text, new.received_at)
     is distinct from
     (old.provider_id, old.lead_id, old.email_message_id, old.matched_by, old.from_email, old.from_name,
      old.to_addresses, old.subject, old.body_text, old.received_at) then
    raise exception 'Only the reply''s category and handled status can be changed.';
  end if;
  if new.classification is distinct from old.classification then
    new.classified_by := 'staff'; new.classified_at := now();
  end if;
  if new.handled and not old.handled then
    new.handled_by := auth.uid(); new.handled_at := now();
  elsif not new.handled then
    new.handled_by := null; new.handled_at := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_email_replies_guard on sportconn.email_replies;
create trigger trg_email_replies_guard before update on sportconn.email_replies
  for each row execute function sportconn.email_replies_guard();

-- ----------------------------------------------------------------------------
-- FOLLOW-UP BLOCKER + combined blocker
-- ----------------------------------------------------------------------------
create or replace function sportconn.email_followup_blocker(p_lead uuid, p_to text, p_follow_up_of uuid)
returns text language plpgsql stable security definer set search_path = sportconn, public as $$
declare
  par sportconn.email_messages;
begin
  if p_follow_up_of is null then return null; end if;
  select * into par from email_messages where id = p_follow_up_of;
  if par.id is null then return 'The email it follows no longer exists'; end if;
  if par.status in ('bounced', 'complained') then return 'The earlier email bounced or was reported as spam'; end if;
  if par.sent_at is null then return 'The earlier email hasn''t been sent yet'; end if;
  if exists (select 1 from email_replies
              where received_at >= par.sent_at
                and (lead_id = p_lead or lower(from_email) = lower(trim(coalesce(p_to, ''))))) then
    return 'They replied, so automatic follow-ups have stopped';
  end if;
  return null;
end; $$;

create or replace function sportconn.email_message_blocker(p_lead uuid, p_to text, p_subject text, p_body text, p_follow_up_of uuid)
returns text language sql stable security definer set search_path = sportconn, public as $$
  select coalesce(sportconn.email_send_blocker(p_lead, p_to, p_subject, p_body),
                  sportconn.email_followup_blocker(p_lead, p_to, p_follow_up_of));
$$;

-- Review guard (0007) now also checks the follow-up rules and protects the new columns.
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
      new.follow_up_of := null; new.replied_at := null; new.sequence_step := 1;
    end if;
    return new;
  end if;

  if is_system then return new; end if;

  if new.lead_id is distinct from old.lead_id or new.origin is distinct from old.origin
     or new.created_by is distinct from old.created_by or new.unsubscribe_token is distinct from old.unsubscribe_token
     or new.reply_token is distinct from old.reply_token or new.follow_up_of is distinct from old.follow_up_of
     or new.sequence_step is distinct from old.sequence_step or new.replied_at is distinct from old.replied_at
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
      blocker := sportconn.email_message_blocker(new.lead_id, new.to_email, new.subject, new.body, new.follow_up_of);
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

-- ----------------------------------------------------------------------------
-- ENGINE: create a draft — first email or follow-up (replaces 0007's version)
--   follow-ups: p.follow_up_of = the sent email they follow
-- ----------------------------------------------------------------------------
create or replace function sportconn.engine_create_draft(p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  s          sportconn.email_settings;
  lid        uuid;
  l          sportconn.leads;
  par        sportconn.email_messages;
  e          text := lower(trim(coalesce(p->>'to', '')));
  v_subj     text := trim(coalesce(p->>'subject', ''));
  v_body     text := trim(coalesce(p->>'body', ''));
  conf       numeric;
  v_run      uuid;
  v_parent   uuid;
  v_step     integer := 1;
  v_gap      integer;
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
    v_parent := nullif(p->>'follow_up_of', '')::uuid;
    conf := nullif(p->>'confidence', '')::numeric;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_request', 'message', 'lead_id/run_id/follow_up_of must be uuids and confidence a number');
  end;

  -- a follow-up inherits lead and address from the email it follows
  if v_parent is not null then
    select * into par from email_messages where id = v_parent;
    if par.id is null then
      return jsonb_build_object('ok', false, 'error', 'follow_up_of_not_found', 'message', 'follow_up_of not found');
    end if;
    if lid is null then lid := par.lead_id; end if;
    if e = '' then e := par.to_email; end if;
    if lid <> par.lead_id or e <> par.to_email then
      return jsonb_build_object('ok', false, 'error', 'follow_up_mismatch', 'message', 'A follow-up goes to the same lead and address as the email it follows');
    end if;
    if par.status not in ('sent', 'delivered') then
      return jsonb_build_object('ok', false, 'error', 'follow_up_not_due', 'message', 'The earlier email has not been sent, or it bounced');
    end if;
    if par.sequence_step > s.max_followups then
      return jsonb_build_object('ok', false, 'error', 'max_followups', 'message', format('At most %s follow-ups per contact', s.max_followups));
    end if;
    if exists (select 1 from email_messages where follow_up_of = par.id and status not in ('rejected', 'cancelled')) then
      return jsonb_build_object('ok', false, 'error', 'already_followed_up', 'message', 'That email already has a follow-up');
    end if;
    v_gap := case when par.sequence_step = 1 then s.followup_1_after_days else s.followup_2_after_days end;
    if par.sent_at > now() - make_interval(days => v_gap) then
      return jsonb_build_object('ok', false, 'error', 'follow_up_too_soon',
        'message', format('Follow-ups wait %s days after the earlier email', v_gap));
    end if;
    v_step := par.sequence_step + 1;
  end if;

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
  -- the minimum gap applies to new conversations; follow-ups have their own spacing
  if v_parent is null and exists (
       select 1 from outreach
        where channel = 'email' and direction = 'outbound' and lower(recipient) = e
          and occurred_at > now() - make_interval(days => s.min_days_between_emails)) then
    return jsonb_build_object('ok', false, 'error', 'recently_contacted',
      'message', format('This address was emailed in the last %s days', s.min_days_between_emails));
  end if;

  blocker := sportconn.email_message_blocker(lid, e, v_subj, v_body, v_parent);
  if blocker = 'The address isn''t saved on this lead or its contacts' then
    return jsonb_build_object('ok', false, 'error', 'address_not_on_lead', 'message', blocker);
  end if;
  if blocker = 'They replied, so automatic follow-ups have stopped' then
    return jsonb_build_object('ok', false, 'error', 'replied', 'message', blocker);
  end if;
  st := case when not s.require_review and blocker is null and s.default_sender_id is not null then 'approved' else 'draft' end;

  select c.full_name into v_to_name from lead_contacts c where c.lead_id = lid and lower(c.email) = e limit 1;
  if v_to_name is null then v_to_name := coalesce(par.to_name, l.full_name); end if;

  insert into email_messages (
    lead_id, to_email, to_name, subject, body, origin, status, partnership_concept,
    personalization_evidence, facts_to_verify, confidence, sequence_step, follow_up_of,
    review_note, reviewed_by, reviewed_at, approved_at, engine_run_id, created_by)
  values (
    lid, e, v_to_name, v_subj, v_body, 'ai_engine', st, nullif(p->>'partnership_concept', ''),
    case when jsonb_typeof(p->'personalization_evidence') = 'array' then p->'personalization_evidence' else '[]'::jsonb end,
    case when jsonb_typeof(p->'facts_to_verify') = 'array' then p->'facts_to_verify' else '[]'::jsonb end,
    conf, v_step, v_parent,
    case when st = 'approved' then 'Approved automatically (review switched off in Settings)' end,
    case when st = 'approved' then s.default_sender_id end,
    case when st = 'approved' then now() end,
    case when st = 'approved' then now() end,
    v_run, p_actor)
  returning id into mid;

  insert into audit_log (actor_id, action, detail)
  values (p_actor, 'engine.email.draft', jsonb_build_object('email_id', mid, 'lead_id', lid, 'to', e, 'status', st,
          'sequence_step', v_step, 'follow_up_of', v_parent));

  return jsonb_build_object('ok', true, 'email_id', mid, 'status', st, 'sequence_step', v_step, 'blocker', blocker,
                            'eligibility', sportconn.email_eligibility(e));
end; $$;

-- ----------------------------------------------------------------------------
-- SENDER (replaces 0007's): follow-up rules re-checked at send time; the
-- per-company limit skips shared free-mail domains; returns reply_token.
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
    blocker := sportconn.email_message_blocker(r.lead_id, r.to_email, r.subject, r.body, r.follow_up_of);
    if blocker is not null then
      update email_messages set status = 'cancelled', error = blocker where id = r.id;
      continue;
    end if;
    dom := split_part(r.to_email, '@', 2);
    -- gmail.com, yahoo.com… are thousands of unrelated people, not one company
    if not sportconn.is_free_email_domain(dom) then
      select count(*) into dom_count from outreach
       where channel = 'email' and direction = 'outbound' and external_id is not null
         and occurred_at >= day_start and lower(recipient) like '%@' || dom;
      dom_count := dom_count + coalesce((batch_dom->>dom)::int, 0);
      if dom_count >= s.per_domain_daily_limit then
        continue;  -- stays approved for another day
      end if;
      batch_dom := batch_dom || jsonb_build_object(dom, coalesce((batch_dom->>dom)::int, 0) + 1);
    end if;
    update email_messages set status = 'sending', attempts = attempts + 1, claimed_at = now(), error = null
     where id = r.id;
    out := out || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'lead_id', r.lead_id, 'to', r.to_email, 'to_name', r.to_name,
      'subject', r.subject, 'body', r.body, 'unsubscribe_token', r.unsubscribe_token,
      'reply_token', r.reply_token, 'sequence_step', r.sequence_step,
      'sender_name', r.sender_name, 'sender_email', r.sender_email));
    remaining := remaining - 1;
  end loop;

  return jsonb_build_object('ok', true, 'sent_today', sent_today, 'messages', out);
end; $$;

-- ----------------------------------------------------------------------------
-- FOLLOW-UPS DUE — the latest sent email in each conversation that is ready
-- for its next follow-up (no reply, not blocked, spacing elapsed).
-- ----------------------------------------------------------------------------
create or replace function sportconn.email_followups_due(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = sportconn, public as $$
declare
  s   sportconn.email_settings;
  out jsonb;
begin
  select * into s from email_settings limit 1;
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into out from (
    select m.id as follow_up_of, m.lead_id, coalesce(l.company_name, l.full_name) as company,
           m.to_email as "to", m.to_name, m.sequence_step + 1 as next_step,
           m.subject as previous_subject, m.body as previous_body, m.sent_at as previous_sent_at
      from email_messages m
      join leads l on l.id = m.lead_id
     where m.status in ('sent', 'delivered')
       and m.sequence_step <= s.max_followups
       and m.sent_at <= now() - make_interval(days =>
             case when m.sequence_step = 1 then s.followup_1_after_days else s.followup_2_after_days end)
       and l.status = 'open' and not l.email_opt_out
       and not sportconn.is_suppressed(m.to_email)
       and not exists (select 1 from email_messages c where c.follow_up_of = m.id and c.status not in ('rejected', 'cancelled'))
       and not exists (select 1 from email_messages a where a.to_email = m.to_email and a.status in ('draft', 'approved', 'sending'))
       and not exists (select 1 from email_replies rp
                        where rp.received_at >= m.sent_at and (rp.lead_id = m.lead_id or lower(rp.from_email) = m.to_email))
     order by m.sent_at
     limit greatest(coalesce(p_limit, 50), 1)
  ) x;
  return jsonb_build_object('ok', true, 'results', out);
end; $$;

-- ----------------------------------------------------------------------------
-- RECORD AN INBOUND REPLY (idempotent on the provider id)
--   p = {provider_id, from, to:[...], subject, text, received_at}
-- ----------------------------------------------------------------------------
create or replace function sportconn.email_record_reply(p jsonb)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  pid       text := nullif(trim(coalesce(p->>'provider_id', '')), '');
  raw_from  text := coalesce(p->>'from', '');
  v_from    text;
  v_name    text;
  v_to      jsonb := case when jsonb_typeof(p->'to') = 'array' then p->'to' else '[]'::jsonb end;
  addr      text;
  tok       text;
  m         sportconn.email_messages;
  v_lead    uuid;
  matched   text := 'none';
  v_reply   uuid;
  v_recv    timestamptz;
  l         sportconn.leads;
  notify    jsonb := '[]'::jsonb;
  uid       uuid;
begin
  if pid is null then
    return jsonb_build_object('ok', false, 'error', 'missing_provider_id');
  end if;
  if exists (select 1 from email_replies where provider_id = pid) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  v_from := lower((regexp_match(raw_from, '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})'))[1]);
  if v_from is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_from');
  end if;
  v_name := nullif(trim(both ' "' from regexp_replace(raw_from, '<[^>]*>', '')), '');
  if v_name is not null and lower(v_name) = v_from then v_name := null; end if;
  begin
    v_recv := coalesce(nullif(p->>'received_at', '')::timestamptz, now());
  exception when others then
    v_recv := now();
  end;

  -- 1) the reply address carries the message's reply token
  for addr in select jsonb_array_elements_text(v_to) loop
    tok := (regexp_match(addr, 'reply\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@', 'i'))[1];
    if tok is not null then
      select * into m from email_messages where reply_token = tok::uuid;
      if m.id is not null then matched := 'reply_address'; exit; end if;
    end if;
  end loop;
  -- 2) otherwise the latest email we sent to that address
  if m.id is null then
    select * into m from email_messages
     where to_email = v_from and sent_at is not null order by sent_at desc limit 1;
    if m.id is not null then matched := 'sender_address'; end if;
  end if;
  v_lead := m.lead_id;
  -- 3) otherwise a lead or contact with that address
  if v_lead is null then
    select o.lead_id into v_lead from outreach o
     where o.direction = 'outbound' and lower(o.recipient) = v_from and o.lead_id is not null
     order by o.occurred_at desc limit 1;
    if v_lead is null then
      select l2.id into v_lead from leads l2 where lower(coalesce(l2.email, '')) like '%' || v_from || '%' limit 1;
    end if;
    if v_lead is null then
      select c.lead_id into v_lead from lead_contacts c where lower(c.email) = v_from limit 1;
    end if;
    if v_lead is not null then matched := 'sender_address'; end if;
  end if;

  insert into email_replies (provider_id, lead_id, email_message_id, matched_by, from_email, from_name,
                             to_addresses, subject, body_text, received_at)
  values (pid, v_lead, m.id, matched, v_from, v_name, v_to, left(p->>'subject', 300),
          left(p->>'text', 20000), v_recv)
  returning id into v_reply;

  if v_lead is not null then
    insert into outreach (lead_id, channel, direction, subject, body, outcome, recipient, external_id, occurred_at)
    values (v_lead, 'email', 'inbound', left(coalesce(p->>'subject', 'Reply'), 300), left(p->>'text', 5000),
            'replied', v_from, pid, v_recv);
    if m.id is not null then
      update outreach set outcome = 'replied' where id = m.outreach_id;
      update email_messages set replied_at = coalesce(replied_at, v_recv) where id = m.id;
    end if;
    -- a reply stops every pending follow-up to this company
    update email_messages set status = 'cancelled', error = 'They replied, so the follow-up was stopped'
     where lead_id = v_lead and status in ('draft', 'approved') and sequence_step > 1;

    select * into l from leads where id = v_lead;
    for uid in select distinct x from unnest(array[m.reviewed_by, l.assigned_to]) as x where x is not null loop
      insert into notifications (user_id, lead_id, type, title, body)
      values (uid, v_lead, 'email_reply', 'Reply from ' || coalesce(v_name, v_from),
              coalesce(l.company_name, l.full_name) || ' · ' || coalesce(p->>'subject', ''));
      notify := notify || coalesce((select jsonb_build_array(jsonb_build_object('email', u.email, 'full_name', u.full_name))
                                      from users u where u.id = uid and u.email not like '%.internal'), '[]'::jsonb);
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'reply_id', v_reply, 'lead_id', v_lead, 'email_id', m.id,
                            'matched_by', matched, 'notify', notify,
                            'company', coalesce(l.company_name, l.full_name));
end; $$;

-- ----------------------------------------------------------------------------
-- ENGINE: classify a reply (Workflow E) and apply the CRM effects
-- ----------------------------------------------------------------------------
create or replace function sportconn.engine_classify_reply(p_id uuid, p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  cat     text := coalesce(p->>'classification', '');
  rp      sportconn.email_replies;
  l       sportconn.leads;
  target  text;
  cur_ord integer;
  tgt_ord integer;
begin
  if cat not in ('interested','meeting_requested','needs_information','not_interested','unsubscribe','out_of_office','other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_classification', 'message',
      'classification must be interested, meeting_requested, needs_information, not_interested, unsubscribe, out_of_office or other');
  end if;
  select * into rp from email_replies where id = p_id for update;
  if rp.id is null then return jsonb_build_object('ok', false, 'error', 'not_found', 'message', 'No reply with that id'); end if;

  update email_replies
     set classification = cat, summary = nullif(p->>'summary', ''),
         suggested_response = nullif(p->>'suggested_response', ''),
         classified_by = 'ai', classified_at = now()
   where id = p_id;

  if rp.lead_id is not null then
    select * into l from leads where id = rp.lead_id;
    if cat in ('interested', 'meeting_requested') and l.status = 'open' then
      target := case
        when l.pipeline = 'sponsor' then case when cat = 'meeting_requested' then 'discovery' else 'engaged' end
        when l.pipeline = 'strategic_partnership' then case when cat = 'meeting_requested' then 'discovery' else 'interested' end
      end;
      select sort_order into cur_ord from pipeline_stages where pipeline_key = l.pipeline and key = l.stage;
      select sort_order into tgt_ord from pipeline_stages where pipeline_key = l.pipeline and key = target;
      update leads set
        temperature = 'hot', priority = 'high',
        stage = case when tgt_ord is not null and tgt_ord > coalesce(cur_ord, 0) then target else stage end,
        next_action = case when cat = 'meeting_requested' then 'Book the meeting they asked for'
                           else 'Reply to them — they responded positively' end,
        next_follow_up_at = least(coalesce(next_follow_up_at, now()), now())
      where id = l.id;
    elsif cat = 'needs_information' and l.status = 'open' then
      update leads set next_action = 'Send the information they asked for',
                       next_follow_up_at = least(coalesce(next_follow_up_at, now()), now())
      where id = l.id;
    elsif cat = 'not_interested' and l.status = 'open' then
      update leads set temperature = 'cold',
                       next_action = 'They said they''re not interested — decide whether to mark Lost or nurture'
      where id = l.id;
    elsif cat = 'unsubscribe' then
      insert into suppressions (email, reason, source, lead_id, note)
      values (rp.from_email, 'opt_out_request', 'engine', rp.lead_id, 'Asked to stop in a reply')
      on conflict (email) where email is not null do nothing;
    end if;
    insert into activities (lead_id, type, description, created_by)
    values (rp.lead_id, 'system',
            'AI read the reply from ' || rp.from_email || ': ' || replace(cat, '_', ' ')
            || coalesce(' — ' || nullif(p->>'summary', ''), ''), p_actor);
  end if;

  insert into audit_log (actor_id, action, detail)
  values (p_actor, 'engine.reply.classify', jsonb_build_object('reply_id', p_id, 'lead_id', rp.lead_id, 'classification', cat));
  return jsonb_build_object('ok', true, 'reply_id', p_id, 'classification', cat, 'lead_id', rp.lead_id);
end; $$;

-- ----------------------------------------------------------------------------
-- ENGINE DASHBOARD — blueprint §8 metrics for a window (default last 30 days)
-- ----------------------------------------------------------------------------
create or replace function sportconn.get_engine_dashboard(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = sportconn, public as $$
declare
  d_to   date := coalesce(p_to, (now() at time zone 'Africa/Lagos')::date);
  d_from date := coalesce(p_from, d_to - 29);
  t0     timestamptz := d_from::timestamp at time zone 'Africa/Lagos';
  t1     timestamptz := (d_to + 1)::timestamp at time zone 'Africa/Lagos';
  result jsonb;
begin
  with ai as (select * from leads where source = 'ai_engine'),
       ai_new as (select * from ai where created_at >= t0 and created_at < t1),
       addrs as (
         select lower(m[1]) as email from ai_new l,
                regexp_matches(coalesce(l.email, ''), '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') m
         union
         select lower(c.email) from lead_contacts c join ai_new l on l.id = c.lead_id where c.email is not null
       ),
       sent as (select * from email_messages where sent_at >= t0 and sent_at < t1),
       rep as (select * from email_replies where received_at >= t0 and received_at < t1)
  select jsonb_build_object(
    'from', d_from, 'to', d_to,
    'leads_created',      (select count(*) from ai_new),
    'priority_80_plus',   (select count(*) from ai_new where prospect_score >= 80),
    'qualified_65_79',    (select count(*) from ai_new where prospect_score >= 65 and prospect_score < 80),
    'avg_score',          (select round(avg(prospect_score), 1) from ai_new),
    'contacts_found',     (select count(*) from addrs),
    'contacts_verified',  (select count(*) from addrs a join contact_eligibility ce on ce.email = a.email
                            where ce.verification_status = 'valid'),
    'contacts_eligible',  (select count(*) from addrs a where (sportconn.email_eligibility(a.email))->>'status' = 'eligible'),
    'drafts_waiting',     (select count(*) from email_messages where status = 'draft'),
    'queued',             (select count(*) from email_messages where status in ('approved', 'sending')),
    'emails_sent',        (select count(*) from sent),
    'first_emails_sent',  (select count(*) from sent where sequence_step = 1),
    'followups_sent',     (select count(*) from sent where sequence_step > 1),
    'delivered',          (select count(*) from sent where delivered_at is not null or status = 'delivered'),
    'bounced',            (select count(*) from sent where status = 'bounced'),
    'complaints',         (select count(*) from sent where status = 'complained'),
    'unsubscribes',       (select count(*) from suppressions
                            where reason in ('unsubscribed', 'opt_out_request') and created_at >= t0 and created_at < t1),
    'replies',            (select count(*) from rep where lead_id is not null),
    'positive_replies',   (select count(*) from rep where classification in ('interested', 'meeting_requested')),
    'meeting_requests',   (select count(*) from rep where classification = 'meeting_requested'),
    'not_interested',     (select count(*) from rep where classification = 'not_interested'),
    'replies_unread',     (select count(*) from email_replies where not handled and lead_id is not null),
    'replies_unmatched',  (select count(*) from rep where lead_id is null),
    'meetings_held',      (select count(*) from outreach o join ai on ai.id = o.lead_id
                            where o.occurred_at >= t0 and o.occurred_at < t1
                              and o.channel in ('meeting', 'sponsor_meeting') and o.outcome in ('completed', 'replied')),
    'proposals',          (select count(distinct o.lead_id) from outreach o join ai on ai.id = o.lead_id
                            where o.occurred_at >= t0 and o.occurred_at < t1 and o.channel = 'proposal'),
    'deals_won',          (select count(*) from ai where won_at >= t0 and won_at < t1),
    'revenue',            (select coalesce(sum(coalesce(contract_value, expected_value)), 0) from ai
                            where paid_at >= t0 and paid_at < t1),
    'pipeline_value',     (select coalesce(sum(expected_value), 0) from ai where status = 'open'),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', dd::date,
               'leads', (select count(*) from ai_new where (created_at at time zone 'Africa/Lagos')::date = dd::date),
               'sent',  (select count(*) from sent where (sent_at at time zone 'Africa/Lagos')::date = dd::date),
               'replies', (select count(*) from rep where lead_id is not null and (received_at at time zone 'Africa/Lagos')::date = dd::date)
             ) order by dd), '[]'::jsonb)
        from generate_series(d_from::timestamp, d_to::timestamp, interval '1 day') dd)
  ) into result;
  return result;
end; $$;

-- ----------------------------------------------------------------------------
-- PERMISSIONS
-- ----------------------------------------------------------------------------
revoke all on function sportconn.email_record_reply(jsonb) from public, anon, authenticated;
revoke all on function sportconn.engine_classify_reply(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function sportconn.email_followups_due(integer) from public, anon, authenticated;
revoke all on function sportconn.engine_create_draft(jsonb, uuid) from public, anon, authenticated;
revoke all on function sportconn.email_claim_batch(integer) from public, anon, authenticated;
grant execute on function
  sportconn.email_record_reply(jsonb), sportconn.engine_classify_reply(uuid, jsonb, uuid),
  sportconn.email_followups_due(integer), sportconn.engine_create_draft(jsonb, uuid),
  sportconn.email_claim_batch(integer)
  to service_role;
grant execute on function
  sportconn.email_followup_blocker(uuid, text, uuid),
  sportconn.email_message_blocker(uuid, text, text, text, uuid),
  sportconn.get_engine_dashboard(date, date)
  to authenticated, service_role;

alter table sportconn.email_replies enable row level security;
drop policy if exists email_replies_select on sportconn.email_replies;
create policy email_replies_select on sportconn.email_replies for select to authenticated using (true);
drop policy if exists email_replies_update on sportconn.email_replies;
create policy email_replies_update on sportconn.email_replies for update to authenticated
  using (sportconn.can_write()) with check (sportconn.can_write());

grant select, update on sportconn.email_replies to authenticated;
grant all on sportconn.email_replies to service_role;

do $$ begin alter publication supabase_realtime add table sportconn.email_replies; exception when others then null; end $$;
