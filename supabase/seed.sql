-- ============================================================================
-- SportConn CRM — demo seed data
--
-- Optional. Run AFTER 0001/0002/0003. Safe to re-run (fixed UUIDs + ON CONFLICT).
-- All names/organizations are FICTIONAL, for demonstration only (§40) — do not
-- treat any figure here as a real commitment, user count, or business fact.
--
-- Populates: 5 facilities, 6 captains, 4 campaigns, ~16 leads across the
-- sponsor / investor / strategic_partnership / user_acquisition pipelines
-- (mix of hot/warm/cold/at_risk, won/lost/open), outreach, and tasks with a
-- spread of follow-up dates (overdue / today / upcoming). Everything is
-- assigned to the first staff user if one exists — create a user first
-- (see README → Setup).
-- ============================================================================

-- ---- FACILITIES ------------------------------------------------------------
insert into sportconn.facilities
  (id, name, contact_name, contact_email, contact_phone, address_line1, city, area, country,
   facility_type, pitch_count, operating_hours, booking_model, partnership_type, stage, expected_value, currency, next_follow_up_at) values
  ('a1000000-0000-0000-0000-000000000001','Urban Turf Arena','Ade Balogun','ade@urbanturfarena.com','+234 803 555 0101','12 Admiralty Way','Lagos','Lekki','Nigeria',
   'five_a_side',4,'7am - 11pm','Walk-in + phone booking','Booking integration','proposal',500000,'NGN', now() + interval '2 days'),
  ('a1000000-0000-0000-0000-000000000002','Metro Football Centre','Chioma Eze','chioma@metrofc.ng','+234 803 555 0102','5 Herbert Macaulay Way','Lagos','Yaba','Nigeria',
   'football_turf',2,'6am - 10pm','App-based','Revenue share','negotiation',750000,'NGN', now() - interval '1 day'),
  ('a1000000-0000-0000-0000-000000000003','GoodWind Astroturf','Tunde Bakare','tunde@goodwind.ng','+234 803 555 0103','8 Admiralty Rd','Lagos','Lekki','Nigeria',
   'astroturf',3,'8am - 12am','Walk-in','Sponsorship host','active',1200000,'NGN', now() + interval '10 days'),
  ('a1000000-0000-0000-0000-000000000004','Capital Sports Complex','Ngozi Obi','ngozi@capitalsports.ng','+234 803 555 0104','21 Ademola Adetokunbo St','Abuja','Wuse','Nigeria',
   'sports_complex',6,'6am - 11pm','App-based','Booking integration','contacted',900000,'NGN', now() + interval '5 days'),
  ('a1000000-0000-0000-0000-000000000005','Riverside Recreation Centre','Femi Adisa','femi@riversiderec.ng','+234 803 555 0105','3 Ozumba Mbadiwe Ave','Lagos','Victoria Island','Nigeria',
   'recreation_centre',5,'7am - 9pm','Phone booking','Revenue share','prospect',400000,'NGN', null)
on conflict (id) do nothing;

-- mark one facility Won and one Lost (with reason) so the pipeline shows outcomes
update sportconn.facilities set stage = 'active', status = 'won' where id = 'a1000000-0000-0000-0000-000000000003';
update sportconn.facilities set stage = 'lost', status = 'lost', lost_reason = 'terms_not_agreed'
  where id = 'a1000000-0000-0000-0000-000000000005';

-- ---- CAPTAINS & COMMUNITIES -------------------------------------------------
insert into sportconn.captains
  (id, full_name, email, phone, location_city, area, community, player_count, games_coordinated, active, date_joined, next_game_at, stage) values
  ('b1000000-0000-0000-0000-000000000001','Chuka Obi','chuka.obi@example.com','+234 803 555 0201','Lagos','Lekki','Lekki Pick-Up Game',28,14,true,'2025-02-10', current_date + 3,'active'),
  ('b1000000-0000-0000-0000-000000000002','Ifeanyi Nwosu','ifeanyi.n@example.com','+234 803 555 0202','Lagos','Surulere','Surulere Ballers',22,9,true,'2025-04-22', current_date + 6,'active'),
  ('b1000000-0000-0000-0000-000000000003','Ahmed Musa','ahmed.musa@example.com','+234 803 555 0203','Abuja','Wuse','Wuse Weekend League',16,4,false,'2025-07-01', null,'onboarding'),
  ('b1000000-0000-0000-0000-000000000004','Emeka Chukwu','emeka.c@example.com','+234 803 555 0204','Lagos','Yaba','Yaba United',0,0,false,null, null,'contacted'),
  ('b1000000-0000-0000-0000-000000000005','Tobi Alade','tobi.alade@example.com','+234 803 555 0205','Port Harcourt','GRA','GRA Street Football',12,2,false,'2025-08-15', current_date + 10,'interested'),
  ('b1000000-0000-0000-0000-000000000006','Musa Ibrahim','musa.i@example.com','+234 803 555 0206','Kano','Sabon Gari','Kano Grassroots FC',0,0,false,null, null,'prospect')
