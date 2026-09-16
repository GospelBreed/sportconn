-- ============================================================================
-- SportConn CRM — migration 0002: pipelines + dealflow layer
--
-- Adds the multi-pipeline commercial engine on top of the core (0001):
--   • pipelines / pipeline_stages — configurable pipeline + stage catalogue
--                                   (Settings can edit these; §29)
--   • leads                      — the core Lead/Opportunity record (§6),
--                                   used for the Sponsor, Investor, Strategic
--                                   Partnership and User Acquisition pipelines.
--                                   Facility and Captain pipelines live on
--                                   their own dedicated tables (0001) since
--                                   those are long-lived directory entities.
--   • campaigns                  — growth/marketing campaigns (§24)
--   • outreach                   — logged call / email / WhatsApp / meeting /
--                                   site-visit / demo touches (§19)
--   • tasks                      — first-class to-dos (§18)
--
-- Also completes the lead_id FK on activities/notifications (left as bare
-- uuid columns in 0001 since sportconn.leads didn't exist yet), wires
-- realtime + RLS + grants, and adds get_dashboard_summary() /
-- get_pipeline_metrics().
--
-- Run AFTER 0001_init.sql. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PIPELINES + STAGES (configurable — §3, §29)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.pipelines (
  key         text primary key,
  label       text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists sportconn.pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  pipeline_key text not null references sportconn.pipelines(key) on delete cascade,
  key          text not null,
  label        text not null,
  sort_order   integer not null default 0,
  is_won       boolean not null default false,
  is_lost      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (pipeline_key, key)
);

insert into sportconn.pipelines (key, label, description, sort_order) values
  ('sponsor',                 'Sponsors',                 'Brands and organizations sponsoring SportConn.', 1),
  ('investor',                'Investors',                'Angel / VC / strategic investment prospects.',   2),
  ('strategic_partnership',   'Strategic Partnerships',   'Brands, media, tech, and org partnerships.',     3),
  ('user_acquisition',        'User Acquisition',         'Community and user-growth initiatives.',         4),
  ('facility',                'Facilities',               'Sports venue partnership opportunities.',        5),
  ('captain',                 'Captains & Communities',   'Local football/community captain onboarding.',   6)
on conflict (key) do nothing;

insert into sportconn.pipeline_stages (pipeline_key, key, label, sort_order, is_won, is_lost) values
  -- Sponsor pipeline (§8)
  ('sponsor','new_lead',        'New Sponsor Lead',       1,  false, false),
  ('sponsor','researched',      'Researched',             2,  false, false),
  ('sponsor','contacted',       'Contacted',              3,  false, false),
  ('sponsor','engaged',         'Engaged',                4,  false, false),
  ('sponsor','qualified',       'Qualified',              5,  false, false),
  ('sponsor','discovery',       'Discovery Meeting',      6,  false, false),
  ('sponsor','proposal',        'Sponsorship Proposal',   7,  false, false),
  ('sponsor','negotiation',     'Negotiation',            8,  false, false),
  ('sponsor','verbal_commit',   'Verbal Commitment',      9,  false, false),
  ('sponsor','contract',        'Contract / Documentation',10, false, false),
  ('sponsor','payment_pending', 'Payment Pending',        11, false, false),
  ('sponsor','won',             'Sponsor Won',            12, true,  false),
  ('sponsor','lost',            'Sponsor Lost',           13, false, true),
  ('sponsor','nurture',         'Nurture',                14, false, false),
  -- Investor pipeline (§9)
  ('investor','prospect',       'Investor Prospect',      1,  false, false),
  ('investor','researched',     'Researched',             2,  false, false),
  ('investor','outreach',       'Initial Outreach',       3,  false, false),
  ('investor','interested',     'Interested',             4,  false, false),
  ('investor','qualification',  'Qualification',          5,  false, false),
  ('investor','discovery',      'Intro / Discovery',      6,  false, false),
  ('investor','deck_sent',      'Pitch Deck Sent',        7,  false, false),
  ('investor','due_diligence',  'Due Diligence',          8,  false, false),
  ('investor','term_discussion','Term Discussion',        9,  false, false),
  ('investor','documentation',  'Investment Documentation',10, false, false),
  ('investor','pending',        'Investment Pending',     11, false, false),
  ('investor','invested',       'Invested',               12, true,  false),
  ('investor','passed',         'Passed',                 13, false, true),
  ('investor','nurture',        'Nurture',                14, false, false),
  -- Strategic partnership pipeline (§13)
  ('strategic_partnership','prospect',    'Prospect',      1,  false, false),
  ('strategic_partnership','contacted',   'Contacted',     2,  false, false),
  ('strategic_partnership','interested',  'Interested',    3,  false, false),
  ('strategic_partnership','discovery',   'Discovery',     4,  false, false),
  ('strategic_partnership','proposal',    'Proposal',      5,  false, false),
  ('strategic_partnership','negotiation', 'Negotiation',   6,  false, false),
  ('strategic_partnership','agreement',   'Agreement',     7,  false, false),
  ('strategic_partnership','onboarding',  'Onboarding',    8,  false, false),
  ('strategic_partnership','active',      'Active Partner',9,  true,  false),
  ('strategic_partnership','lost',        'Lost',          10, false, true),
  ('strategic_partnership','nurture',     'Nurture',       11, false, false),
  -- User acquisition pipeline (§11)
  ('user_acquisition','target_identified','Target Identified',1, false, false),
  ('user_acquisition','outreach_started', 'Outreach Started', 2, false, false),
  ('user_acquisition','engaged',          'Engaged',           3, false, false),
  ('user_acquisition','signup_campaign',  'Signup Campaign',   4, false, false),
  ('user_acquisition','users_acquired',   'Users Acquired',    5, false, false),
  ('user_acquisition','activation',       'Activation',        6, false, false),
  ('user_acquisition','retention',        'Retention',         7, false, false),
  ('user_acquisition','completed',        'Completed',         8, true,  false),
  ('user_acquisition','failed',           'Failed',            9, false, true),
  -- Facility pipeline (§10) — used by sportconn.facilities.stage
  ('facility','prospect',    'Prospect',           1,  false, false),
  ('facility','researched',  'Researched',         2,  false, false),
  ('facility','contacted',   'Contacted',          3,  false, false),
  ('facility','interested',  'Interested',         4,  false, false),
  ('facility','meeting',     'Meeting Scheduled',  5,  false, false),
  ('facility','proposal',    'Proposal Sent',      6,  false, false),
  ('facility','negotiation', 'Negotiation',        7,  false, false),
  ('facility','onboarding',  'Onboarding',         8,  false, false),
  ('facility','active',      'Active Partner',     9,  true,  false),
  ('facility','lost',        'Lost',               10, false, true),
  ('facility','nurture',     'Nurture',            11, false, false),
  -- Captain pipeline (§12) — used by sportconn.captains.stage
  ('captain','prospect',   'Prospect',       1, false, false),
  ('captain','contacted',  'Contacted',      2, false, false),
  ('captain','interested', 'Interested',     3, false, false),
  ('captain','qualified',  'Qualified',      4, false, false),
  ('captain','onboarding', 'Onboarding',     5, false, false),
  ('captain','active',     'Active Captain', 6, true,  false),
  ('captain','inactive',   'Inactive',       7, false, false),
  ('captain','churned',    'Churned',        8, false, true)
on conflict (pipeline_key, key) do nothing;

create or replace function sportconn.stage_label(p_pipeline text, p_stage text)
returns text language sql stable as $$
  select coalesce(
    (select label from sportconn.pipeline_stages where pipeline_key = p_pipeline and key = p_stage),
    p_stage
  );
$$;

create or replace function sportconn.stage_flags(p_pipeline text, p_stage text)
returns table(is_won boolean, is_lost boolean) language sql stable as $$
  select coalesce(s.is_won, false), coalesce(s.is_lost, false)
  from (select p_pipeline, p_stage) x
  left join sportconn.pipeline_stages s on s.pipeline_key = p_pipeline and s.key = p_stage;
$$;

-- Redefine facilities_before_write now that pipeline_stages/stage_flags exist —
-- CREATE OR REPLACE keeps the function's OID, so the trigger created in 0001
-- picks up this body automatically. Derives status from the stage's is_won/
-- is_lost flag instead of requiring the caller to also pass `status` (the app
-- only ever sends `stage` when moving a facility, e.g. Mark Won/Lost).
create or replace function sportconn.facilities_before_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
declare
  flags record;
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    select * into flags from sportconn.stage_flags('facility', new.stage);
    if flags.is_lost and new.lost_reason is null then
      raise exception 'lost_reason is required when marking a facility opportunity Lost';
    end if;
    if flags.is_won then
      new.status := 'won';
      new.won_at := coalesce(new.won_at, now());
      new.lost_at := null;
    elsif flags.is_lost then
      new.status := 'lost';
      new.lost_at := coalesce(new.lost_at, now());
      new.won_at := null;
    else
      new.status := 'open';
      new.won_at := null;
      new.lost_at := null;
    end if;
  elsif tg_op = 'INSERT' then
    select * into flags from sportconn.stage_flags('facility', new.stage);
    if flags.is_won then new.status := 'won'; new.won_at := now();
    elsif flags.is_lost then new.status := 'lost'; new.lost_at := now();
    end if;
  end if;
  return new;
end; $$;

-- captains have no won/lost concept, just an `active` flag that should always
-- agree with the captain pipeline's "Active Captain" stage.
create or replace function sportconn.captains_before_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  new.active := (new.stage = 'active');
  return new;
end; $$;

drop trigger if exists trg_captains_before_write on sportconn.captains;
create trigger trg_captains_before_write before insert or update on sportconn.captains
  for each row execute function sportconn.captains_before_write();

-- ----------------------------------------------------------------------------
-- LEADS — core Lead/Opportunity record (§6). Covers the sponsor, investor,
-- strategic-partnership and user-acquisition pipelines. Facility/Captain
-- opportunities live on their own tables (0001) and are not duplicated here.
-- ----------------------------------------------------------------------------
create table if not exists sportconn.leads (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text not null,
  first_name            text,
  last_name             text,
  title                 text,
  email                 text,
  phone                 text,
  whatsapp              text,
  linkedin_url          text,
  website               text,
  company_name          text,
  location_city         text,
  location_state        text,
  location_country      text,

  lead_type             text not null default 'other'
                        check (lead_type in (
                          'sponsor','investor','facility','sports_brand','coach','academy',
                          'captain','athlete','community','tournament_organizer',
                          'strategic_partner','media_partner','corporate_partner','other'
                        )),
  pipeline              text not null references sportconn.pipelines(key),
  stage                 text not null,
  source                text not null default 'other'
                        check (source in (
                          'field_sales','referral','website','social_media','linkedin','instagram',
                          'facebook','whatsapp','email','event','campaign','existing_network',
                          'investor_outreach','sponsor_outreach','facility_outreach','organic',
                          'import','other'
                        )),
  industry              text,
  sport_category        text,
  interest              text,
  priority              text not null default 'medium' check (priority in ('high','medium','low')),
  temperature           text not null default 'warm' check (temperature in ('hot','warm','cold','at_risk')),
  assigned_to           uuid references sportconn.users(id) on delete set null,
  campaign_id           uuid, -- FK added below once sportconn.campaigns exists

  -- commercial value tracking (§21)
  expected_value        numeric(14,2),
  currency              text not null default 'NGN',
  value_type            text not null default 'monetary'
                        check (value_type in ('monetary','non_monetary','user_acquisition','partnership','investment')),
  probability           integer check (probability between 0 and 100),
  weighted_value        numeric(14,2) generated always as (
                           round(coalesce(expected_value, 0) * coalesce(probability, 0) / 100.0, 2)
                         ) stored,

  -- sponsor-specific (§8)
  sponsorship_category  text,
  decision_maker        text,
  budget_status         text,
  proposal_status       text,

  -- investor-specific (§9)
  investor_type         text,
  ticket_size           numeric(14,2),
  target_raise          numeric(14,2),
  intro_source          text,
  due_diligence_status  text,

  -- user-acquisition-specific (§11)
  target_users          integer check (target_users is null or target_users >= 0),
  actual_users           integer not null default 0 check (actual_users >= 0),
  active_users           integer check (active_users is null or active_users >= 0),
  target_location        text,
  target_community       text,
  campaign_start_date    date,
  campaign_end_date      date,
  cost                   numeric(14,2),

  status                text not null default 'open' check (status in ('open','won','lost','nurture')),
  lost_reason           text
                        check (lost_reason is null or lost_reason in (
                          'no_budget','not_interested','competitor','timing','no_response',
                          'decision_maker_unavailable','terms_not_agreed','failed_qualification',
                          'internal_decision','funding_not_available','partnership_not_suitable','other'
                        )),
  won_at                timestamptz,
  lost_at               timestamptz,

  next_follow_up_at     timestamptz,
  next_follow_up_type   text check (next_follow_up_type in (
                          'call','whatsapp','email','meeting','proposal','demo','site_visit',
                          'investor_meeting','sponsor_meeting','other'
                        )),
  next_action           text,
  stage_entered_at      timestamptz not null default now(),
  last_activity_at      timestamptz not null default now(),
  notes                 text,
  created_by            uuid references sportconn.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint leads_stage_valid foreign key (pipeline, stage)
    references sportconn.pipeline_stages(pipeline_key, key)
);

create index if not exists idx_leads_pipeline    on sportconn.leads(pipeline);
create index if not exists idx_leads_stage       on sportconn.leads(pipeline, stage);
create index if not exists idx_leads_temperature on sportconn.leads(temperature);
create index if not exists idx_leads_assigned    on sportconn.leads(assigned_to);
create index if not exists idx_leads_followup    on sportconn.leads(next_follow_up_at);
create index if not exists idx_leads_status      on sportconn.leads(status);
create index if not exists idx_leads_lead_type   on sportconn.leads(lead_type);

-- ----------------------------------------------------------------------------
-- CAMPAIGNS (§24)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  objective       text,
  campaign_type   text not null default 'other'
                  check (campaign_type in (
                    'sponsor_outreach','investor_outreach','facility_acquisition',
                    'user_acquisition','captain_recruitment','brand_awareness','event','other'
                  )),
  channel         text not null default 'multi' check (channel in ('email','linkedin','event','multi')),
  status          text not null default 'draft' check (status in ('draft','active','paused','completed','cancelled')),
  target_audience text,
  location        text,
  start_date      date,
  end_date        date,
  target_leads    integer check (target_leads is null or target_leads >= 0),
  actual_leads    integer not null default 0,
  target_users    integer check (target_users is null or target_users >= 0),
  actual_users    integer not null default 0,
  budget          numeric(14,2),
  cost            numeric(14,2),
  sent_count      integer not null default 0,
  reply_count     integer not null default 0,
  meeting_count   integer not null default 0,
  owner           uuid references sportconn.users(id) on delete set null,
  notes           text,
  created_by      uuid references sportconn.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_campaigns_status on sportconn.campaigns(status);

alter table sportconn.leads
  add constraint leads_campaign_fk foreign key (campaign_id)
  references sportconn.campaigns(id) on delete set null;
create index if not exists idx_leads_campaign on sportconn.leads(campaign_id);

-- ----------------------------------------------------------------------------
-- OUTREACH — logged interactions (§7 timeline, §19 follow-up types)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.outreach (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references sportconn.leads(id) on delete cascade,
  facility_id  uuid references sportconn.facilities(id) on delete cascade,
  captain_id   uuid references sportconn.captains(id) on delete cascade,
  campaign_id  uuid references sportconn.campaigns(id) on delete set null,
  channel      text not null default 'call'
               check (channel in (
                 'call','whatsapp','email','meeting','sms','linkedin','proposal','demo',
                 'site_visit','investor_meeting','sponsor_meeting','other'
               )),
  direction    text not null default 'outbound' check (direction in ('outbound','inbound')),
  subject      text,
  body         text,
  outcome      text not null default 'completed'
               check (outcome in ('sent','opened','replied','no_response','bounced','completed','scheduled')),
  occurred_at  timestamptz not null default now(),
  created_by   uuid references sportconn.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint outreach_subject_present check (
    lead_id is not null or facility_id is not null or captain_id is not null
  )
);

create index if not exists idx_outreach_lead     on sportconn.outreach(lead_id, occurred_at desc);
create index if not exists idx_outreach_facility on sportconn.outreach(facility_id, occurred_at desc);
create index if not exists idx_outreach_captain  on sportconn.outreach(captain_id, occurred_at desc);
create index if not exists idx_outreach_campaign on sportconn.outreach(campaign_id);
create index if not exists idx_outreach_occurred on sportconn.outreach(occurred_at desc);

-- ----------------------------------------------------------------------------
-- TASKS (§18)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  status        text not null default 'to_do' check (status in ('to_do','in_progress','completed','cancelled')),
  priority      text not null default 'medium' check (priority in ('low','medium','high')),
  due_at        timestamptz,
  assigned_to   uuid references sportconn.users(id) on delete set null,
  lead_id       uuid references sportconn.leads(id) on delete cascade,
  facility_id   uuid references sportconn.facilities(id) on delete cascade,
  captain_id    uuid references sportconn.captains(id) on delete cascade,
  completed_at  timestamptz,
  created_by    uuid references sportconn.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tasks_status   on sportconn.tasks(status);
create index if not exists idx_tasks_due      on sportconn.tasks(due_at);
create index if not exists idx_tasks_assigned on sportconn.tasks(assigned_to);
create index if not exists idx_tasks_lead     on sportconn.tasks(lead_id);

-- ----------------------------------------------------------------------------
-- Complete activities / notifications FKs to leads (deferred from 0001)
-- ----------------------------------------------------------------------------
alter table sportconn.activities
  add constraint activities_lead_fk foreign key (lead_id) references sportconn.leads(id) on delete cascade;
create index if not exists idx_activities_lead on sportconn.activities(lead_id, created_at desc);

alter table sportconn.notifications
  add constraint notifications_lead_fk foreign key (lead_id) references sportconn.leads(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------
drop trigger if exists trg_leads_updated on sportconn.leads;
create trigger trg_leads_updated before update on sportconn.leads
  for each row execute function sportconn.touch_updated_at();

drop trigger if exists trg_campaigns_updated on sportconn.campaigns;
create trigger trg_campaigns_updated before update on sportconn.campaigns
  for each row execute function sportconn.touch_updated_at();

drop trigger if exists trg_tasks_updated on sportconn.tasks;
create trigger trg_tasks_updated before update on sportconn.tasks
  for each row execute function sportconn.touch_updated_at();

-- lead lifecycle: default stage, stamp timestamps, won/lost bookkeeping
create or replace function sportconn.leads_before_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
declare
  flags record;
begin
  if new.stage is null then
    select key into new.stage from sportconn.pipeline_stages
      where pipeline_key = new.pipeline order by sort_order limit 1;
  end if;

  if tg_op = 'INSERT' then
    new.stage_entered_at := now();
    new.last_activity_at := now();
  elsif tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_entered_at := now();
    new.last_activity_at := now();
  end if;

  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    select * into flags from sportconn.stage_flags(new.pipeline, new.stage);
    if flags.is_lost and new.lost_reason is null then
      raise exception 'lost_reason is required when marking a lead Lost';
    end if;
    if flags.is_won then
      new.status := 'won';
      new.won_at := coalesce(new.won_at, now());
      new.lost_at := null;
    elsif flags.is_lost then
      new.status := 'lost';
      new.lost_at := coalesce(new.lost_at, now());
      new.won_at := null;
    else
      new.status := 'open';
      new.won_at := null;
      new.lost_at := null;
    end if;
  elsif tg_op = 'INSERT' then
    select * into flags from sportconn.stage_flags(new.pipeline, new.stage);
    if flags.is_won then new.status := 'won'; new.won_at := now();
    elsif flags.is_lost then new.status := 'lost'; new.lost_at := now();
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_leads_before_write on sportconn.leads;
create trigger trg_leads_before_write before insert or update on sportconn.leads
  for each row execute function sportconn.leads_before_write();

create or replace function sportconn.leads_after_insert()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  insert into sportconn.activities (lead_id, type, description, created_by)
  values (new.id, 'lead_created',
          'Lead created: ' || new.full_name || coalesce(' — ' || new.company_name, ''), auth.uid());
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    insert into sportconn.notifications (user_id, lead_id, type, title, body)
    values (new.assigned_to, new.id, 'lead_assigned', 'Lead assigned to you',
            new.full_name || coalesce(' · ' || new.company_name, ''));
  end if;
  return new;
end; $$;

drop trigger if exists trg_leads_after_insert on sportconn.leads;
create trigger trg_leads_after_insert after insert on sportconn.leads
  for each row execute function sportconn.leads_after_insert();

create or replace function sportconn.leads_after_update()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.stage is distinct from old.stage then
    insert into sportconn.activities (lead_id, type, description, created_by)
    values (new.id, 'lead_stage_change',
            sportconn.stage_label(old.pipeline, old.stage) || ' → ' || sportconn.stage_label(new.pipeline, new.stage),
            auth.uid());
    if new.status = 'won' and old.status <> 'won' then
      insert into sportconn.activities (lead_id, type, description, created_by)
      values (new.id, 'won', 'Marked Won: ' || new.full_name, auth.uid());
    elsif new.status = 'lost' and old.status <> 'lost' then
      insert into sportconn.activities (lead_id, type, description, created_by)
      values (new.id, 'lost', 'Marked Lost: ' || coalesce(new.lost_reason, 'no reason given'), auth.uid());
    end if;
  end if;
  if new.assigned_to is distinct from old.assigned_to
     and new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    insert into sportconn.notifications (user_id, lead_id, type, title, body)
    values (new.assigned_to, new.id, 'lead_assigned', 'Lead assigned to you',
            new.full_name || coalesce(' · ' || new.company_name, ''));
  end if;
  if new.next_follow_up_at is distinct from old.next_follow_up_at and new.next_follow_up_at is not null then
    insert into sportconn.activities (lead_id, type, description, created_by)
    values (new.id, 'follow_up_set', 'Follow-up set for ' || to_char(new.next_follow_up_at, 'Mon DD, YYYY'), auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_leads_after_update on sportconn.leads;
create trigger trg_leads_after_update after update on sportconn.leads
  for each row execute function sportconn.leads_after_update();

-- outreach → bump lead/facility/captain activity timestamp + timeline entry
create or replace function sportconn.outreach_after_insert()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.lead_id is not null then
    update sportconn.leads set last_activity_at = now() where id = new.lead_id;
  end if;
  if new.captain_id is not null then
    update sportconn.captains set last_activity_at = now() where id = new.captain_id;
  end if;
  insert into sportconn.activities (lead_id, facility_id, captain_id, type, description, created_by)
  values (new.lead_id, new.facility_id, new.captain_id, new.channel,
          initcap(replace(new.channel, '_', ' ')) || ' (' || new.outcome || ')' ||
          coalesce(': ' || new.subject, ''), coalesce(new.created_by, auth.uid()));
  if new.campaign_id is not null then
    update sportconn.campaigns
      set sent_count    = sent_count + 1,
          reply_count   = reply_count + (case when new.outcome = 'replied' then 1 else 0 end),
          meeting_count = meeting_count + (case when new.channel in ('meeting','investor_meeting','sponsor_meeting') then 1 else 0 end)
      where id = new.campaign_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_outreach_after_insert on sportconn.outreach;
create trigger trg_outreach_after_insert after insert on sportconn.outreach
  for each row execute function sportconn.outreach_after_insert();

-- tasks: completed_at + assignment/overdue notification
create or replace function sportconn.tasks_before_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_tasks_before_write on sportconn.tasks;
create trigger trg_tasks_before_write before insert or update on sportconn.tasks
  for each row execute function sportconn.tasks_before_write();

create or replace function sportconn.tasks_after_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.assigned_to is not null
     and new.assigned_to is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    insert into sportconn.notifications (user_id, lead_id, type, title, body)
    values (new.assigned_to, new.lead_id, 'task_assigned', 'Task assigned to you', new.title);
  end if;
  if new.status = 'completed' and tg_op = 'UPDATE' and old.status <> 'completed' and new.lead_id is not null then
    insert into sportconn.activities (lead_id, type, description, created_by)
    values (new.lead_id, 'task_done', 'Task completed: ' || new.title, auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_tasks_after_write on sportconn.tasks;
create trigger trg_tasks_after_write after insert or update on sportconn.tasks
  for each row execute function sportconn.tasks_after_write();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table sportconn.pipelines       enable row level security;
alter table sportconn.pipeline_stages enable row level security;
alter table sportconn.leads           enable row level security;
alter table sportconn.campaigns       enable row level security;
alter table sportconn.outreach        enable row level security;
alter table sportconn.tasks           enable row level security;

drop policy if exists pipelines_select on sportconn.pipelines;
create policy pipelines_select on sportconn.pipelines for select to authenticated using (true);
drop policy if exists pipelines_write on sportconn.pipelines;
create policy pipelines_write on sportconn.pipelines for all to authenticated
  using (sportconn.is_admin()) with check (sportconn.is_admin());

drop policy if exists pipeline_stages_select on sportconn.pipeline_stages;
create policy pipeline_stages_select on sportconn.pipeline_stages for select to authenticated using (true);
drop policy if exists pipeline_stages_write on sportconn.pipeline_stages;
create policy pipeline_stages_write on sportconn.pipeline_stages for all to authenticated
  using (sportconn.is_admin()) with check (sportconn.is_admin());

do $$
declare t text;
begin
  foreach t in array array['leads','campaigns','outreach','tasks'] loop
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

-- ----------------------------------------------------------------------------
-- REALTIME
-- ----------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table sportconn.leads;    exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table sportconn.tasks;    exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table sportconn.outreach; exception when others then null; end $$;

-- ----------------------------------------------------------------------------
-- GRANTS
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on
  sportconn.pipelines, sportconn.pipeline_stages, sportconn.leads,
  sportconn.campaigns, sportconn.outreach, sportconn.tasks
  to authenticated;
grant all on
  sportconn.pipelines, sportconn.pipeline_stages, sportconn.leads,
  sportconn.campaigns, sportconn.outreach, sportconn.tasks
  to service_role;
grant select on
  sportconn.pipelines, sportconn.pipeline_stages, sportconn.leads,
  sportconn.campaigns, sportconn.outreach, sportconn.tasks
  to anon;

-- ----------------------------------------------------------------------------
-- DASHBOARD RPC (§17, §35)
-- ----------------------------------------------------------------------------
create or replace function sportconn.get_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = sportconn, public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_leads',          (select count(*) from leads),
    'active_opportunities', (select count(*) from leads where status = 'open')
                             + (select count(*) from facilities where status = 'open')
                             + (select count(*) from captains where stage not in ('active','inactive','churned')),
    'total_pipeline_value', (select coalesce(sum(expected_value), 0) from leads where status = 'open')
                             + (select coalesce(sum(expected_value), 0) from facilities where status = 'open'),
    'weighted_pipeline',    (select coalesce(sum(weighted_value), 0) from leads where status = 'open'),
    'sponsor_pipeline',     (select coalesce(sum(expected_value), 0) from leads where pipeline = 'sponsor' and status = 'open'),
    'sponsor_count',        (select count(*) from leads where pipeline = 'sponsor' and status = 'open'),
    'investor_pipeline',    (select coalesce(sum(expected_value), 0) from leads where pipeline = 'investor' and status = 'open'),
    'investor_count',       (select count(*) from leads where pipeline = 'investor' and status = 'open'),
    'facility_pipeline',    (select coalesce(sum(expected_value), 0) from facilities where status = 'open'),
    'facility_count',       (select count(*) from facilities where status = 'open'),
    'partnership_pipeline', (select coalesce(sum(expected_value), 0) from leads where pipeline = 'strategic_partnership' and status = 'open'),
    'partnership_count',    (select count(*) from leads where pipeline = 'strategic_partnership' and status = 'open'),
    'users_target',         (select coalesce(sum(target_users), 0) from leads where pipeline = 'user_acquisition'),
    'users_acquired',       (select coalesce(sum(actual_users), 0) from leads where pipeline = 'user_acquisition'),
    'overdue_followups',    (select count(*) from leads where status = 'open' and next_follow_up_at < now())
                             + (select count(*) from facilities where status = 'open' and next_follow_up_at < now()),
    'today_followups',      (select count(*) from leads where status = 'open' and next_follow_up_at::date = current_date)
                             + (select count(*) from facilities where status = 'open' and next_follow_up_at::date = current_date),
    'tasks_overdue',        (select count(*) from tasks where status not in ('completed','cancelled') and due_at < now()),
    'tasks_today',          (select count(*) from tasks where status not in ('completed','cancelled') and due_at::date = current_date),
    'pipeline_breakdown', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'pipeline', p.key, 'label', p.label,
               'count', coalesce(x.cnt, 0), 'value', coalesce(x.val, 0)) order by p.sort_order), '[]'::jsonb)
      from pipelines p
      left join (select pipeline, count(*) cnt, sum(expected_value) val from leads where status = 'open' group by pipeline) x
        on x.pipeline = p.key
      where p.key <> 'facility' and p.key <> 'captain'
    ),
    'temperature', jsonb_build_object(
      'hot',  (select count(*) from leads where temperature = 'hot' and status = 'open'),
      'warm', (select count(*) from leads where temperature = 'warm' and status = 'open'),
      'cold', (select count(*) from leads where temperature = 'cold' and status = 'open'),
      'at_risk', (select count(*) from leads where temperature = 'at_risk' and status = 'open')
    )
  ) into result;
  return result;
