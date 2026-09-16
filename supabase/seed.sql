-- ============================================================================
-- Roseway CRM — demo seed data
--
-- Optional. Run AFTER 0001_init.sql. Safe to re-run (fixed UUIDs + ON CONFLICT).
-- Populates one organization: 5 properties, 20 residents, ~24 cases across every
-- stage/priority, plus a spread of follow-up dates (overdue / today / upcoming)
-- and some manual activity. Assigns everything to the first staff user if one
-- exists (create a user first — see README step 3).
-- ============================================================================

-- ---- PROPERTIES -----------------------------------------------------------
insert into roseway.properties
  (id, name, address_line1, city, state, postal_code, unit_count, property_type, manager_name, manager_email, manager_phone) values
  ('a0000000-0000-0000-0000-000000000001','The Park at Legacy','5800 Legacy Dr','Plano','TX','75024',420,'conventional','Sarah Johnson','s.johnson@parkatlegacy.com','(972) 555-0184'),
  ('a0000000-0000-0000-0000-000000000002','Cortland Grand Reserve','1400 Grand Ave','Dallas','TX','75201',380,'luxury','Marcus Rivera','m.rivera@cortlandgr.com','(214) 555-0110'),
  ('a0000000-0000-0000-0000-000000000003','Camden Ridge Heights','900 Ridge Pkwy','Fort Worth','TX','76102',510,'conventional','Amanda Chen','a.chen@camdenridge.com','(817) 555-0163'),
  ('a0000000-0000-0000-0000-000000000004','Timberline Senior Living','220 Timberline Way','Richardson','TX','75080',185,'senior','Brett Wallace','b.wallace@timberlinesl.com','(469) 555-0147'),
  ('a0000000-0000-0000-0000-000000000005','Broadstone Lakeside','75 Lakeside Blvd','Irving','TX','75039',460,'mixed_use','Jessica Morales','j.morales@broadstonelk.com','(972) 555-0199')
on conflict (id) do nothing;

