-- ============================================================================
-- SportConn CRM — migration 0005: email from the CRM (Resend)
--
--   • leads.email_opt_out   — the prospect asked not to be emailed; the
--                             send-email function refuses to send.
--   • outreach.recipient    — the address an email was sent to.
--   • outreach.external_id  — the provider's message id (Resend), for tracing.
--
-- Sending itself happens in the `send-email` Edge Function, which logs every
-- sent email as an outbound `outreach` row (→ timeline + last activity).
--
-- Run AFTER 0004. Idempotent.
-- ============================================================================

alter table sportconn.leads
  add column if not exists email_opt_out boolean not null default false;

alter table sportconn.outreach
  add column if not exists recipient   text,
  add column if not exists external_id text;

create index if not exists idx_outreach_external_id on sportconn.outreach(external_id);

-- Log opt-out changes on the lead timeline.
create or replace function sportconn.leads_email_opt_out_log()
returns trigger language plpgsql security definer set search_path = sportconn, public as $$
begin
  if new.email_opt_out is distinct from old.email_opt_out then
    insert into sportconn.activities (lead_id, type, description, created_by)
    values (new.id, 'system',
            case when new.email_opt_out then 'Marked do not email' else 'Email allowed again' end,
            auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_leads_email_opt_out_log on sportconn.leads;
create trigger trg_leads_email_opt_out_log after update on sportconn.leads
  for each row execute function sportconn.leads_email_opt_out_log();
