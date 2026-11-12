-- ============================================================================
-- SportConn CRM — migration 0012: the sending clock runs inside Supabase
--
-- Supabase Cron (pg_cron) calls email-engine /run every 15 minutes through
-- pg_net, so sending no longer depends on n8n (or any outside server) staying up.
--
-- No secret is copied by hand: this migration puts a random token in Supabase
-- Vault ("sportconn_email_engine_cron_token"); the cron job sends it, and the
-- email-engine function checks it with email_engine_cron_token_ok() — which
-- answers yes/no and never returns the token. ENGINE_API_KEY keeps working.
--
-- Project-specific: the URL below is the SportConn project (xvuifgbdcfhezbcevskl).
-- Run AFTER 0011, then redeploy email-engine. Idempotent.
--   Stop the clock:  select cron.unschedule('sportconn-email-engine-run');
--   Recent runs:     select * from cron.job_run_details order by start_time desc limit 10;
--   Replies:         select id, status_code, content, created from net._http_response order by created desc limit 10;
-- ============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- The token, created once (never shown, never in this file).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sportconn_email_engine_cron_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'sportconn_email_engine_cron_token',
      'Bearer token Supabase Cron sends to email-engine /run (migration 0012)');
  end if;
end $$;

-- Is this the cron token? For the email-engine function only.
create or replace function sportconn.email_engine_cron_token_ok(p_token text)
returns boolean language sql stable security definer set search_path = sportconn, public as $$
  select coalesce(length(p_token) >= 32 and exists (
    select 1 from vault.decrypted_secrets
     where name = 'sportconn_email_engine_cron_token' and decrypted_secret = p_token), false);
$$;
revoke execute on function sportconn.email_engine_cron_token_ok(text) from public, anon, authenticated;
grant  execute on function sportconn.email_engine_cron_token_ok(text) to service_role;

-- Every 15 minutes. Re-running replaces the job of the same name.
select cron.schedule(
  'sportconn-email-engine-run',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := 'https://xvuifgbdcfhezbcevskl.supabase.co/functions/v1/email-engine/run',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                                 where name = 'sportconn_email_engine_cron_token')),
    body    := '{"max": 10}'::jsonb,
    timeout_milliseconds := 140000
  );
  $job$
);
