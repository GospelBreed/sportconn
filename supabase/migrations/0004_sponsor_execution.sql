-- ============================================================================
-- SportConn CRM — migration 0004: sponsor execution layer
--
-- Fills the gaps between the Sponsor pipeline (0002) and the Sponsorship
-- Acquisition SOP (score → qualify → propose → contract → get paid → deliver
-- → renew):
--   • leads (sponsor columns) — 10-point prospect score + tier, fit reason,
--                                package, decision date, contract / invoice /
--                                payment, vendor registration, renewal
--   • sponsor_packages         — the offer menu with list price AND the cost
--                                of delivering it (margin floor)
--   • lead_contacts            — extra contacts per company (SOP: two per company)
--   • deal_approvals           — written decision log for pricing exceptions,
--                                discounts, exclusivity, contract terms
--   • sponsor_deliverables     — what was promised, who owns it, proof it
--                                was delivered
--   • scorecard_targets        — the 30-day scorecard targets (data, not code)
--   • get_sponsor_scorecard()  — live scorecard for a date window
--
-- Controls enforced in the database (not just the UI):
--   • A sponsor deal can only move to a Won stage when the contract is signed,
--     payment is confirmed, and any price below the package list price has an
--     approved pricing exception / discount.
--   • Approvals can only be decided by super_admin / admin / management.
--   • A deliverable can only be marked delivered with proof attached.
--
-- Run AFTER 0003. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Approver role helper
-- ----------------------------------------------------------------------------
create or replace function sportconn.can_approve()
returns boolean language sql stable as $$
  select sportconn.jwt_role() in ('super_admin','admin','management');
$$;