on conflict (id) do nothing;

-- ---- CAMPAIGNS --------------------------------------------------------------
insert into sportconn.campaigns
  (id, name, objective, campaign_type, channel, status, target_audience, location, start_date,
   target_leads, actual_leads, target_users, actual_users, budget, cost, sent_count, reply_count, meeting_count) values
  ('e2000000-0000-0000-0000-000000000001','Lekki Pick-Up Game','Grow weekly grassroots turnout in Lekki','user_acquisition','event','active','Local footballers, 18-35','Lekki, Lagos','2025-11-01',
   null,0,200,64,300000,180000,0,0,0),
  ('e2000000-0000-0000-0000-000000000002','Facility Acquisition — Lagos Mainland','Sign 5 facility partners on Lagos mainland','facility_acquisition','multi','active','Facility owners/operators','Lagos Mainland','2025-10-01',
   10,4,null,0,500000,220000,0,0,0),
  ('e2000000-0000-0000-0000-000000000003','Sponsor Outreach Q1','Book 10 sponsor discovery calls','sponsor_outreach','email','active','Brand marketing leads','Nigeria','2026-01-05',
   10,4,null,0,null,null,140,18,6),
  ('e2000000-0000-0000-0000-000000000004','Captain Recruitment Drive','Recruit 15 new community captains','captain_recruitment','multi','draft','Local football organizers','Lagos, Abuja, Port Harcourt',null,
   15,3,null,0,150000,0,0,0,0)
on conflict (id) do nothing;

-- ---- LEADS: SPONSOR PIPELINE -------------------------------------------------
insert into sportconn.leads
  (id, full_name, title, email, phone, company_name, location_city, location_country,
   lead_type, pipeline, stage, source, priority, temperature, expected_value, currency, probability,
   sponsorship_category, next_follow_up_at, next_follow_up_type, campaign_id, notes) values
  ('f1000000-0000-0000-0000-000000000001','Adaeze Nwankwo','Marketing Director','adaeze@titantelecom.ng','+234 803 555 0301','Titan Telecom',
   'Lagos','Nigeria','sponsor','sponsor','discovery','sponsor_outreach','high','hot',10000000,'NGN',50,
   'Grassroots Football', now() + interval '3 days','sponsor_meeting','e2000000-0000-0000-0000-000000000003',
   'Very interested in grassroots football sponsorship. Discovery meeting booked.'),
  ('f1000000-0000-0000-0000-000000000002','Wale Adeyemi','Brand Manager','wale@apexsportsgroup.ng','+234 803 555 0302','Apex Sports Group',
   'Lagos','Nigeria','sponsor','sponsor','proposal','event','high','hot',7500000,'NGN',60,
   'Event Sponsorship', now() - interval '1 day','proposal',null,
   'Proposal sent for the Lekki Pick-Up Game tournament finale.'),
  ('f1000000-0000-0000-0000-000000000003','Ngozi Eze','CMO','ngozi@globalsportsbrand.com','+234 803 555 0303','Global Sports Brand',
   'Lagos','Nigeria','sponsor','sponsor','contacted','linkedin','medium','warm',5000000,'NGN',30,
   'Brand Activation', now() + interval '5 days','call',null,'Initial LinkedIn conversation went well.'),
  ('f1000000-0000-0000-0000-000000000004','Bola Shonibare','Sponsorship Lead','bola@playnation.ng','+234 803 555 0304','PlayNation',
   'Ibadan','Nigeria','sponsor','sponsor','new_lead','website','medium','warm',3000000,'NGN',20,
   'Fan Engagement', now() + interval '7 days','email',null,'Inbound via website contact form.'),
  ('f1000000-0000-0000-0000-000000000005','Yusuf Danladi','Head of Marketing','yusuf@northernbrands.ng','+234 803 555 0305','Northern Brands Ltd',
   'Kano','Nigeria','sponsor','sponsor','new_lead','email','low','cold',2000000,'NGN',10,
   'Cash Sponsorship', null, null, null,'No budget this quarter.')
on conflict (id) do nothing;
update sportconn.leads set stage = 'lost', lost_reason = 'no_budget'
  where id = 'f1000000-0000-0000-0000-000000000005';