-- ---- RESIDENTS ----------------------------------------------------------
insert into roseway.residents
  (id, full_name, email, phone, property_id, unit_number, status, experience_score, move_in_date) values
  ('b0000000-0000-0000-0000-000000000001','Sarah Johnson','sarah.j@example.com','(972) 555-2001','a0000000-0000-0000-0000-000000000001','412','active',68,'2023-05-01'),
  ('b0000000-0000-0000-0000-000000000002','Marcus Rivera','marcus.r@example.com','(214) 555-2002','a0000000-0000-0000-0000-000000000002','1808','at_risk',52,'2022-11-15'),
  ('b0000000-0000-0000-0000-000000000003','Amanda Chen','amanda.c@example.com','(817) 555-2003','a0000000-0000-0000-0000-000000000003','305','active',78,'2024-01-20'),
  ('b0000000-0000-0000-0000-000000000004','Derek Thompson','derek.t@example.com','(469) 555-2004','a0000000-0000-0000-0000-000000000002','740','at_risk',44,'2021-08-09'),
  ('b0000000-0000-0000-0000-000000000005','Linda Martinez','linda.m@example.com','(214) 555-2005','a0000000-0000-0000-0000-000000000003','118','active',86,'2023-03-30'),
  ('b0000000-0000-0000-0000-000000000006','Brett Wallace','brett.w@example.com','(469) 555-2006','a0000000-0000-0000-0000-000000000004','52','pending',61,'2024-09-01'),
  ('b0000000-0000-0000-0000-000000000007','Jessica Morales','jessica.m@example.com','(972) 555-2007','a0000000-0000-0000-0000-000000000005','226','active',71,'2022-06-18'),
  ('b0000000-0000-0000-0000-000000000008','Paul Nguyen','paul.n@example.com','(972) 555-2008','a0000000-0000-0000-0000-000000000001','909','active',74,'2023-12-05'),
  ('b0000000-0000-0000-0000-000000000009','Grace Kim','grace.k@example.com','(214) 555-2009','a0000000-0000-0000-0000-000000000002','333','active',80,'2024-02-11'),
  ('b0000000-0000-0000-0000-000000000010','Tomas Alvarez','tomas.a@example.com','(817) 555-2010','a0000000-0000-0000-0000-000000000003','601','former',49,'2020-04-22'),
  ('b0000000-0000-0000-0000-000000000011','Priya Patel','priya.p@example.com','(469) 555-2011','a0000000-0000-0000-0000-000000000004','14','active',83,'2023-07-14'),
  ('b0000000-0000-0000-0000-000000000012','Kevin O''Brien','kevin.o@example.com','(972) 555-2012','a0000000-0000-0000-0000-000000000005','410','pending',58,'2024-08-25'),
  ('b0000000-0000-0000-0000-000000000013','Renee Dubois','renee.d@example.com','(214) 555-2013','a0000000-0000-0000-0000-000000000001','207','active',66,'2022-10-02'),
  ('b0000000-0000-0000-0000-000000000014','Malik Freeman','malik.f@example.com','(817) 555-2014','a0000000-0000-0000-0000-000000000003','822','at_risk',41,'2021-01-19'),
  ('b0000000-0000-0000-0000-000000000015','Hannah Schwartz','hannah.s@example.com','(469) 555-2015','a0000000-0000-0000-0000-000000000002','555','active',77,'2023-09-08'),
  ('b0000000-0000-0000-0000-000000000016','Diego Santos','diego.s@example.com','(972) 555-2016','a0000000-0000-0000-0000-000000000005','131','active',72,'2024-03-17'),
  ('b0000000-0000-0000-0000-000000000017','Carol Whitfield','carol.w@example.com','(469) 555-2017','a0000000-0000-0000-0000-000000000004','8','active',88,'2022-05-11'),
  ('b0000000-0000-0000-0000-000000000018','Aaron Blake','aaron.b@example.com','(972) 555-2018','a0000000-0000-0000-0000-000000000001','1140','pending',55,'2024-09-05'),
  ('b0000000-0000-0000-0000-000000000019','Sofia Romano','sofia.r@example.com','(214) 555-2019','a0000000-0000-0000-0000-000000000002','290','active',79,'2023-11-29'),
  ('b0000000-0000-0000-0000-000000000020','Nathan Cole','nathan.c@example.com','(817) 555-2020','a0000000-0000-0000-0000-000000000003','447','active',63,'2022-02-28')
on conflict (id) do nothing;

