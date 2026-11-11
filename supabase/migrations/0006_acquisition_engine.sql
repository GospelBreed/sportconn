-- ============================================================================
-- SportConn CRM — migration 0006: Partnership Acquisition Engine foundation
--
-- Prepares the CRM to receive researched leads from the AI Partnership
-- Acquisition Engine (n8n + Claude), per the SPIE blueprint:
--
--   • 100-point qualification score (replaces the 10-point score from 0004):
--       audience alignment 25 · marketing & sponsorship potential 20 ·
--       partnership activity evidence 15 · identifiable collaboration 15 ·
--       decision-maker accessibility 15 · contact information quality 10
--     ≥ 65 qualifies, ≥ 80 is priority.
--   • Company-level duplicate prevention: leads.company_domain (normalised,
--     unique) + leads.company_key (normalised name, for matching).
--   • lead_research — versioned research profiles with source URLs, verified
--     facts and assumptions kept apart.
--   • suppressions — permanent do-not-contact list by email or domain. It is
--     NOT tied to the lead's lifetime: deleting a lead keeps its suppression.
--   • leads.source 'ai_engine', engine_runs (daily run log).
--   • engine_upsert_lead() / engine_check_leads() — the only way the engine
--     writes: one transaction per lead, validated, deduplicated, audited.
--     Executable by the service role only (the `engine-api` Edge Function).
--
-- Run AFTER 0005. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- NORMALISERS
-- ----------------------------------------------------------------------------

-- "https://www.Example.com/about" / "jane@example.com" → "example.com"
create or replace function sportconn.normalize_domain(p text)
returns text language plpgsql immutable as $$
declare
  d text := lower(trim(coalesce(p, '')));
begin
  if d = '' then return null; end if;
  if position('@' in d) > 0 and d !~ '^[a-z][a-z0-9+.-]*://' then
    d := split_part(d, '@', 2);
  end if;
  d := regexp_replace(d, '^[a-z][a-z0-9+.-]*://', '');
  d := regexp_replace(d, '^[^@/]*@', '');
  d := regexp_replace(d, '[/?#:].*$', '');
  d := regexp_replace(d, '^www[0-9]*\.', '');
  d := trim(both '.' from d);
  if d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then return null; end if;
  return d;
end; $$;

create or replace function sportconn.is_free_email_domain(p text)
returns boolean language sql immutable as $$
  select coalesce(p, '') = any (array[
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com','rocketmail.com',
    'hotmail.com','outlook.com','live.com','msn.com','icloud.com','me.com','aol.com',
    'proton.me','protonmail.com','gmx.com','zoho.com','mail.com','yandex.com'
  ]);
$$;

-- "The Coca-Cola Company Nigeria Ltd" → "cocacola". Used to MATCH leads that
-- have no domain yet; never as a uniqueness rule (different companies can
-- normalise to the same name).
create or replace function sportconn.normalize_company_name(p text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(p, '')), '&', ' and ', 'g'),
        '\m(ltd|limited|plc|inc|incorporated|llc|nigeria|ng|group|holdings|company|co|the|international|intl)\M',
        ' ', 'g'),
      '[^a-z0-9]', '', 'g'),
    '');
$$;