-- ---- LEADS: INVESTOR PIPELINE -------------------------------------------------
insert into sportconn.leads
  (id, full_name, title, email, phone, company_name, location_city, location_country,
   lead_type, pipeline, stage, source, priority, temperature, expected_value, currency, probability,
   investor_type, ticket_size, target_raise, next_follow_up_at, next_follow_up_type, notes) values
  ('f1000000-0000-0000-0000-000000000006','Chidi Okafor','Partner','chidi@capitalventures.ng','+234 803 555 0306','Capital Ventures',
   'Lagos','Nigeria','investor','investor','deck_sent','investor_outreach','high','hot',75000,'USD',40,
   'Venture Capital',75000,500000, now() + interval '2 days','investor_meeting','Pitch deck sent last week; strong initial interest.'),
  ('f1000000-0000-0000-0000-000000000007','Amara Bello','Angel Investor','amara.bello@example.com','+234 803 555 0307',null,
   'Lagos','Nigeria','investor','investor','interested','existing_network','medium','warm',25000,'USD',30,
   'Angel Investor',25000,null, now() + interval '4 days','call','Warm intro via existing network.'),
  ('f1000000-0000-0000-0000-000000000008','Tunji Fashola','Investment Director','tunji@nextgensports.ng','+234 803 555 0308','NextGen Sports',
   'Lagos','Nigeria','investor','investor','due_diligence','referral','high','warm',150000,'USD',55,
   'Sports Investor',150000,750000, now() - interval '2 days','investor_meeting','Due diligence in progress; data room shared.'),
  ('f1000000-0000-0000-0000-000000000009','Grace Umeh','Managing Partner','grace@familyofficeng.com','+234 803 555 0309','Umeh Family Office',
   'Abuja','Nigeria','investor','investor','prospect','organic','low','cold',50000,'USD',10,
   'Family Office',50000,null, now() + interval '9 days','email','Cold inbound via SportConn website.'),
  ('f1000000-0000-0000-0000-000000000010','Segun Adebayo','Principal','segun@corporateinv.ng','+234 803 555 0310','Corporate Investments Ltd',
   'Lagos','Nigeria','investor','investor','passed','investor_outreach','medium','cold',100000,'USD',0,
   'Corporate Investor',100000,null, null, null,'Passed — timing not right for their fund cycle.')
on conflict (id) do nothing;
update sportconn.leads set stage = 'passed', lost_reason = 'timing'
  where id = 'f1000000-0000-0000-0000-000000000010';

-- ---- LEADS: STRATEGIC PARTNERSHIP PIPELINE ------------------------------------
insert into sportconn.leads
  (id, full_name, title, email, phone, company_name, location_city, location_country,
   lead_type, pipeline, stage, source, priority, temperature, expected_value, currency, probability,
   next_follow_up_at, next_follow_up_type, notes) values
  ('f1000000-0000-0000-0000-000000000011','Funmi Adeyinka','Head of Partnerships','funmi@elitefootballacademy.ng','+234 803 555 0311','Elite Football Academy',
   'Lagos','Nigeria','academy','strategic_partnership','proposal','existing_network','high','hot',null,'NGN',null,
   now() + interval '1 day','meeting','Proposal for joint talent-scouting program under review.'),
  ('f1000000-0000-0000-0000-000000000012','Kunle Bakare','Media Partnerships Lead','kunle@sportswaveng.com','+234 803 555 0312','SportsWave Media',
   'Lagos','Nigeria','media_partner','strategic_partnership','discovery','referral','medium','warm',null,'NGN',null,
   now() + interval '4 days','call','Exploring content distribution partnership.'),
  ('f1000000-0000-0000-0000-000000000013','Ijeoma Nnadi','Tech Partnerships','ijeoma@paylinkng.com','+234 803 555 0313','PayLink Technologies',
   'Lagos','Nigeria','corporate_partner','strategic_partnership','agreement','existing_network','high','hot',null,'NGN',null,
   now() - interval '1 day','other','Payment integration partnership — agreement in final review.')
on conflict (id) do nothing;
update sportconn.leads set stage = 'active', status = 'won'
  where id = 'f1000000-0000-0000-0000-000000000013';