-- ---- CASES ------------------------------------------------------------
-- next_follow_up_at expressed relative to now() so buckets stay meaningful.
insert into roseway.cases
  (id, title, resident_id, category, description, stage, priority, next_follow_up_at, opened_at) values
  ('c0000000-0000-0000-0000-000000000001','Kitchen sink leak under cabinet','b0000000-0000-0000-0000-000000000001','maintenance','Resident reports slow leak, cabinet base swelling.','in_progress','high', now() - interval '2 days', now() - interval '9 days'),
  ('c0000000-0000-0000-0000-000000000002','Disputed late fee on October ledger','b0000000-0000-0000-0000-000000000002','billing','Auto-pay failed silently; resident asking for fee reversal.','awaiting_resident','medium', now() - interval '1 day', now() - interval '6 days'),
  ('c0000000-0000-0000-0000-000000000003','Lease renewal decision needed','b0000000-0000-0000-0000-000000000004','lease','Renewal offer expires end of month; resident undecided.','intake','urgent', now() + interval '2 hours', now() - interval '3 days'),
  ('c0000000-0000-0000-0000-000000000004','Noise complaint about upstairs unit','b0000000-0000-0000-0000-000000000005','complaint','Recurring late-night noise, third report.','in_progress','medium', now() + interval '2 days', now() - interval '5 days'),
  ('c0000000-0000-0000-0000-000000000005','HVAC not cooling below 78F','b0000000-0000-0000-0000-000000000008','maintenance','Vendor scheduled, part on order.','awaiting_resident','high', now() - interval '4 days', now() - interval '12 days'),
  ('c0000000-0000-0000-0000-000000000006','Requesting community garden plot','b0000000-0000-0000-0000-000000000007','community','Wants to organize a resident gardening group.','intake','low', now() + interval '6 days', now() - interval '2 days'),
  ('c0000000-0000-0000-0000-000000000007','Wellness check follow-up','b0000000-0000-0000-0000-000000000011','wellness','Post-surgery, requested periodic check-ins.','in_progress','medium', now(), now() - interval '8 days'),
  ('c0000000-0000-0000-0000-000000000008','Parking spot reassignment','b0000000-0000-0000-0000-000000000013','other','ADA spot request, doctor note provided.','resolved','medium', null, now() - interval '20 days'),
  ('c0000000-0000-0000-0000-000000000009','Water heater replacement','b0000000-0000-0000-0000-000000000014','maintenance','Old unit failed; emergency replacement completed.','closed','high', null, now() - interval '35 days'),
  ('c0000000-0000-0000-0000-000000000010','Move-in punch list items','b0000000-0000-0000-0000-000000000006','maintenance','Blinds, paint touch-up, closet door alignment.','in_progress','low', now() + interval '3 days', now() - interval '4 days'),
  ('c0000000-0000-0000-0000-000000000011','Rent payment plan request','b0000000-0000-0000-0000-000000000012','billing','Temporary hardship, wants 2-month plan.','intake','high', now() - interval '1 day', now() - interval '2 days'),
  ('c0000000-0000-0000-0000-000000000012','Pest control - ants in kitchen','b0000000-0000-0000-0000-000000000016','maintenance','Second treatment needed.','awaiting_resident','medium', now() + interval '1 day', now() - interval '7 days'),
  ('c0000000-0000-0000-0000-000000000013','Transfer to ground-floor unit','b0000000-0000-0000-0000-000000000017','lease','Mobility concerns; wants unit swap at renewal.','in_progress','medium', now() + interval '5 days', now() - interval '10 days'),
  ('c0000000-0000-0000-0000-000000000014','Package theft report','b0000000-0000-0000-0000-000000000019','complaint','Requests camera footage from lobby.','resolved','low', null, now() - interval '15 days'),
  ('c0000000-0000-0000-0000-000000000015','Gym equipment repair request','b0000000-0000-0000-0000-000000000003','community','Two treadmills out of service.','intake','low', now() + interval '4 days', now() - interval '1 day'),
  ('c0000000-0000-0000-0000-000000000016','Balcony railing feels loose','b0000000-0000-0000-0000-000000000009','maintenance','Safety issue, prioritized.','in_progress','urgent', now() - interval '3 hours', now() - interval '2 days'),
  ('c0000000-0000-0000-0000-000000000017','Emotional support animal paperwork','b0000000-0000-0000-0000-000000000015','lease','Needs updated documentation on file.','awaiting_resident','low', now() + interval '8 days', now() - interval '6 days'),
  ('c0000000-0000-0000-0000-000000000018','Recurring elevator outages','b0000000-0000-0000-0000-000000000002','complaint','Elevator B down 3x this month.','in_progress','high', now() + interval '1 day', now() - interval '11 days'),
  ('c0000000-0000-0000-0000-000000000019','Welcome orientation scheduling','b0000000-0000-0000-0000-000000000018','community','New resident onboarding session.','intake','medium', now() + interval '2 days', now() - interval '1 day'),
  ('c0000000-0000-0000-0000-000000000020','Dishwasher not draining','b0000000-0000-0000-0000-000000000020','maintenance','Standing water after cycle.','intake','medium', now() - interval '2 days', now() - interval '3 days'),
  ('c0000000-0000-0000-0000-000000000021','Renewal incentive question','b0000000-0000-0000-0000-000000000005','lease','Asking whether loyalty credit applies.','resolved','low', null, now() - interval '18 days'),
  ('c0000000-0000-0000-0000-000000000022','Community BBQ volunteer coordination','b0000000-0000-0000-0000-000000000007','community','Planning fall resident event.','in_progress','low', now() + interval '7 days', now() - interval '9 days'),
  ('c0000000-0000-0000-0000-000000000023','Thermostat replaced - verify','b0000000-0000-0000-0000-000000000008','maintenance','Confirm resident satisfied post-fix.','closed','medium', null, now() - interval '28 days'),
  ('c0000000-0000-0000-0000-000000000024','Roof drainage onto walkway','b0000000-0000-0000-0000-000000000001','maintenance','Property-wide issue near building 3 entrance.','intake','high', now() + interval '1 day', now() - interval '2 days')
