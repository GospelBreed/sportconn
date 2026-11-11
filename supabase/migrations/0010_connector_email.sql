-- ============================================================================
-- SportConn CRM — migration 0010: email safeguards for the Claude connector
--
-- The connector (mcp-server) gains queue_email / list_email_events. It uses the
-- same queue as the engine API, so these rules apply to both:
--   • generic inboxes (info@, hello@, admin@, contact@, support@) are never
--     emailed from the queue — checked when approving and again at send time;
--   • leads in nurture are treated like closed deals (no queued emails);
--   • when a first email is sent, a lead still at Researched / Prospect moves
--     to Contacted (if that pipeline has a Contacted stage).
--
-- Run AFTER 0009. Idempotent.
-- ============================================================================

create or replace function sportconn.is_generic_inbox(p_email text)
returns boolean language sql immutable as $$
  select split_part(lower(trim(coalesce(p_email, ''))), '@', 1)
         in ('info', 'hello', 'admin', 'contact', 'support');
$$;

-- Why a message can't be sent right now (null = it can). Replaces 0007's.
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
  if l.status = 'nurture' then return 'This lead is in nurture'; end if;
  if l.email_opt_out then return 'The lead is marked Do not email'; end if;
  if not exists (
       select 1 from regexp_matches(coalesce(l.email, ''), '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') m
        where lower(m[1]) = e)
     and not exists (select 1 from lead_contacts where lead_id = p_lead and lower(email) = e) then
    return 'The address isn''t saved on this lead or its contacts';
  end if;
  if sportconn.is_generic_inbox(e) then
    return 'Generic inboxes (info@, hello@, admin@, contact@, support@) aren''t emailed from the queue';
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

-- Sent → outreach record, and a first email moves the lead to Contacted. Replaces 0007's.
create or replace function sportconn.email_mark_sent(p_id uuid, p_provider_id text)
returns jsonb language plpgsql security definer set search_path = sportconn, public as $$
declare
  m     sportconn.email_messages;
  v_out uuid;
  l     sportconn.leads;
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

  if m.sequence_step = 1 then
    select * into l from leads where id = m.lead_id;
    if l.status = 'open' and l.stage in ('researched', 'prospect')
       and exists (select 1 from pipeline_stages where pipeline_key = l.pipeline and key = 'contacted') then
      update leads set stage = 'contacted' where id = l.id;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'outreach_id', v_out);
end; $$;

-- CLAUDE.md rule 14: no function callable with the public key.
revoke execute on function sportconn.is_generic_inbox(text) from public, anon;
grant  execute on function sportconn.is_generic_inbox(text) to authenticated, service_role;
revoke execute on function sportconn.email_send_blocker(uuid, text, text, text) from public, anon;
grant  execute on function sportconn.email_send_blocker(uuid, text, text, text) to authenticated, service_role;
revoke execute on function sportconn.email_mark_sent(uuid, text) from public, anon, authenticated;
grant  execute on function sportconn.email_mark_sent(uuid, text) to service_role;