-- ----------------------------------------------------------------------------
-- SPONSOR PACKAGES (offer menu + cost of delivery)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.sponsor_packages (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  description     text,
  list_price      numeric(14,2) not null check (list_price >= 0),
  delivery_cost   numeric(14,2) check (delivery_cost is null or delivery_cost >= 0),
  min_margin_pct  integer not null default 30 check (min_margin_pct between 0 and 100),
  currency        text not null default 'NGN',
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- SOP proposed asking prices (upper end of each range). Delivery cost is left
-- empty on purpose: it has to be worked out before the package is sold.
insert into sportconn.sponsor_packages (name, description, list_price, sort_order) values
  ('Community Prize Partner', 'Small cash contribution or product prizes.',             250000,   1),
  ('Predict & Win Pilot',     'One sponsored campaign lasting 2–4 weeks.',              1000000,  2),
  ('Silver Partner',          'Broader campaign with additional placements.',           2000000,  3),
  ('Gold Partner',            'Larger activation with multiple campaign components.',   5000000,  4),
  ('Presenting Partner',      'Flagship campaign with premium integration.',            10000000, 5)
on conflict (name) do nothing;

drop trigger if exists trg_sponsor_packages_updated on sportconn.sponsor_packages;
create trigger trg_sponsor_packages_updated before update on sportconn.sponsor_packages
  for each row execute function sportconn.touch_updated_at();

-- ----------------------------------------------------------------------------
-- LEADS — sponsor execution columns
-- ----------------------------------------------------------------------------
alter table sportconn.leads
  add column if not exists score_sports_fans    smallint check (score_sports_fans    between 0 and 2),
  add column if not exists score_audience_fit   smallint check (score_audience_fit   between 0 and 2),
  add column if not exists score_budget         smallint check (score_budget         between 0 and 2),
  add column if not exists score_decision_maker smallint check (score_decision_maker between 0 and 2),
  add column if not exists score_opportunity    smallint check (score_opportunity    between 0 and 2),
  add column if not exists fit_reason           text,
  add column if not exists package_id           uuid references sportconn.sponsor_packages(id) on delete set null,
  add column if not exists expected_decision_date date,
  add column if not exists contract_status      text not null default 'not_started'
                           check (contract_status in ('not_started','drafting','sent','signed')),
  add column if not exists contract_value       numeric(14,2) check (contract_value is null or contract_value >= 0),
  add column if not exists invoice_number       text,
  add column if not exists payment_status       text not null default 'not_invoiced'
                           check (payment_status in ('not_invoiced','invoiced','part_paid','paid')),
  add column if not exists payment_due_date     date,
  add column if not exists amount_received      numeric(14,2) check (amount_received is null or amount_received >= 0),
  add column if not exists paid_at              timestamptz,
  add column if not exists vendor_registration  text
                           check (vendor_registration is null or vendor_registration in ('not_required','required','in_progress','approved')),
  add column if not exists renewal_status       text
                           check (renewal_status is null or renewal_status in ('not_started','discussing','renewed','not_renewing')),
  add column if not exists renewal_due_date     date;

-- 10-point score (SOP §4): five factors, 0–2 each. Null until scored.
alter table sportconn.leads
  add column if not exists prospect_score integer generated always as (
    case when coalesce(score_sports_fans, score_audience_fit, score_budget, score_decision_maker, score_opportunity) is null
         then null
         else coalesce(score_sports_fans,0) + coalesce(score_audience_fit,0) + coalesce(score_budget,0)
            + coalesce(score_decision_maker,0) + coalesce(score_opportunity,0)
    end
  ) stored;

create index if not exists idx_leads_package  on sportconn.leads(package_id);
create index if not exists idx_leads_paid_at  on sportconn.leads(paid_at);

-- ----------------------------------------------------------------------------
-- LEAD CONTACTS — more than one person per company
-- ----------------------------------------------------------------------------
create table if not exists sportconn.lead_contacts (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references sportconn.leads(id) on delete cascade,
  full_name     text not null,
  title         text,
  email         text,
  phone         text,
  linkedin_url  text,
  relevance     text,
  created_by    uuid references sportconn.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_lead_contacts_lead on sportconn.lead_contacts(lead_id);

-- ----------------------------------------------------------------------------
-- DEAL APPROVALS — written decision log
-- ----------------------------------------------------------------------------
create table if not exists sportconn.deal_approvals (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references sportconn.leads(id) on delete cascade,
  approval_type  text not null check (approval_type in (
                   'pricing_exception','discount','exclusivity','contract_terms','unusual_deliverable','other'
                 )),
  summary        text not null check (length(trim(summary)) > 0),
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by   uuid references sportconn.users(id) on delete set null,
  requested_at   timestamptz not null default now(),
  decided_by     uuid references sportconn.users(id) on delete set null,
  decided_at     timestamptz,
  decision_note  text
);
create index if not exists idx_deal_approvals_lead   on sportconn.deal_approvals(lead_id);
create index if not exists idx_deal_approvals_status on sportconn.deal_approvals(status);

create or replace function sportconn.deal_approvals_before_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.requested_by := coalesce(new.requested_by, auth.uid());
    new.requested_at := now();
    new.decided_by := null;
    new.decided_at := null;
  elsif new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'This approval has already been decided. Raise a new request instead.';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists trg_deal_approvals_before_write on sportconn.deal_approvals;
create trigger trg_deal_approvals_before_write before insert or update on sportconn.deal_approvals
  for each row execute function sportconn.deal_approvals_before_write();

create or replace function sportconn.deal_approvals_after_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if tg_op = 'INSERT' then
    insert into sportconn.activities (lead_id, type, description, created_by)
    values (new.lead_id, 'system',
            'Approval requested (' || replace(new.approval_type, '_', ' ') || '): ' || new.summary, auth.uid());
  elsif new.status is distinct from old.status then
    insert into sportconn.activities (lead_id, type, description, created_by)
    values (new.lead_id, 'system',
            'Approval ' || new.status || ' (' || replace(new.approval_type, '_', ' ') || ')'
            || coalesce(': ' || nullif(new.decision_note, ''), ''), auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_deal_approvals_after_write on sportconn.deal_approvals;
create trigger trg_deal_approvals_after_write after insert or update on sportconn.deal_approvals
  for each row execute function sportconn.deal_approvals_after_write();

-- ----------------------------------------------------------------------------
-- SPONSOR DELIVERABLES — what was promised, and proof it was delivered
-- ----------------------------------------------------------------------------
create table if not exists sportconn.sponsor_deliverables (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references sportconn.leads(id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  due_date      date,
  owner         uuid references sportconn.users(id) on delete set null,
  status        text not null default 'planned' check (status in ('planned','in_progress','delivered','cancelled')),
  proof         text,
  delivered_at  timestamptz,
  created_by    uuid references sportconn.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_sponsor_deliverables_lead on sportconn.sponsor_deliverables(lead_id);

drop trigger if exists trg_sponsor_deliverables_updated on sportconn.sponsor_deliverables;
create trigger trg_sponsor_deliverables_updated before update on sportconn.sponsor_deliverables
  for each row execute function sportconn.touch_updated_at();

create or replace function sportconn.sponsor_deliverables_before_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.status = 'delivered' then
    if nullif(trim(coalesce(new.proof, '')), '') is null then
      raise exception 'Add proof (a link or a short description) before marking a deliverable delivered.';
    end if;
    if tg_op = 'INSERT' or old.status <> 'delivered' then
      new.delivered_at := now();
    end if;
  else
    new.delivered_at := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sponsor_deliverables_before_write on sportconn.sponsor_deliverables;
create trigger trg_sponsor_deliverables_before_write before insert or update on sportconn.sponsor_deliverables
  for each row execute function sportconn.sponsor_deliverables_before_write();

create or replace function sportconn.sponsor_deliverables_after_write()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.status = 'delivered' and (tg_op = 'INSERT' or old.status <> 'delivered') then
    insert into sportconn.activities (lead_id, type, description, created_by)
    values (new.lead_id, 'system', 'Deliverable delivered: ' || new.title, auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_sponsor_deliverables_after_write on sportconn.sponsor_deliverables;
create trigger trg_sponsor_deliverables_after_write after insert or update on sportconn.sponsor_deliverables
  for each row execute function sportconn.sponsor_deliverables_after_write();

-- ----------------------------------------------------------------------------
-- SPONSOR WON GATE — no "won" without a signed contract, confirmed payment,
-- and approval for any price below the package list price.
-- ----------------------------------------------------------------------------
create or replace function sportconn.leads_sponsor_gate()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
declare
  flags     record;
  list      numeric;
  deal      numeric;
begin
  if new.payment_status = 'paid' and (tg_op = 'INSERT' or old.payment_status is distinct from 'paid') then
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.payment_status <> 'paid' then
    new.paid_at := null;
  end if;

  if new.pipeline <> 'sponsor' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then
    return new;
  end if;

  select * into flags from sportconn.stage_flags(new.pipeline, new.stage);
  if not flags.is_won then
    return new;
  end if;

  if new.contract_status <> 'signed' then
    raise exception 'A sponsor deal can only be marked Won once the contract is signed.';
  end if;
  if new.payment_status <> 'paid' then
    raise exception 'A sponsor deal can only be marked Won once payment is confirmed. Use the Payment Pending stage until then.';
  end if;

  if new.package_id is not null then
    select list_price into list from sportconn.sponsor_packages where id = new.package_id;
    deal := coalesce(new.contract_value, new.expected_value);
    if list is not null and deal is not null and deal < list and not exists (
      select 1 from sportconn.deal_approvals
       where lead_id = new.id and status = 'approved'
         and approval_type in ('pricing_exception','discount')
    ) then
      raise exception 'The agreed price is below the package list price. It needs an approved pricing exception or discount first.';
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_leads_sponsor_gate on sportconn.leads;
create trigger trg_leads_sponsor_gate before insert or update on sportconn.leads
  for each row execute function sportconn.leads_sponsor_gate();

-- ----------------------------------------------------------------------------
-- SCORECARD TARGETS (SOP §11 — initial operating targets, editable data)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.scorecard_targets (
  metric      text primary key,
  label       text not null,
  target_min  integer not null check (target_min >= 0),
  target_max  integer check (target_max is null or target_max >= target_min),
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

insert into sportconn.scorecard_targets (metric, label, target_min, target_max, sort_order) values
  ('companies',      'Target companies',     30, null, 1),
  ('contacts',       'Contacts identified',  60, null, 2),
  ('first_contacts', 'First contacts',       40, 60,   3),
  ('meetings',       'Meetings held',         5, 8,    4),
  ('proposals',      'Proposals sent',        3, 5,    5),
  ('paid',           'Paid sponsors',         1, 3,    6)
on conflict (metric) do nothing;

drop trigger if exists trg_scorecard_targets_updated on sportconn.scorecard_targets;
create trigger trg_scorecard_targets_updated before update on sportconn.scorecard_targets
  for each row execute function sportconn.touch_updated_at();

-- ----------------------------------------------------------------------------
-- SCORECARD RPC — live counts for a window (default: last 30 days)
--   companies       sponsor leads in the pipeline (not lost) at the end of the window
--   contacts        named people on those leads (lead record with contact details + extra contacts)
--   first_contacts  sponsor leads whose first outbound touch fell in the window
--   replies         sponsor leads that replied in the window
--   meetings        meetings logged in the window
--   proposals       proposals logged in the window
--   paid            sponsor deals with payment confirmed in the window
--   paid_value      value of those deals
--   pipeline_value  open sponsor pipeline value now
-- ----------------------------------------------------------------------------
create or replace function sportconn.get_sponsor_scorecard(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = sportconn, public
as $$
declare
  v_to   timestamptz := coalesce(p_to, current_date)::timestamptz + interval '1 day';
  v_from timestamptz := coalesce(p_from, coalesce(p_to, current_date) - 29)::timestamptz;
  result jsonb;
begin
  with sl as (
    select * from leads where pipeline = 'sponsor'
  ),
  in_pipe as (
    select * from sl where created_at < v_to and status <> 'lost'
  ),
  touches as (
    select o.* from outreach o join sl on sl.id = o.lead_id
  ),
  first_touch as (
    select lead_id, min(occurred_at) as first_at from touches where direction = 'outbound' group by lead_id
  )
  select jsonb_build_object(
    'from', v_from::date,
    'to',   (v_to - interval '1 day')::date,
    'companies', (select count(*) from in_pipe),
    'contacts',  (select count(*) from in_pipe
                   where coalesce(email, phone, whatsapp, linkedin_url) is not null)
               + (select count(*) from lead_contacts c join in_pipe p on p.id = c.lead_id),
    'first_contacts', (select count(*) from first_touch where first_at >= v_from and first_at < v_to),
    'replies',   (select count(distinct lead_id) from touches
                   where occurred_at >= v_from and occurred_at < v_to
                     and (outcome = 'replied' or direction = 'inbound')),
    'meetings',  (select count(*) from touches
                   where occurred_at >= v_from and occurred_at < v_to
                     and channel in ('meeting','sponsor_meeting') and outcome in ('completed','replied')),
    'proposals', (select count(distinct lead_id) from touches
                   where occurred_at >= v_from and occurred_at < v_to and channel = 'proposal'),
    'paid',       (select count(*) from sl where paid_at >= v_from and paid_at < v_to),
    'paid_value', (select coalesce(sum(coalesce(contract_value, expected_value)), 0) from sl
                    where paid_at >= v_from and paid_at < v_to),
    'pipeline_value', (select coalesce(sum(expected_value), 0) from sl where status = 'open'),
    'pending_approvals', (select count(*) from deal_approvals a join sl on sl.id = a.lead_id where a.status = 'pending'),
    'targets', (select coalesce(jsonb_agg(jsonb_build_object(
                  'metric', metric, 'label', label, 'target_min', target_min, 'target_max', target_max)
                  order by sort_order), '[]'::jsonb) from scorecard_targets)
  ) into result;
  return result;
end;
$$;

grant execute on function sportconn.get_sponsor_scorecard(date, date) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table sportconn.sponsor_packages     enable row level security;
alter table sportconn.lead_contacts        enable row level security;
alter table sportconn.deal_approvals       enable row level security;
alter table sportconn.sponsor_deliverables enable row level security;
alter table sportconn.scorecard_targets    enable row level security;

-- packages + targets: everyone reads; approvers maintain them
do $$
declare t text;
begin
  foreach t in array array['sponsor_packages','scorecard_targets'] loop
    execute format('drop policy if exists %1$s_select on sportconn.%1$s', t);
    execute format('create policy %1$s_select on sportconn.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on sportconn.%1$s', t);
    execute format('create policy %1$s_write on sportconn.%1$s for all to authenticated using (sportconn.can_approve()) with check (sportconn.can_approve())', t);
  end loop;
end $$;

-- contacts + deliverables: the standard write/delete matrix
do $$
declare t text;
begin
  foreach t in array array['lead_contacts','sponsor_deliverables'] loop
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

-- approvals: anyone who can write may request; only approvers decide; never deleted
drop policy if exists deal_approvals_select on sportconn.deal_approvals;
create policy deal_approvals_select on sportconn.deal_approvals for select to authenticated using (true);
drop policy if exists deal_approvals_insert on sportconn.deal_approvals;
create policy deal_approvals_insert on sportconn.deal_approvals for insert to authenticated
  with check (sportconn.can_write());
drop policy if exists deal_approvals_update on sportconn.deal_approvals;
create policy deal_approvals_update on sportconn.deal_approvals for update to authenticated
  using (sportconn.can_approve()) with check (sportconn.can_approve());

-- ----------------------------------------------------------------------------
-- REALTIME + GRANTS
-- ----------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table sportconn.deal_approvals;       exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table sportconn.sponsor_deliverables; exception when others then null; end $$;

grant select, insert, update, delete on
  sportconn.sponsor_packages, sportconn.lead_contacts, sportconn.deal_approvals,
  sportconn.sponsor_deliverables, sportconn.scorecard_targets
  to authenticated;
grant all on
  sportconn.sponsor_packages, sportconn.lead_contacts, sportconn.deal_approvals,
  sportconn.sponsor_deliverables, sportconn.scorecard_targets
  to service_role;
