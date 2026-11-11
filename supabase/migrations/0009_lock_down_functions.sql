-- ============================================================================
-- SportConn CRM — migration 0009: no database functions for the public key
--
-- Postgres lets PUBLIC (which includes the `anon` role behind the app's public
-- key) execute every new function unless that is revoked. The reporting and
-- eligibility functions are SECURITY DEFINER, so the public key could read
-- dashboard figures, check eligibility / suppression of any address, and list
-- a lead's addresses given its id. Nothing could be changed that way.
--
-- This removes EXECUTE from PUBLIC/anon on every function in the schema,
-- grants it back to signed-in staff (authenticated) and the server
-- (service_role), then keeps the engine/sender functions service-role only.
-- It also changes the schema's defaults so future functions start locked.
--
-- Run AFTER 0008. Idempotent.
-- ============================================================================

revoke execute on all functions in schema sportconn from public, anon;
grant  execute on all functions in schema sportconn to authenticated, service_role;

-- engine + sender functions stay server-only
do $$
declare f text;
begin
  foreach f in array array[
    'sportconn.engine_upsert_lead(jsonb, uuid, integer)',
    'sportconn.engine_check_leads(jsonb)',
    'sportconn.engine_set_eligibility(jsonb, uuid)',
    'sportconn.engine_create_draft(jsonb, uuid)',
    'sportconn.email_claim_batch(integer)',
    'sportconn.email_mark_sent(uuid, text)',
    'sportconn.email_mark_failed(uuid, text, boolean)',
    'sportconn.email_apply_event(text, text, text, jsonb)',
    'sportconn.email_unsubscribe(uuid)',
    'sportconn.email_record_reply(jsonb)',
    'sportconn.engine_classify_reply(uuid, jsonb, uuid)',
    'sportconn.email_followups_due(integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Future functions: Postgres's PUBLIC-execute default can only be removed
-- database-wide (per-schema default privileges can add, not remove), which
-- would affect other schemas on this project. So every migration that creates
-- a function must end with the same revoke/grant as above (see CLAUDE.md).