on conflict (id) do nothing;

-- ---- ASSIGN TO FIRST STAFF USER + realistic resolution dates ----------
do $$
declare v_user uuid := (select id from roseway.users order by created_at limit 1);
begin
  if v_user is not null then
    update roseway.cases     set assigned_to = v_user            where assigned_to is null;
    update roseway.cases     set created_by  = v_user            where created_by  is null;
    update roseway.residents set assigned_case_manager = v_user  where assigned_case_manager is null;
  end if;

  -- backdate resolution so avg-resolution-time has signal
  update roseway.cases
    set resolved_at = opened_at + (interval '1 day' * (2 + floor(random() * 6)))
  where stage in ('resolved','closed') and resolved_at is not null;
end $$;

-- ---- A FEW MANUAL ACTIVITIES ----------------------------------------
insert into roseway.activities (id, resident_id, case_id, type, description)
select
  ('d0000000-0000-0000-0000-00000000000' || g)::uuid,
  'b0000000-0000-0000-0000-000000000001'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  (array['call','visit','note'])[1 + (g % 3)],
  (array[
    'Called resident to confirm vendor window (8–11am Thursday).',
    'On-site visit: confirmed leak at supply line, shut-off valve tagged.',
    'Note: resident prefers text over phone for scheduling.'
  ])[1 + (g % 3)]
from generate_series(1, 3) as g
on conflict (id) do nothing;

-- ============================================================================
-- DEALFLOW SEED (requires 0002_dealflow.sql)
-- ============================================================================

-- ---- CAMPAIGNS ----------------------------------------------------------
insert into roseway.campaigns (id, name, channel, status, goal, target_segment, start_date, sent_count, reply_count, meeting_count) values
  ('e1000000-0000-0000-0000-000000000001','Q4 DFW Community Engagement Push','email','active','Book 15 discovery calls with DFW Class-A operators','DFW · Class A · 300+ units','2024-10-01',180,22,9),
  ('e1000000-0000-0000-0000-000000000002','LinkedIn — Regional VP Outreach','linkedin','active','Warm 40 regional VPs','Regional VP Operations','2024-09-15',64,11,4),
  ('e1000000-0000-0000-0000-000000000003','Resident Experience Checklist Funnel','email','active','Convert checklist submissions to consults','Checklist submitters','2024-08-01',312,48,17),
  ('e1000000-0000-0000-0000-000000000004','Senior Living Wellness Partnerships','event','draft','Pilot wellness programming at 5 senior communities','Senior Living operators',null,0,0,0)
on conflict (id) do nothing;