-- ----------------------------------------------------------------------------
-- LEADS — 100-point score (replaces 0004's five 0–2 factors)
-- ----------------------------------------------------------------------------
alter table sportconn.leads drop column if exists prospect_score;
alter table sportconn.leads
  drop column if exists score_sports_fans,
  drop column if exists score_audience_fit,
  drop column if exists score_budget,
  drop column if exists score_decision_maker,
  drop column if exists score_opportunity;

alter table sportconn.leads
  add column if not exists score_audience             smallint check (score_audience             between 0 and 25),
  add column if not exists score_marketing            smallint check (score_marketing            between 0 and 20),
  add column if not exists score_partnership_evidence smallint check (score_partnership_evidence between 0 and 15),
  add column if not exists score_collaboration        smallint check (score_collaboration        between 0 and 15),
  add column if not exists score_decision_access      smallint check (score_decision_access      between 0 and 15),
  add column if not exists score_contact_quality      smallint check (score_contact_quality      between 0 and 10);

alter table sportconn.leads
  add column prospect_score integer generated always as (
    case when coalesce(score_audience, score_marketing, score_partnership_evidence,
                       score_collaboration, score_decision_access, score_contact_quality) is null
         then null
         else coalesce(score_audience,0) + coalesce(score_marketing,0) + coalesce(score_partnership_evidence,0)
            + coalesce(score_collaboration,0) + coalesce(score_decision_access,0) + coalesce(score_contact_quality,0)
    end
  ) stored;

create index if not exists idx_leads_prospect_score on sportconn.leads(prospect_score);

-- ----------------------------------------------------------------------------
-- LEADS — company identity, engine provenance
-- ----------------------------------------------------------------------------
alter table sportconn.leads
  add column if not exists company_domain     text,
  add column if not exists last_researched_at timestamptz;

alter table sportconn.leads drop column if exists company_key;
alter table sportconn.leads
  add column company_key text generated always as (
    sportconn.normalize_company_name(coalesce(company_name, full_name))
  ) stored;

create index if not exists idx_leads_company_key on sportconn.leads(company_key);
create index if not exists idx_leads_created_at  on sportconn.leads(created_at);

-- 'ai_engine' joins the lead sources.
alter table sportconn.leads drop constraint if exists leads_source_check;
alter table sportconn.leads add constraint leads_source_check check (source in (
  'field_sales','referral','website','social_media','linkedin','instagram',
  'facebook','whatsapp','email','event','campaign','existing_network',
  'investor_outreach','sponsor_outreach','facility_outreach','organic',
  'import','ai_engine','other'
));

-- Domain is derived from company_domain, else website, else a business (non-
-- free-mail) email address; one lead per company domain.
create or replace function sportconn.leads_company_domain()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
declare
  d     text;
  other text;
begin
  if tg_op = 'UPDATE'
     and new.company_domain is not distinct from old.company_domain
     and new.website is not distinct from old.website
     and new.email is not distinct from old.email then
    return new;
  end if;

  d := sportconn.normalize_domain(new.company_domain);
  if d is null then d := sportconn.normalize_domain(new.website); end if;
  if d is null and new.email is not null then
    d := sportconn.normalize_domain((regexp_match(new.email, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'))[1]);
    if sportconn.is_free_email_domain(d) then d := null; end if;
  end if;
  new.company_domain := d;

  if d is not null then
    select coalesce(company_name, full_name) into other
      from sportconn.leads where company_domain = d and id <> new.id limit 1;
    if other is not null then
      raise exception 'A lead for % already exists (%). Open that lead instead of adding a new one.', d, other;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_leads_company_domain on sportconn.leads;
create trigger trg_leads_company_domain before insert or update on sportconn.leads
  for each row execute function sportconn.leads_company_domain();

-- Backfill existing rows (first lead per domain keeps it).
with derived as (
  select id, created_at,
         coalesce(
           sportconn.normalize_domain(website),
           case when not sportconn.is_free_email_domain(
                       sportconn.normalize_domain((regexp_match(email, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'))[1]))
                then sportconn.normalize_domain((regexp_match(email, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'))[1])
           end) as d
    from sportconn.leads
   where company_domain is null
), ranked as (
  select id, d, row_number() over (partition by d order by created_at) as rn from derived where d is not null
)
update sportconn.leads l
   set company_domain = r.d
  from ranked r
 where l.id = r.id and r.rn = 1
   and not exists (select 1 from sportconn.leads x where x.company_domain = r.d);

create unique index if not exists uq_leads_company_domain
  on sportconn.leads(company_domain) where company_domain is not null;

-- One row per email per lead in the contacts list.
create unique index if not exists uq_lead_contacts_email
  on sportconn.lead_contacts(lead_id, lower(email)) where email is not null;

-- ----------------------------------------------------------------------------
-- SUPPRESSIONS — permanent do-not-contact list
-- ----------------------------------------------------------------------------
create table if not exists sportconn.suppressions (
  id          uuid primary key default gen_random_uuid(),
  email       text,
  domain      text,
  reason      text not null check (reason in (
                'unsubscribed','opt_out_request','bounced','complained','do_not_contact','manual','other'
              )),
  source      text not null default 'manual',     -- manual | lead_opt_out | engine | resend …
  note        text,
  lead_id     uuid references sportconn.leads(id) on delete set null,
  created_by  uuid references sportconn.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint suppressions_one_target check (num_nonnulls(email, domain) = 1)
);

create or replace function sportconn.suppressions_normalize()
returns trigger language plpgsql as $$
begin
  if new.email is not null then
    new.email := lower(trim(new.email));
    if new.email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
      raise exception 'That isn''t a valid email address.';
    end if;
  end if;
  if new.domain is not null then
    new.domain := sportconn.normalize_domain(new.domain);
    if new.domain is null then raise exception 'That isn''t a valid domain.'; end if;
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end; $$;

drop trigger if exists trg_suppressions_normalize on sportconn.suppressions;
create trigger trg_suppressions_normalize before insert or update on sportconn.suppressions
  for each row execute function sportconn.suppressions_normalize();

create unique index if not exists uq_suppressions_email  on sportconn.suppressions(email)  where email is not null;
create unique index if not exists uq_suppressions_domain on sportconn.suppressions(domain) where domain is not null;

-- Suppressed if the address, its domain, or a parent domain is on the list.
create or replace function sportconn.is_domain_suppressed(p_domain text)
returns boolean language sql stable security definer set search_path = sportconn, public as $$
  select exists (
    select 1 from sportconn.suppressions s
     where s.domain is not null
       and (sportconn.normalize_domain(p_domain) = s.domain
            or sportconn.normalize_domain(p_domain) like '%.' || s.domain)
  );
$$;

create or replace function sportconn.is_suppressed(p_email text)
returns boolean language sql stable security definer set search_path = sportconn, public as $$
  select exists (select 1 from sportconn.suppressions where email = lower(trim(coalesce(p_email, ''))))
      or sportconn.is_domain_suppressed(split_part(lower(trim(coalesce(p_email, ''))), '@', 2));
$$;

-- Ticking "Do not email" on a lead suppresses its addresses permanently;
-- unticking removes only the entries that tick created.
create or replace function sportconn.leads_opt_out_suppress()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.email_opt_out and (tg_op = 'INSERT' or not old.email_opt_out) then
    insert into sportconn.suppressions (email, reason, source, lead_id, created_by)
    select lower(m[1]), 'opt_out_request', 'lead_opt_out', new.id, auth.uid()
      from regexp_matches(coalesce(new.email, ''), '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') as m
    on conflict (email) where email is not null do nothing;
  elsif tg_op = 'UPDATE' and old.email_opt_out and not new.email_opt_out then
    delete from sportconn.suppressions where lead_id = new.id and source = 'lead_opt_out';
  end if;
  return new;
end; $$;

drop trigger if exists trg_leads_opt_out_suppress on sportconn.leads;
create trigger trg_leads_opt_out_suppress after insert or update on sportconn.leads
  for each row execute function sportconn.leads_opt_out_suppress();

-- ----------------------------------------------------------------------------
-- ENGINE RUNS — one row per daily discovery run (written by the engine API)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.engine_runs (
  id               uuid primary key default gen_random_uuid(),
  run_date         date not null default (now() at time zone 'Africa/Lagos')::date,
  status           text not null default 'running' check (status in ('running','completed','partial','failed')),
  target           integer check (target is null or target >= 0),
  created_count    integer not null default 0 check (created_count >= 0),
  updated_count    integer not null default 0 check (updated_count >= 0),
  duplicate_count  integer not null default 0 check (duplicate_count >= 0),
  rejected_count   integer not null default 0 check (rejected_count >= 0),
  notes            text,
  errors           jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index if not exists idx_engine_runs_date on sportconn.engine_runs(run_date desc);

alter table sportconn.leads
  add column if not exists engine_run_id uuid references sportconn.engine_runs(id) on delete set null;

-- ----------------------------------------------------------------------------
-- LEAD RESEARCH — versioned research profiles (latest = current)
-- ----------------------------------------------------------------------------
create table if not exists sportconn.lead_research (
  id                    uuid primary key default gen_random_uuid(),
  lead_id               uuid not null references sportconn.leads(id) on delete cascade,
  research_date         date not null default (now() at time zone 'Africa/Lagos')::date,
  company_overview      text,
  target_audience       text,
  marketing_activities  jsonb not null default '[]'::jsonb check (jsonb_typeof(marketing_activities) = 'array'),
  sponsorship_history   jsonb not null default '[]'::jsonb check (jsonb_typeof(sponsorship_history) = 'array'),
  business_objective    text,
  partnership_gap       text,
  sportconn_opportunity text,
  potential_value       text,
  verified_facts        jsonb not null default '[]'::jsonb check (jsonb_typeof(verified_facts) = 'array'),
  assumptions           jsonb not null default '[]'::jsonb check (jsonb_typeof(assumptions) = 'array'),
  sources               jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  qualification_score   integer check (qualification_score between 0 and 100),
  score_breakdown       jsonb not null default '{}'::jsonb,
  origin                text not null default 'ai_engine' check (origin in ('ai_engine','manual')),
  engine_run_id         uuid references sportconn.engine_runs(id) on delete set null,
  created_by            uuid references sportconn.users(id) on delete set null,
  created_at            timestamptz not null default now()
);
create index if not exists idx_lead_research_lead on sportconn.lead_research(lead_id, created_at desc);

-- ----------------------------------------------------------------------------
-- ENGINE: CHECK CANDIDATES (duplicates + suppression) — batch, read-only
--   p = {"candidates":[{"domain"|"website"|"email"|"company_name"}]}
-- ----------------------------------------------------------------------------
create or replace function sportconn.engine_check_leads(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = sportconn, public as $$
declare
  c        jsonb;
  out      jsonb := '[]'::jsonb;
  d        text;
  em       text;
  k        text;
  hit      sportconn.leads;
  match_on text;
begin
  for c in select * from jsonb_array_elements(coalesce(p->'candidates', '[]'::jsonb)) loop
    em := nullif(lower(trim(coalesce(c->>'email', ''))), '');
    d  := coalesce(sportconn.normalize_domain(c->>'domain'), sportconn.normalize_domain(c->>'website'));
    if d is null and em is not null and not sportconn.is_free_email_domain(sportconn.normalize_domain(em)) then
      d := sportconn.normalize_domain(em);
    end if;
    k := sportconn.normalize_company_name(c->>'company_name');
    hit := null; match_on := null;

    if d is not null then
      select * into hit from leads where company_domain = d limit 1;
      if hit.id is not null then match_on := 'domain'; end if;
    end if;
    if hit.id is null and em is not null then
      select l.* into hit from leads l
       where lower(l.email) like '%' || em || '%'
          or exists (select 1 from lead_contacts lc where lc.lead_id = l.id and lower(lc.email) = em)
       limit 1;
      if hit.id is not null then match_on := 'email'; end if;
    end if;
    if hit.id is null and k is not null then
      select * into hit from leads where company_key = k limit 1;
      if hit.id is not null then match_on := 'company_name'; end if;
    end if;

    out := out || jsonb_build_array(jsonb_build_object(
      'input', c,
      'domain', d,
      'match', case when hit.id is null then null else jsonb_build_object(
                 'lead_id', hit.id, 'name', coalesce(hit.company_name, hit.full_name), 'domain', hit.company_domain,
                 'pipeline', hit.pipeline, 'stage', hit.stage, 'status', hit.status) end,
      'match_on', match_on,
      'domain_suppressed', d is not null and sportconn.is_domain_suppressed(d),
      'email_suppressed',  em is not null and sportconn.is_suppressed(em)
    ));
  end loop;
  return jsonb_build_object('ok', true, 'results', out);
end; $$;

-- ----------------------------------------------------------------------------
-- ENGINE: UPSERT ONE RESEARCHED LEAD — validated, deduplicated, audited.
-- Returns {ok:true, action:'created'|'updated', ...} or {ok:false, error, message}.
-- ----------------------------------------------------------------------------
create or replace function sportconn.engine_upsert_lead(p jsonb, p_actor uuid, p_min_score integer default 65)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  v_pipeline text := coalesce(nullif(p->>'pipeline', ''), 'sponsor');
  co         jsonb := coalesce(p->'company', '{}'::jsonb);
  intel      jsonb := coalesce(p->'intelligence', '{}'::jsonb);
  sc         jsonb := coalesce(p->'scores', '{}'::jsonb);
  contacts   jsonb := coalesce(p->'contacts', '[]'::jsonb);
  v_sources  jsonb := coalesce(intel->'sources', '[]'::jsonb);
  v_name     text := nullif(trim(co->>'name'), '');
  v_domain   text := coalesce(sportconn.normalize_domain(co->>'domain'), sportconn.normalize_domain(co->>'website'));
  v_run      uuid;
  s_aud int; s_mkt int; s_evi int; s_col int; s_dec int; s_con int;
  v_total    int;
  ex         sportconn.leads;
  v_match    text;
  v_lead     uuid;
  v_action   text;
  v_stage    text;
  pc         jsonb;
  c          jsonb;
  c_email    text;
  v_primary_email text;
  added      int := 0;
  skipped    jsonb := '[]'::jsonb;
  v_research uuid;
  src        jsonb;
begin
  -- -------- validation --------
  if v_pipeline not in ('sponsor', 'strategic_partnership') then
    return jsonb_build_object('ok', false, 'error', 'invalid_pipeline', 'message', 'pipeline must be sponsor or strategic_partnership');
  end if;
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'missing_company_name', 'message', 'company.name is required');
  end if;
  if v_domain is null or sportconn.is_free_email_domain(v_domain) then
    return jsonb_build_object('ok', false, 'error', 'missing_domain', 'message', 'company.website or company.domain must be the company''s own domain (used for duplicate checks)');
  end if;
  if jsonb_typeof(contacts) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_contacts', 'message', 'contacts must be an array');
  end if;

  begin
    s_aud := (sc->>'audience')::int;            s_mkt := (sc->>'marketing')::int;
    s_evi := (sc->>'partnership_evidence')::int; s_col := (sc->>'collaboration')::int;
    s_dec := (sc->>'decision_access')::int;      s_con := (sc->>'contact_quality')::int;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_scores', 'message', 'scores must be whole numbers');
  end;
  if s_aud is null or s_mkt is null or s_evi is null or s_col is null or s_dec is null or s_con is null then
    return jsonb_build_object('ok', false, 'error', 'missing_scores', 'message',
      'scores needs audience, marketing, partnership_evidence, collaboration, decision_access and contact_quality');
  end if;
  if s_aud not between 0 and 25 or s_mkt not between 0 and 20 or s_evi not between 0 and 15
     or s_col not between 0 and 15 or s_dec not between 0 and 15 or s_con not between 0 and 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_scores', 'message',
      'score limits: audience 25, marketing 20, partnership_evidence 15, collaboration 15, decision_access 15, contact_quality 10');
  end if;
  v_total := s_aud + s_mkt + s_evi + s_col + s_dec + s_con;
  if v_total < p_min_score then
    return jsonb_build_object('ok', false, 'error', 'below_threshold', 'score', v_total,
      'message', format('Score %s is below the %s qualification threshold', v_total, p_min_score));
  end if;

  if jsonb_typeof(v_sources) <> 'array' or jsonb_array_length(v_sources) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_sources', 'message', 'intelligence.sources needs at least one source URL');
  end if;
  for src in select * from jsonb_array_elements(v_sources) loop
    if coalesce(case jsonb_typeof(src) when 'string' then src #>> '{}' else src->>'url' end, '') !~* '^https?://' then
      return jsonb_build_object('ok', false, 'error', 'invalid_sources', 'message', 'every source needs an http(s) url');
    end if;
  end loop;

  if sportconn.is_domain_suppressed(v_domain) then
    return jsonb_build_object('ok', false, 'error', 'suppressed', 'message', format('%s is on the suppression list', v_domain));
  end if;

  begin
    v_run := nullif(p->>'run_id', '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_run_id', 'message', 'run_id must be a uuid');
  end;
  if v_run is not null and not exists (select 1 from engine_runs where id = v_run) then
    return jsonb_build_object('ok', false, 'error', 'invalid_run_id', 'message', 'run_id not found');
  end if;

  -- -------- find an existing lead for this company --------
  select * into ex from leads where company_domain = v_domain limit 1;
  if ex.id is not null then
    v_match := 'domain';
  else
    select * into ex from leads
     where company_key = sportconn.normalize_company_name(v_name) and company_domain is null
     limit 1;
    if ex.id is not null then v_match := 'company_name'; end if;
  end if;

  -- primary contact: first marked is_primary, else the first listed
  select x.value into pc from jsonb_array_elements(contacts) as x(value) where x.value->>'is_primary' = 'true' limit 1;
  if pc is null then pc := contacts->0; end if;

  if ex.id is not null then
    update leads set
      score_audience = s_aud, score_marketing = s_mkt, score_partnership_evidence = s_evi,
      score_collaboration = s_col, score_decision_access = s_dec, score_contact_quality = s_con,
      company_domain     = coalesce(company_domain, v_domain),
      website            = coalesce(website, nullif(co->>'website', '')),
      industry           = coalesce(industry, nullif(co->>'industry', '')),
      location_city      = coalesce(location_city, nullif(co->>'location', '')),
      location_country   = coalesce(location_country, nullif(co->>'country', '')),
      last_researched_at = now(),
      engine_run_id      = coalesce(v_run, engine_run_id)
    where id = ex.id;
    v_lead := ex.id;
    v_action := 'updated';
  else
    select key into v_stage from pipeline_stages where pipeline_key = v_pipeline and key = 'researched';
    if v_stage is null then
      select key into v_stage from pipeline_stages where pipeline_key = v_pipeline order by sort_order limit 1;
    end if;

    v_primary_email := nullif(lower(trim(coalesce(pc->>'email', ''))), '');
    if v_primary_email is not null and sportconn.is_suppressed(v_primary_email) then
      skipped := skipped || jsonb_build_array(jsonb_build_object('email', v_primary_email, 'reason', 'suppressed'));
      v_primary_email := null;
    end if;

    insert into leads (
      full_name, title, email, phone, linkedin_url, website, company_name, company_domain,
      industry, location_city, location_country, lead_type, pipeline, stage, source,
      score_audience, score_marketing, score_partnership_evidence, score_collaboration,
      score_decision_access, score_contact_quality, last_researched_at, engine_run_id,
      notes, created_by)
    values (
      coalesce(nullif(trim(pc->>'full_name'), ''), v_name),
      nullif(trim(coalesce(pc->>'job_title', pc->>'title', '')), ''),
      v_primary_email,
      nullif(trim(coalesce(pc->>'phone', '')), ''),
      nullif(trim(coalesce(pc->>'linkedin', pc->>'linkedin_url', '')), ''),
      nullif(co->>'website', ''), v_name, v_domain,
      nullif(co->>'industry', ''), nullif(co->>'location', ''), nullif(co->>'country', ''),
      case when v_pipeline = 'sponsor' then 'sponsor' else 'strategic_partner' end,
      v_pipeline, v_stage, 'ai_engine',
      s_aud, s_mkt, s_evi, s_col, s_dec, s_con, now(), v_run,
      nullif(p->>'notes', ''), p_actor)
    returning id into v_lead;
    v_action := 'created';
  end if;

  -- -------- contacts (the primary one is already on a newly created lead) --------
  for c in select * from jsonb_array_elements(contacts) loop
    if v_action = 'created' and c = pc then continue; end if;
    c_email := nullif(lower(trim(coalesce(c->>'email', ''))), '');
    if nullif(trim(coalesce(c->>'full_name', '')), '') is null then
      skipped := skipped || jsonb_build_array(jsonb_build_object('email', c_email, 'reason', 'missing_name'));
      continue;
    end if;
    if c_email is not null and sportconn.is_suppressed(c_email) then
      skipped := skipped || jsonb_build_array(jsonb_build_object('email', c_email, 'reason', 'suppressed'));
      continue;
    end if;
    if c_email is not null and (
         exists (select 1 from leads where id = v_lead and lower(coalesce(email, '')) like '%' || c_email || '%')
         or exists (select 1 from lead_contacts where lead_id = v_lead and lower(email) = c_email)) then
      skipped := skipped || jsonb_build_array(jsonb_build_object('email', c_email, 'reason', 'already_saved'));
      continue;
    end if;
    if c_email is null and exists (select 1 from lead_contacts where lead_id = v_lead
                                     and lower(full_name) = lower(trim(c->>'full_name'))) then
      skipped := skipped || jsonb_build_array(jsonb_build_object('name', c->>'full_name', 'reason', 'already_saved'));
      continue;
    end if;
    insert into lead_contacts (lead_id, full_name, title, email, phone, linkedin_url, relevance, created_by)
    values (v_lead, trim(c->>'full_name'),
            nullif(trim(coalesce(c->>'job_title', c->>'title', '')), ''),
            c_email,
            nullif(trim(coalesce(c->>'phone', '')), ''),
            nullif(trim(coalesce(c->>'linkedin', c->>'linkedin_url', '')), ''),
            nullif(trim(coalesce(c->>'relevance', '')), ''),
            p_actor);
    added := added + 1;
  end loop;

  -- -------- research profile --------
  insert into lead_research (
    lead_id, research_date, company_overview, target_audience, marketing_activities,
    sponsorship_history, business_objective, partnership_gap, sportconn_opportunity,
    potential_value, verified_facts, assumptions, sources, qualification_score,
    score_breakdown, origin, engine_run_id, created_by)
  values (
    v_lead,
    coalesce(nullif(intel->>'research_date', '')::date, (now() at time zone 'Africa/Lagos')::date),
    nullif(intel->>'company_overview', ''), nullif(intel->>'target_audience', ''),
    case when jsonb_typeof(intel->'marketing_activities') = 'array' then intel->'marketing_activities' else '[]'::jsonb end,
    case when jsonb_typeof(intel->'sponsorship_history')  = 'array' then intel->'sponsorship_history'  else '[]'::jsonb end,
    nullif(intel->>'business_objective', ''), nullif(intel->>'partnership_gap', ''),
    nullif(intel->>'sportconn_opportunity', ''), nullif(intel->>'potential_value', ''),
    case when jsonb_typeof(intel->'verified_facts') = 'array' then intel->'verified_facts' else '[]'::jsonb end,
    case when jsonb_typeof(intel->'assumptions')    = 'array' then intel->'assumptions'    else '[]'::jsonb end,
    v_sources, v_total,
    jsonb_build_object('audience', s_aud, 'marketing', s_mkt, 'partnership_evidence', s_evi,
                       'collaboration', s_col, 'decision_access', s_dec, 'contact_quality', s_con),
    'ai_engine', v_run, p_actor)
  returning id into v_research;

  insert into activities (lead_id, type, description, created_by)
  values (v_lead, 'system', format('AI research %s — score %s/100, %s source(s)',
          case when v_action = 'created' then 'added' else 'updated' end, v_total, jsonb_array_length(v_sources)), p_actor);

  insert into audit_log (actor_id, action, detail)
  values (p_actor, 'engine.lead.' || v_action,
          jsonb_build_object('lead_id', v_lead, 'domain', v_domain, 'score', v_total, 'match_on', v_match,
                             'contacts_added', added, 'run_id', v_run));

  return jsonb_build_object(
    'ok', true, 'action', v_action, 'lead_id', v_lead, 'research_id', v_research,
    'score', v_total, 'priority', v_total >= 80, 'match_on', v_match,
    'contacts_added', added, 'contacts_skipped', skipped);
end; $$;

-- Engine functions: service role only (the engine-api Edge Function).
revoke all on function sportconn.engine_upsert_lead(jsonb, uuid, integer) from public, anon, authenticated;
revoke all on function sportconn.engine_check_leads(jsonb) from public, anon, authenticated;
grant execute on function sportconn.engine_upsert_lead(jsonb, uuid, integer) to service_role;
grant execute on function sportconn.engine_check_leads(jsonb) to service_role;
grant execute on function sportconn.is_suppressed(text), sportconn.is_domain_suppressed(text),
  sportconn.normalize_domain(text), sportconn.normalize_company_name(text), sportconn.is_free_email_domain(text)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table sportconn.suppressions  enable row level security;
alter table sportconn.engine_runs   enable row level security;
alter table sportconn.lead_research enable row level security;

-- suppressions: anyone who can write adds; only approvers remove
drop policy if exists suppressions_select on sportconn.suppressions;
create policy suppressions_select on sportconn.suppressions for select to authenticated using (true);
drop policy if exists suppressions_insert on sportconn.suppressions;
create policy suppressions_insert on sportconn.suppressions for insert to authenticated with check (sportconn.can_write());
drop policy if exists suppressions_delete on sportconn.suppressions;
create policy suppressions_delete on sportconn.suppressions for delete to authenticated using (sportconn.can_approve());

-- engine runs: read-only for staff (the engine writes with the service role)
drop policy if exists engine_runs_select on sportconn.engine_runs;
create policy engine_runs_select on sportconn.engine_runs for select to authenticated using (true);

-- research: read for all; staff may add manual research; history is not edited
drop policy if exists lead_research_select on sportconn.lead_research;
create policy lead_research_select on sportconn.lead_research for select to authenticated using (true);
drop policy if exists lead_research_insert on sportconn.lead_research;
create policy lead_research_insert on sportconn.lead_research for insert to authenticated
  with check (sportconn.can_write() and origin = 'manual');
drop policy if exists lead_research_delete on sportconn.lead_research;
create policy lead_research_delete on sportconn.lead_research for delete to authenticated using (sportconn.can_delete());

grant select, insert, delete on sportconn.suppressions, sportconn.lead_research to authenticated;
grant select on sportconn.engine_runs to authenticated;
grant all on sportconn.suppressions, sportconn.engine_runs, sportconn.lead_research to service_role;