-- ---- LEADS: USER ACQUISITION PIPELINE ------------------------------------------
insert into sportconn.leads
  (id, full_name, title, company_name, location_city, location_country,
   lead_type, pipeline, stage, source, priority, temperature, value_type,
   target_users, actual_users, target_location, target_community, campaign_id, next_follow_up_at, notes) values
  ('f1000000-0000-0000-0000-000000000014','Lekki Pick-Up Game Initiative',null,null,'Lagos','Nigeria',
   'community','user_acquisition','users_acquired','campaign','high','warm','user_acquisition',
   200,64,'Lekki, Lagos','Lekki Pick-Up Game','e2000000-0000-0000-0000-000000000001', now() + interval '6 days',
   'Weekly grassroots games driving signups. 64 of 200 target users acquired.'),
  ('f1000000-0000-0000-0000-000000000015','Surulere Community Drive',null,null,'Lagos','Nigeria',
   'community','user_acquisition','outreach_started','field_sales','medium','warm','user_acquisition',
   150,38,'Surulere, Lagos','Surulere Ballers',null, now() + interval '8 days','Captain-led outreach in progress.'),
  ('f1000000-0000-0000-0000-000000000016','Abuja Weekend League Push',null,null,'Abuja','Nigeria',
   'community','user_acquisition','target_identified','social_media','low','cold','user_acquisition',
   100,6,'Wuse, Abuja','Wuse Weekend League',null, now() + interval '14 days','Early stage — social campaign just launched.')
on conflict (id) do nothing;

-- ---- OUTREACH (interaction log) ----------------------------------------------
insert into sportconn.outreach (lead_id, facility_id, captain_id, campaign_id, channel, direction, subject, outcome, occurred_at) values
  ('f1000000-0000-0000-0000-000000000001',null,null,'e2000000-0000-0000-0000-000000000003','email','outbound','SportConn x Titan Telecom sponsorship intro','replied', now() - interval '4 days'),
  ('f1000000-0000-0000-0000-000000000001',null,null,null,'sponsor_meeting','outbound','Discovery meeting','completed', now() - interval '1 day'),
  ('f1000000-0000-0000-0000-000000000002',null,null,null,'proposal','outbound','Sponsorship proposal — Lekki Pick-Up Game finale','sent', now() - interval '1 day'),
  ('f1000000-0000-0000-0000-000000000006',null,null,null,'investor_meeting','outbound','Intro call with Capital Ventures','completed', now() - interval '3 days'),
  ('f1000000-0000-0000-0000-000000000008',null,null,null,'email','outbound','Due diligence data room access','replied', now() - interval '2 days'),
  (null,'a1000000-0000-0000-0000-000000000001',null,null,'site_visit','outbound','Site visit — Urban Turf Arena','completed', now() - interval '2 days'),
  (null,'a1000000-0000-0000-0000-000000000002',null,null,'call','outbound','Negotiation follow-up call','no_response', now() - interval '1 day'),
  (null,null,'b1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000004','whatsapp','inbound','Weekly game recap','completed', now() - interval '1 day')
on conflict do nothing;

-- ---- TASKS -------------------------------------------------------------------
insert into sportconn.tasks (title, description, status, priority, due_at, lead_id, facility_id, captain_id) values
  ('Follow up with Adaeze Nwankwo','Confirm sponsor discovery meeting agenda','to_do','high', now(), 'f1000000-0000-0000-0000-000000000001', null, null),
  ('Send revised proposal to Wale Adeyemi','Adjust sponsorship tiers per feedback','to_do','high', now() - interval '1 day', 'f1000000-0000-0000-0000-000000000002', null, null),
  ('Prepare due diligence pack for NextGen Sports','Financials + user growth data','to_do','high', now() + interval '2 days', 'f1000000-0000-0000-0000-000000000008', null, null),
  ('Schedule site visit — Capital Sports Complex','Confirm date with Ngozi Obi','to_do','medium', now() + interval '3 days', null, 'a1000000-0000-0000-0000-000000000004', null),
  ('Check in with Chuka Obi','Confirm this week''s game logistics','to_do','low', now() + interval '1 day', null, null, 'b1000000-0000-0000-0000-000000000001'),
  ('Review PayLink partnership agreement','Legal review before signature','completed','medium', now() - interval '2 days', 'f1000000-0000-0000-0000-000000000013', null, null)
on conflict do nothing;

-- ---- ASSIGN everything to the first staff user, if one exists ---------------
do $$
declare v_user uuid := (select id from sportconn.users order by created_at limit 1);
begin
  if v_user is not null then
    update sportconn.leads      set assigned_to = v_user where assigned_to is null;
    update sportconn.leads      set created_by  = v_user where created_by  is null;
    update sportconn.facilities set assigned_to = v_user where assigned_to is null;
    update sportconn.facilities set created_by  = v_user where created_by  is null;
    update sportconn.captains   set assigned_to = v_user where assigned_to is null;
    update sportconn.captains   set created_by  = v_user where created_by  is null;
    update sportconn.tasks      set assigned_to = v_user where assigned_to is null;
    update sportconn.tasks      set created_by  = v_user where created_by  is null;
    update sportconn.campaigns  set owner       = v_user where owner is null;
    update sportconn.campaigns  set created_by  = v_user where created_by  is null;
    update sportconn.outreach   set created_by  = v_user where created_by  is null;
  end if;
end $$;