-- ---- LEADS (mirror the reference personas) ----------------------------
insert into roseway.leads
  (id, full_name, title, email, phone, company_name, property_name, location_city, location_state,
   unit_count, asset_type, temperature, experience_score, stage, source, estimated_arr, next_follow_up_at, notes) values
  ('f0000000-0000-0000-0000-000000000001','Sarah Johnson','Community Manager','s.johnson@greystar-legacy.com','(972) 555-0184','Greystar Real Estate','The Park at Legacy','Plano','TX',420,'conventional','hot',68,'qualified','res_exp_check',18000, now() + interval '1 day','Downloaded checklist. Very receptive to outsourcing event execution. Wants to loop in Regional VP Greg Miller.'),

  ('f0000000-0000-0000-0000-000000000002','Marcus Rivera','General Manager','m.rivera@cortlandgr.com','(214) 555-0110','Cortland Communities','Cortland Grand Reserve','Dallas','TX',380,'luxury','hot',52,'discovery','cold_email',24000, now() - interval '1 day','At-risk on renewals. Eviction risk high. Rescue package proposal under review.'),

  ('f0000000-0000-0000-0000-000000000003','Amanda Chen','Regional Property Manager','a.chen@camdenridge.com','(817) 555-0163','Camden Property Trust','Camden Ridge Heights','Fort Worth','TX',510,'conventional','warm',78,'discovery','linkedin',16000, now() + interval '2 days','Strong foundation. Exploring integrated program bundle.'),

  ('f0000000-0000-0000-0000-000000000004','Derek Thompson','VP of Operations','d.thompson@hanoverco.com','(469) 555-0140','Hanover Company','Hanover Park District','Frisco','TX',340,'conventional','hot',44,'proposal','res_exp_check',24000, now(),'Greensboro regional office. $24k ARR proposal under review.'),

  ('f0000000-0000-0000-0000-000000000005','Linda Martinez','Resident Experience Director','l.martinez@lincolnproperty.com','(214) 555-0155','Lincoln Property Company','Apex on Preston','Dallas','TX',290,'conventional','warm',86,'contacted','referral',14000, now() + interval '4 days','Community experience leader. Referral partner, 3 active sites.'),

  ('f0000000-0000-0000-0000-000000000006','Brett Wallace','Community Director','b.wallace@timberlinesl.com','(469) 555-0147','Independent Asset','Timberline Senior Living','Richardson','TX',185,'senior','cold',61,'new_lead','website',9000, now() + interval '6 days','Website inbound. Senior living — wellness partnership angle.'),

  ('f0000000-0000-0000-0000-000000000007','Jessica Morales','Leasing & Engagement Lead','j.morales@alliance-res.com','(972) 555-0199','Alliance Residential','Broadstone Lakeside','Irving','TX',460,'mixed_use','warm',71,'qualified','res_exp_check',15500, now() + interval '2 days','Event package scheduled. Growth opportunity.'),

  ('f0000000-0000-0000-0000-000000000008','Brian Miller','Regional VP Operations','b.miller@alliance-res.com','(480) 555-0122','Alliance Residential','The Halston Uptown','Dallas','TX',310,'conventional','warm',61,'new_lead','cold_email',14000, now() + interval '1 day','$14k ARR proposal pending. Enrich data.'),

  ('f0000000-0000-0000-0000-000000000009','Carla Gomez','Portfolio Lead','c.gomez@millcreek.com','(214) 555-0177','Mill Creek Residential','Broadstone West End','Dallas','TX',520,'conventional','cold',59,'new_lead','import',18500,null,'Imported via Entrata.'),

  ('f0000000-0000-0000-0000-000000000010','Tasha Morales','Property Director','t.morales@bozzuto.com','(202) 555-0131','Bozzuto Group','Woodfield Promenade','Plano','TX',360,'conventional','warm',71,'contacted','linkedin',15500, now() + interval '3 days','Follow-up #2 sent yesterday.'),

  ('f0000000-0000-0000-0000-000000000011','Elena Rostova','General Manager','e.rostova@cortland.com','(404) 555-0190','Cortland Communities','Villas at Stonebridge','Frisco','TX',340,'luxury','hot',42,'discovery','cold_email',24000, now() - interval '2 days','At risk · eviction risk high. Urgent follow-up.'),

  ('f0000000-0000-0000-0000-000000000012','David Sterling','Regional Asset Manager','d.sterling@lincolnproperty.com','(214) 555-0166','Lincoln Property Company','Lincoln Court Uptown','Dallas','TX',340,'conventional','warm',76,'proposal','referral',32000, now() + interval '2 days','$32k pipeline. Discovery complete.'),

  ('f0000000-0000-0000-0000-000000000013','Greg Miller','Regional VP Operations','g.miller@greystar.com','(843) 555-0100','Greystar Real Estate','Greystar DFW Portfolio','Charleston','SC',5420,'conventional','hot',64,'pilot','referral',96000, now() + interval '1 day','Master service agreement pending. 14-asset portfolio. Exec discovery call scheduled.'),

  ('f0000000-0000-0000-0000-000000000014','Nina Patel','Director of Operations','n.patel@windsorcommunities.com','(617) 555-0144','Windsor Communities','Windsor at Legacy','Plano','TX',400,'conventional','cold',55,'closed_lost','cold_email',0,null,'Went with in-house team. Revisit Q2.'),

  ('f0000000-0000-0000-0000-000000000015','Robert Hayes','VP Resident Services','r.hayes@maac.com','(901) 555-0188','MAA','MAA Frisco Bridges','Frisco','TX',480,'conventional','warm',73,'closed_won','res_exp_check',22000,null,'Signed 12-month agreement. Onboarding kickoff scheduled.')
