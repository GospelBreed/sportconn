-- ============================================================================
-- Roseway CRM — migration 0002: dealflow layer
--
-- Adds the sales / engagement surface on top of the resident-services core:
--   • leads                  — prospective property-management contacts + their
--                              own pipeline (new_lead → … → closed_won/lost)
--   • outreach               — logged email / call / LinkedIn / meeting touches
--   • campaigns              — marketing campaigns (email / LinkedIn / event)
--   • tasks                  — first-class to-dos with due dates + assignee
--   • experience_assessments — the resident-experience diagnostic (0–100 score,
--                              6 pillars, intake responses, recommended scope)
--
-- Also extends `activities` (lead_id + lead event types) and `notifications`
-- (task/lead assignment), wires realtime + RLS + grants, and adds a
-- `get_dashboard_summary()` RPC for the Dashboard page.
--
-- Run AFTER 0001_init.sql. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- LEADS
-- ----------------------------------------------------------------------------
create table if not exists roseway.leads (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  title             text,                          -- Community Manager, GM, VP Ops…
  email             text,
  phone             text,
  linkedin_url      text,
  company_name      text,                          -- management company
  property_name     text,                          -- community name (free text)
  property_id       uuid references roseway.properties(id) on delete set null,
  location_city     text,
  location_state    text,
  unit_count        integer check (unit_count is null or unit_count >= 0),
  asset_type        text not null default 'conventional'
                    check (asset_type in ('conventional','luxury','senior','affordable','mixed_use')),
  temperature       text not null default 'warm' check (temperature in ('hot','warm','cold')),
  experience_score  integer check (experience_score between 0 and 100),
  stage             text not null default 'new_lead'
                    check (stage in ('new_lead','contacted','qualified','discovery',
                                     'proposal','pilot','closed_won','closed_lost')),
  source            text not null default 'other'
                    check (source in ('res_exp_check','cold_email','linkedin','referral',
                                      'website','import','other')),
  assigned_to       uuid references roseway.users(id) on delete set null,
  estimated_arr     numeric(12,2) not null default 0,
  stage_entered_at  timestamptz not null default now(),
  next_follow_up_at timestamptz,
  last_activity_at  timestamptz not null default now(),
  converted_property_id uuid references roseway.properties(id) on delete set null,
  notes             text,
  created_by        uuid references roseway.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_leads_stage       on roseway.leads(stage);
create index if not exists idx_leads_temperature on roseway.leads(temperature);
create index if not exists idx_leads_assigned    on roseway.leads(assigned_to);
create index if not exists idx_leads_followup    on roseway.leads(next_follow_up_at);
create index if not exists idx_leads_property    on roseway.leads(property_id);

-- ----------------------------------------------------------------------------
-- CAMPAIGNS
-- ----------------------------------------------------------------------------
create table if not exists roseway.campaigns (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  channel        text not null default 'email' check (channel in ('email','linkedin','event','multi')),
  status         text not null default 'draft' check (status in ('draft','active','paused','completed')),
  goal           text,
  target_segment text,
  start_date     date,
  end_date       date,
  sent_count     integer not null default 0,
  reply_count    integer not null default 0,
  meeting_count  integer not null default 0,
  notes          text,
  created_by     uuid references roseway.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_campaigns_status on roseway.campaigns(status);

-- ----------------------------------------------------------------------------
-- OUTREACH
-- ----------------------------------------------------------------------------
create table if not exists roseway.outreach (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references roseway.leads(id) on delete cascade,
  campaign_id uuid references roseway.campaigns(id) on delete set null,
  channel     text not null default 'email'
              check (channel in ('email','call','linkedin','meeting','sms','other')),
  direction   text not null default 'outbound' check (direction in ('outbound','inbound')),
  subject     text,
  body        text,
  outcome     text not null default 'sent'
              check (outcome in ('sent','opened','replied','no_response','bounced','completed','scheduled')),
  occurred_at timestamptz not null default now(),
  created_by  uuid references roseway.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_outreach_lead     on roseway.outreach(lead_id, occurred_at desc);
create index if not exists idx_outreach_campaign on roseway.outreach(campaign_id);
create index if not exists idx_outreach_occurred on roseway.outreach(occurred_at desc);

-- ----------------------------------------------------------------------------
-- TASKS
-- ----------------------------------------------------------------------------
create table if not exists roseway.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  status        text not null default 'open' check (status in ('open','done')),
  priority      text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_at        timestamptz,
  assigned_to   uuid references roseway.users(id) on delete set null,
  lead_id       uuid references roseway.leads(id) on delete cascade,
  resident_id   uuid references roseway.residents(id) on delete cascade,
  case_id       uuid references roseway.cases(id) on delete cascade,
  property_id   uuid references roseway.properties(id) on delete set null,
  completed_at  timestamptz,
  created_by    uuid references roseway.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tasks_status   on roseway.tasks(status);
create index if not exists idx_tasks_due      on roseway.tasks(due_at);
create index if not exists idx_tasks_assigned on roseway.tasks(assigned_to);
create index if not exists idx_tasks_lead     on roseway.tasks(lead_id);

-- ----------------------------------------------------------------------------
-- EXPERIENCE ASSESSMENTS
-- ----------------------------------------------------------------------------
create table if not exists roseway.experience_assessments (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid references roseway.leads(id) on delete cascade,
  resident_id        uuid references roseway.residents(id) on delete cascade,
  property_id        uuid references roseway.properties(id) on delete set null,
  overall_score      integer not null check (overall_score between 0 and 100),
  synthesis          text,
  pillar_engagement  integer check (pillar_engagement between 0 and 100),
  pillar_programming integer check (pillar_programming between 0 and 100),
  pillar_belonging   integer check (pillar_belonging between 0 and 100),
  pillar_wellness    integer check (pillar_wellness between 0 and 100),
  pillar_resources   integer check (pillar_resources between 0 and 100),
  pillar_strategy    integer check (pillar_strategy between 0 and 100),
  responses          jsonb not null default '[]'::jsonb,   -- [{ q, a }]
  recommended_scope  text[] not null default '{}',
  submitted_at       timestamptz not null default now(),
  created_by         uuid references roseway.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint assessment_subject_present
    check (lead_id is not null or resident_id is not null or property_id is not null)
);

create index if not exists idx_assessments_lead     on roseway.experience_assessments(lead_id);
create index if not exists idx_assessments_property on roseway.experience_assessments(property_id);
create index if not exists idx_assessments_score    on roseway.experience_assessments(overall_score);

-- ----------------------------------------------------------------------------
-- EXTEND activities + notifications
-- ----------------------------------------------------------------------------
alter table roseway.activities add column if not exists lead_id uuid references roseway.leads(id) on delete cascade;
create index if not exists idx_activities_lead on roseway.activities(lead_id, created_at desc);

alter table roseway.activities drop constraint if exists activities_type_check;
alter table roseway.activities add constraint activities_type_check check (type in (
  'call','visit','note','stage_change','case_opened','case_closed','follow_up_set',
  'resident_created','system','lead_created','lead_stage_change','outreach','task_done'
));

alter table roseway.notifications drop constraint if exists notifications_type_check;
alter table roseway.notifications add constraint notifications_type_check check (type in (
  'follow_up_due','follow_up_overdue','case_assigned','stage_change',
  'lead_assigned','task_assigned','task_due'
));

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------
drop trigger if exists trg_leads_updated on roseway.leads;
create trigger trg_leads_updated before update on roseway.leads
  for each row execute function roseway.touch_updated_at();

drop trigger if exists trg_campaigns_updated on roseway.campaigns;
create trigger trg_campaigns_updated before update on roseway.campaigns
  for each row execute function roseway.touch_updated_at();

drop trigger if exists trg_tasks_updated on roseway.tasks;
create trigger trg_tasks_updated before update on roseway.tasks
  for each row execute function roseway.touch_updated_at();

create or replace function roseway.lead_label(s text)
returns text language sql immutable as $$
  select case s
    when 'new_lead' then 'New Lead'
    when 'contacted' then 'Contacted'
    when 'qualified' then 'Qualified'
    when 'discovery' then 'Discovery Call'
    when 'proposal' then 'Proposal'
    when 'pilot' then 'Pilot Term'
    when 'closed_won' then 'Closed Won'
    when 'closed_lost' then 'Closed Lost'
    else s end;
$$;

-- lead lifecycle: stamp stage_entered_at, log activity + assignment notification
create or replace function roseway.leads_before_write()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  if tg_op = 'INSERT' then
    new.stage_entered_at := now();
    new.last_activity_at := now();
  elsif tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_entered_at := now();
    new.last_activity_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists trg_leads_before_write on roseway.leads;
create trigger trg_leads_before_write before insert or update on roseway.leads
  for each row execute function roseway.leads_before_write();

create or replace function roseway.leads_after_insert()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  insert into roseway.activities (lead_id, property_id, type, description, created_by)
  values (new.id, new.property_id, 'lead_created',
          'Lead created: ' || new.full_name ||
          coalesce(' — ' || new.company_name, ''), auth.uid());
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    insert into roseway.notifications (user_id, type, title, body)
    values (new.assigned_to, 'lead_assigned', 'Lead assigned to you',
            new.full_name || coalesce(' · ' || new.company_name, ''));
  end if;
  return new;
end; $$;

drop trigger if exists trg_leads_after_insert on roseway.leads;
create trigger trg_leads_after_insert after insert on roseway.leads
  for each row execute function roseway.leads_after_insert();

create or replace function roseway.leads_after_update()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  if new.stage is distinct from old.stage then
    insert into roseway.activities (lead_id, property_id, type, description, created_by)
    values (new.id, new.property_id, 'lead_stage_change',
            roseway.lead_label(old.stage) || ' → ' || roseway.lead_label(new.stage), auth.uid());
  end if;
  if new.assigned_to is distinct from old.assigned_to
     and new.assigned_to is not null
     and new.assigned_to is distinct from auth.uid() then
    insert into roseway.notifications (user_id, type, title, body)
    values (new.assigned_to, 'lead_assigned', 'Lead assigned to you',
            new.full_name || coalesce(' · ' || new.company_name, ''));
  end if;
  return new;
end; $$;

drop trigger if exists trg_leads_after_update on roseway.leads;
create trigger trg_leads_after_update after update on roseway.leads
  for each row execute function roseway.leads_after_update();

-- outreach → bump lead.last_activity_at + timeline entry
create or replace function roseway.outreach_after_insert()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  update roseway.leads set last_activity_at = now() where id = new.lead_id;
  insert into roseway.activities (lead_id, type, description, created_by)
  values (new.lead_id, 'outreach',
          initcap(new.channel) || ' (' || new.outcome || ')' ||
          coalesce(': ' || new.subject, ''), coalesce(new.created_by, auth.uid()));
  if new.campaign_id is not null then
    update roseway.campaigns
      set sent_count    = sent_count + 1,
          reply_count   = reply_count + (case when new.outcome = 'replied' then 1 else 0 end),
          meeting_count = meeting_count + (case when new.channel = 'meeting' then 1 else 0 end)
      where id = new.campaign_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_outreach_after_insert on roseway.outreach;
create trigger trg_outreach_after_insert after insert on roseway.outreach
  for each row execute function roseway.outreach_after_insert();

-- tasks: completed_at + assignment notification
create or replace function roseway.tasks_before_write()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status = 'open' then
    new.completed_at := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_tasks_before_write on roseway.tasks;
create trigger trg_tasks_before_write before insert or update on roseway.tasks
  for each row execute function roseway.tasks_before_write();

create or replace function roseway.tasks_after_write()
returns trigger language plpgsql security definer set search_path = roseway, public as $$
begin
  if new.assigned_to is not null
     and new.assigned_to is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    insert into roseway.notifications (user_id, case_id, resident_id, type, title, body)
    values (new.assigned_to, new.case_id, new.resident_id, 'task_assigned',
            'Task assigned to you', new.title);
  end if;
  return new;
end; $$;

drop trigger if exists trg_tasks_after_write on roseway.tasks;
create trigger trg_tasks_after_write after insert or update on roseway.tasks
  for each row execute function roseway.tasks_after_write();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table roseway.leads                  enable row level security;
alter table roseway.campaigns              enable row level security;
alter table roseway.outreach               enable row level security;
alter table roseway.tasks                  enable row level security;
alter table roseway.experience_assessments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['leads','campaigns','outreach','tasks','experience_assessments'] loop
    execute format('drop policy if exists %1$s_select on roseway.%1$s', t);
    execute format('create policy %1$s_select on roseway.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_insert on roseway.%1$s', t);
    execute format('create policy %1$s_insert on roseway.%1$s for insert to authenticated with check (roseway.can_write())', t);
    execute format('drop policy if exists %1$s_update on roseway.%1$s', t);
    execute format('create policy %1$s_update on roseway.%1$s for update to authenticated using (roseway.can_write()) with check (roseway.can_write())', t);
    execute format('drop policy if exists %1$s_delete on roseway.%1$s', t);
    execute format('create policy %1$s_delete on roseway.%1$s for delete to authenticated using (roseway.can_write())', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- REALTIME
-- ----------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table roseway.leads;    exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table roseway.tasks;    exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table roseway.outreach; exception when others then null; end $$;

-- ----------------------------------------------------------------------------
-- GRANTS
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on
  roseway.leads, roseway.campaigns, roseway.outreach, roseway.tasks, roseway.experience_assessments
  to authenticated;
grant all on
  roseway.leads, roseway.campaigns, roseway.outreach, roseway.tasks, roseway.experience_assessments
  to service_role;
grant select on
  roseway.leads, roseway.campaigns, roseway.outreach, roseway.tasks, roseway.experience_assessments
  to anon;

-- ----------------------------------------------------------------------------
-- DASHBOARD RPC
-- ----------------------------------------------------------------------------
create or replace function roseway.get_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = roseway, public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_leads',      (select count(*) from leads where stage not in ('closed_won','closed_lost')),
    'new_qualified',    (select count(*) from leads where stage = 'qualified'),
    'hot_leads',        (select count(*) from leads
                           where temperature = 'hot' and stage not in ('closed_won','closed_lost')),
    'assessments_done', (select count(*) from experience_assessments),
    'consultations',    (select count(*) from leads where stage in ('discovery','proposal','pilot')),
    'pipeline_arr',     (select coalesce(sum(estimated_arr), 0) from leads
                           where stage not in ('closed_won','closed_lost')),
    'won_arr',          (select coalesce(sum(estimated_arr), 0) from leads where stage = 'closed_won'),
    'open_cases',       (select count(*) from cases where stage not in ('resolved','closed')),
    'at_risk_residents',(select count(*) from residents where status = 'at_risk'),
    'tasks_overdue',    (select count(*) from tasks where status = 'open' and due_at < now()),
    'tasks_today',      (select count(*) from tasks where status = 'open' and due_at::date = current_date),
    'overdue_followups',(select count(*) from leads
                           where stage not in ('closed_won','closed_lost') and next_follow_up_at < now()),
    'lead_flow', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'stage', s.stage, 'label', roseway.lead_label(s.stage),
               'count', coalesce(x.cnt, 0), 'arr', coalesce(x.arr, 0)) order by s.ord), '[]'::jsonb)
      from (values ('new_lead',1),('contacted',2),('qualified',3),('discovery',4),
                   ('proposal',5),('pilot',6),('closed_won',7)) as s(stage, ord)
      left join (select stage, count(*) cnt, sum(estimated_arr) arr from leads group by stage) x
        on x.stage = s.stage
    ),
    'temperature', jsonb_build_object(
      'hot',  (select count(*) from leads where temperature = 'hot'),
      'warm', (select count(*) from leads where temperature = 'warm'),
      'cold', (select count(*) from leads where temperature = 'cold')
    ),
    'experience_ranges', (
      select jsonb_build_array(
        jsonb_build_object('label','90–100 · Leader',       'count', (select count(*) from experience_assessments where overall_score >= 90)),
        jsonb_build_object('label','75–89 · Strong',        'count', (select count(*) from experience_assessments where overall_score between 75 and 89)),
        jsonb_build_object('label','50–74 · Growth Opp',    'count', (select count(*) from experience_assessments where overall_score between 50 and 74)),
        jsonb_build_object('label','0–49 · At Risk',        'count', (select count(*) from experience_assessments where overall_score < 50))
      )
    ),
    'demand_heatmap', (
      select coalesce(jsonb_agg(hm order by (hm->>'gap')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object('pillar', p.label, 'gap', round(100 - coalesce(avg(v.score), 100))) as hm
        from (values
          ('Resident Engagement','pillar_engagement'),
          ('Community Programming','pillar_programming'),
          ('Connection & Belonging','pillar_belonging'),
          ('Wellness & Lifestyle','pillar_wellness'),
          ('Resources & Comms','pillar_resources'),
          ('Strategy & Operations','pillar_strategy')
        ) as p(label, col)
        left join lateral (
          select case p.col
            when 'pillar_engagement' then pillar_engagement
            when 'pillar_programming' then pillar_programming
            when 'pillar_belonging' then pillar_belonging
            when 'pillar_wellness' then pillar_wellness
            when 'pillar_resources' then pillar_resources
            when 'pillar_strategy' then pillar_strategy
          end as score
          from experience_assessments
        ) v on true
        group by p.label
      ) t
    ),
    'median_experience', (
      select coalesce(round(percentile_cont(0.5) within group (order by overall_score))::int, 0)
      from experience_assessments
    )
  ) into result;
  return result;
end;
$$;

grant execute on function roseway.get_dashboard_summary() to authenticated, service_role;