end;
$$;

grant execute on function sportconn.get_dashboard_summary() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- PIPELINE METRICS RPC (§15) — scoped to one pipeline, or all when p_pipeline is null
-- ----------------------------------------------------------------------------
create or replace function sportconn.get_pipeline_metrics(p_pipeline text default null)
returns jsonb
language plpgsql
security definer
set search_path = sportconn, public
as $$
declare
  result jsonb;
  won_count int;
  lost_count int;
begin
  if p_pipeline = 'facility' then
    select count(*) into won_count from facilities where status = 'won';
    select count(*) into lost_count from facilities where status = 'lost';
    select jsonb_build_object(
      'total_value',   coalesce(sum(expected_value) filter (where status = 'open'), 0),
      'active_count',  count(*) filter (where status = 'open'),
      'avg_value',     coalesce(avg(expected_value) filter (where status = 'open'), 0),
      'won_count',     won_count,
      'lost_count',    lost_count,
      'win_rate',      case when won_count + lost_count = 0 then 0
                        else round(100.0 * won_count / (won_count + lost_count), 1) end
    ) into result from facilities;
    return result;
  end if;

  if p_pipeline = 'captain' then
    select count(*) into won_count from captains where stage = 'active';
    select count(*) into lost_count from captains where stage = 'churned';
    select jsonb_build_object(
      'total_value',   count(*),
      'active_count',  count(*) filter (where stage not in ('active','inactive','churned')),
      'avg_value',     coalesce(avg(player_count) filter (where stage = 'active'), 0),
      'won_count',     won_count,
      'lost_count',    lost_count,
      'win_rate',      case when won_count + lost_count = 0 then 0
                        else round(100.0 * won_count / (won_count + lost_count), 1) end
    ) into result from captains;
    return result;
  end if;

  select count(*) into won_count from leads where (p_pipeline is null or pipeline = p_pipeline) and status = 'won';
  select count(*) into lost_count from leads where (p_pipeline is null or pipeline = p_pipeline) and status = 'lost';
  select jsonb_build_object(
    'total_value',   coalesce(sum(expected_value) filter (where status = 'open'), 0),
    'weighted_value',coalesce(sum(weighted_value) filter (where status = 'open'), 0),
    'active_count',  count(*) filter (where status = 'open'),
    'avg_value',     coalesce(avg(expected_value) filter (where status = 'open'), 0),
    'won_count',     won_count,
    'lost_count',    lost_count,
    'win_rate',      case when won_count + lost_count = 0 then 0
                      else round(100.0 * won_count / (won_count + lost_count), 1) end
  ) into result
  from leads where p_pipeline is null or pipeline = p_pipeline;
  return result;
end;
$$;

grant execute on function sportconn.get_pipeline_metrics(text) to authenticated, service_role;