on conflict (id) do nothing;

-- link the leads that map to seeded properties
update roseway.leads set property_id = 'a0000000-0000-0000-0000-000000000001' where id = 'f0000000-0000-0000-0000-000000000001';
update roseway.leads set property_id = 'a0000000-0000-0000-0000-000000000002' where id in ('f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000011');
update roseway.leads set property_id = 'a0000000-0000-0000-0000-000000000003' where id in ('f0000000-0000-0000-0000-000000000003','f0000000-0000-0000-0000-000000000005');
update roseway.leads set property_id = 'a0000000-0000-0000-0000-000000000004' where id = 'f0000000-0000-0000-0000-000000000006';
update roseway.leads set property_id = 'a0000000-0000-0000-0000-000000000005' where id in ('f0000000-0000-0000-0000-000000000007','f0000000-0000-0000-0000-000000000008');

-- ---- EXPERIENCE ASSESSMENTS ------------------------------------------
insert into roseway.experience_assessments
  (id, lead_id, property_id, overall_score, synthesis,
   pillar_engagement, pillar_programming, pillar_belonging, pillar_wellness, pillar_resources, pillar_strategy,
   responses, recommended_scope, submitted_at) values
  ('a1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',68,
   'This property has an established foundation for resident engagement, but faces notable challenges in event attendance consistency, resident retention programming, and community connectivity.',
   62,55,71,74,48,60,
   '[{"q":"How would you describe current resident engagement?","a":"Inconsistent — some pool parties work well, but weekday workshops struggle with attendance."},{"q":"How often does your on-site team host intentional community experiences?","a":"About once a month, mainly handled by busy leasing staff."},{"q":"What is your biggest resident retention barrier?","a":"Lack of time and staff bandwidth to plan quality programming."},{"q":"Do you have dedicated budget for resident events?","a":"Yes, approx $1,200/month currently allocated."}]'::jsonb,
   array['Resident Events','Wellness Programming','Community Activation','Move-in Welcome Program'],
   now() - interval '2 days'),
  ('a1000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002',52,
   'High renewal risk driven by weak community programming and low resource communication. Immediate intervention recommended.',
   48,41,55,58,44,52,
   '[{"q":"What is driving renewal hesitation?","a":"Residents cite lack of community feel and slow maintenance comms."},{"q":"Current programming cadence?","a":"Sporadic, no owner on-site."}]'::jsonb,
   array['Retention Rescue','Community Activation','Resident Comms Overhaul'],
   now() - interval '1 day'),
  ('a1000000-0000-0000-0000-000000000004','f0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000004',44,
   'At-risk portfolio asset. Programming and belonging scores are critically low; proposal in review.',
   40,38,42,49,45,50,
   '[{"q":"Biggest gap?","a":"No structured resident events; turnover above portfolio average."}]'::jsonb,
   array['Full Program Buildout','Wellness Partnerships'],
   now() - interval '5 days'),
  ('a1000000-0000-0000-0000-000000000013','f0000000-0000-0000-0000-000000000013','a0000000-0000-0000-0000-000000000001',64,
   'Portfolio-level diagnostic across 14 assets. Growth opportunity with strong executive sponsorship.',
   66,60,70,72,58,68,
   '[{"q":"Portfolio-wide consistency?","a":"Varies widely by site; want a standardized playbook."}]'::jsonb,
   array['Portfolio Playbook','Integrated Program Bundle'],
   now() - interval '3 days')
on conflict (id) do nothing;

-- ---- OUTREACH ------------------------------------------------------
insert into roseway.outreach (lead_id, campaign_id, channel, direction, subject, outcome, occurred_at) values
  ('f0000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','email','outbound','Your Park at Legacy experience score (68/100)','replied', now() - interval '3 days'),
  ('f0000000-0000-0000-0000-000000000001',null,'linkedin','outbound','Intro + case study on Greystar renewal lift','opened', now() - interval '2 days'),
  ('f0000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001','email','outbound','Cortland Grand Reserve — retention rescue options','replied', now() - interval '4 days'),
  ('f0000000-0000-0000-0000-000000000002',null,'meeting','outbound','Discovery call','completed', now() - interval '2 days'),
  ('f0000000-0000-0000-0000-000000000004',null,'email','outbound','Proposal: Hanover Park District program buildout','no_response', now() - interval '1 day'),
  ('f0000000-0000-0000-0000-000000000010','e1000000-0000-0000-0000-000000000002','linkedin','outbound','Follow-up #2 — Woodfield Promenade','sent', now() - interval '1 day'),
  ('f0000000-0000-0000-0000-000000000013',null,'meeting','outbound','Executive discovery briefing','scheduled', now() + interval '1 day'),
  ('f0000000-0000-0000-0000-000000000011','e1000000-0000-0000-0000-000000000001','email','outbound','Urgent: Villas at Stonebridge eviction-risk review','replied', now() - interval '2 days')
on conflict do nothing;

-- ---- TASKS -------------------------------------------------------
insert into roseway.tasks (title, description, status, priority, due_at, lead_id) values
  ('Follow up with Sarah Johnson','Send Resident Experience Review invitation & tailored case study','open','urgent', now(), 'f0000000-0000-0000-0000-000000000001'),
  ('Send proposal draft to Derek Thompson','Hanover Park District — program buildout, $24k ARR','open','high', now() + interval '1 day', 'f0000000-0000-0000-0000-000000000004'),
  ('Contact Regional VP at Greystar','Regarding DFW portfolio 8-asset assessment pack','open','high', now() + interval '1 day', 'f0000000-0000-0000-0000-000000000013'),
  ('Prep rescue package for Cortland Grand Reserve','Eviction-risk mitigation + comms overhaul','open','urgent', now() - interval '1 day', 'f0000000-0000-0000-0000-000000000002'),
  ('Schedule wellness partnership call — Timberline','Senior living pilot','open','medium', now() + interval '3 days', 'f0000000-0000-0000-0000-000000000006'),
  ('Log discovery notes for Amanda Chen','Camden Ridge Heights','done','medium', now() - interval '2 days', 'f0000000-0000-0000-0000-000000000003')
on conflict do nothing;

-- ---- ASSIGN dealflow rows to first staff user ----------------------
do $$
declare v_user uuid := (select id from roseway.users order by created_at limit 1);
begin
  if v_user is not null then
    update roseway.leads    set assigned_to = v_user where assigned_to is null;
    update roseway.leads    set created_by  = v_user where created_by  is null;
    update roseway.tasks    set assigned_to = v_user where assigned_to is null;
    update roseway.tasks    set created_by  = v_user where created_by  is null;
    update roseway.campaigns set created_by = v_user where created_by  is null;
    update roseway.outreach set created_by  = v_user where created_by  is null;
    update roseway.experience_assessments set created_by = v_user where created_by is null;
  end if;
end $$;
