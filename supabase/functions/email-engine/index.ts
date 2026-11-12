// Sportconn CRM — email-engine Edge Function
//
// Three jobs, each with its own authentication:
//
//   POST /run                 First checks up to 5 recorded addresses with
//                             NeverBounce (when NEVERBOUNCE_API_KEY is set) and
//                             approves AI drafts whose checks now pass (review
//                             off). Then sends the next batch of APPROVED emails
//                             within the daily budget, per-domain limit and
//                             sending hours (email_settings). Called on a
//                             schedule: Supabase Cron every 15 min (migration
//                             0012), or n8n.
//                             Auth: Bearer ENGINE_API_KEY, or the cron token
//                             kept in Supabase Vault (0012).
//
//   POST /webhooks/resend     Resend events. Delivery events (delivered,
//                             bounced, complained, opened…): hard bounces and
//                             spam complaints go on the do-not-contact list.
//                             email.received (replies): the message is fetched
//                             from Resend, stored against its lead
//                             (email_record_reply), and a copy is forwarded to
//                             the approver / lead owner with Reply-To the
//                             prospect. Auth: Svix signature, RESEND_WEBHOOK_SECRET.
//
//   POST /unsubscribe         The CRM's public unsubscribe page (also accepts
//   GET  /unsubscribe?t=…     RFC 8058 one-click, should that header return).
//                             Auth: the message's unguessable token. GET only
//                             redirects to the CRM page, which asks to confirm
//                             — link scanners must not unsubscribe people.
//
// Emails are plain text, from "<approver's name> at SportConn" on the
// EMAIL_FROM address, ending with a personal opt-out line and link. Reply-To
// is reply+<message token>@REPLY_DOMAIN when REPLY_DOMAIN is set (replies are
// captured and matched to the exact email), otherwise the approver's address. No List-Unsubscribe header: it isn't required at a few dozen
// emails a day, and Gmail files mail carrying it under Promotions. Resend's
// Idempotency-Key is the message id, so a retried send can't go out twice.
//
// Deploy:
//   supabase secrets set RESEND_WEBHOOK_SECRET=whsec_... APP_URL=https://<crm address>
//   supabase functions deploy email-engine --no-verify-jwt
// Uses RESEND_API_KEY, EMAIL_FROM (set for send-email) and ENGINE_API_KEY.
// Address checks: supabase secrets set NEVERBOUNCE_API_KEY=... (no key = no checks).
// Reply capture: REPLY_DOMAIN (a Resend receiving domain, e.g. contact.sportconn.com);
// RESEND_API_KEY then needs permission to read received emails (Full access).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { forwardText, fromFor, htmlToText, replyAddress, safeEqual, verifySvix, withFooter } from "./lib.ts";
import { checkAddress } from "../_shared/neverbounce.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENGINE_API_KEY = Deno.env.get("ENGINE_API_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "";
const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://sportconn-crm.netlify.app").replace(/\/+$/, "");
const REPLY_DOMAIN = (Deno.env.get("REPLY_DOMAIN") ?? "").trim().toLowerCase();
const NEVERBOUNCE_API_KEY = (Deno.env.get("NEVERBOUNCE_API_KEY") ?? "").trim();

const MAX_BATCH = 25;
const VERIFY_PER_RUN = 5;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const db = admin.schema("sportconn");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Json = Record<string, unknown>;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const fail = (status: number, error: string, message: string) => json({ error, message }, status);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// POST /run — send a batch
// ---------------------------------------------------------------------------
interface Claimed {
  id: string;
  to: string;
  subject: string;
  body: string;
  unsubscribe_token: string;
  reply_token: string;
  sender_name: string | null;
  sender_email: string | null;
}

/** /run accepts ENGINE_API_KEY (n8n, scripts) or the Supabase Cron token kept in Vault (migration 0012). */
async function runAuthorized(token: string): Promise<boolean> {
  if (!token) return false;
  if (ENGINE_API_KEY && safeEqual(token, ENGINE_API_KEY)) return true;
  if (token.length < 32) return false;
  const { data, error } = await db.rpc("email_engine_cron_token_ok", { p_token: token });
  if (error) {
    console.error("cron token check failed", error.message);
    return false;
  }
  return data === true;
}

async function runBatch(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!(await runAuthorized(token))) return fail(401, "unauthorized", "Invalid or missing API key");
  if (!RESEND_API_KEY || !EMAIL_FROM) return fail(503, "not_configured", "RESEND_API_KEY and EMAIL_FROM must be set");

  const body = (await req.json().catch(() => ({}))) as Json;
  const max = Math.min(Math.max(Number(body.max ?? 10) || 10, 1), MAX_BATCH);

  // 1) check recorded addresses, 2) approve drafts whose checks now pass, 3) send.
  // Steps 1–2 never stop the sending step.
  const verification = await verifyPending();
  let released = 0;
  try {
    const { data: n, error: relErr } = await db.rpc("email_release_ready_drafts", { p_email: null, p_max: 50 });
    if (relErr) throw relErr;
    released = Number(n ?? 0);
  } catch (e) {
    console.error("release drafts failed", e instanceof Error ? e.message : e);
  }

  const { data, error } = await db.rpc("email_claim_batch", { p_max: max });
  if (error) throw error;
  const claim = data as Json & { messages: Claimed[] };
  const results: Json[] = [];

  for (const m of claim.messages ?? []) {
    let res: Response;
    let sent: Json = {};
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `queue-${m.id}`,
        },
        body: JSON.stringify({
          from: fromFor(EMAIL_FROM, m.sender_name),
          to: [m.to],
          reply_to: replyAddress(REPLY_DOMAIN, m.reply_token, m.sender_email),
          subject: m.subject,
          text: withFooter(m.body, APP_URL, m.unsubscribe_token),
        }),
      });
      sent = (await res.json().catch(() => ({}))) as Json;
    } catch (e) {
      await db.rpc("email_mark_failed", { p_id: m.id, p_error: `Network error: ${e instanceof Error ? e.message : e}`, p_retry: true });
      results.push({ id: m.id, ok: false, retry: true });
      continue;
    }

    if (res.ok && typeof sent.id === "string") {
      const { error: markErr } = await db.rpc("email_mark_sent", { p_id: m.id, p_provider_id: sent.id });
      if (markErr) console.error("mark_sent failed", m.id, markErr.message);
      results.push({ id: m.id, ok: true, provider_id: sent.id });
    } else {
      // 429 / 5xx are temporary; anything else (bad address, unverified domain…) won't fix itself.
      const retry = res.status === 429 || res.status >= 500;
      const reason = typeof sent.message === "string" ? sent.message : `status ${res.status}`;
      await db.rpc("email_mark_failed", { p_id: m.id, p_error: `Resend: ${reason}`, p_retry: retry });
      results.push({ id: m.id, ok: false, retry, reason });
    }
  }

  return json({
    ok: true,
    paused: claim.paused ?? false,
    outside_window: claim.outside_window ?? false,
    budget_reached: claim.budget_reached ?? false,
    verification,
    released,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

/**
 * Check up to VERIFY_PER_RUN recorded addresses with NeverBounce (migration
 * 0011). Skipped when NEVERBOUNCE_API_KEY isn't set. A refused key or empty
 * credit balance stops the round; the addresses are retried in a later run.
 */
async function verifyPending(): Promise<Json> {
  if (!NEVERBOUNCE_API_KEY) return { enabled: false };
  try {
    const { data, error } = await db.rpc("email_verify_claim", { p_max: VERIFY_PER_RUN });
    if (error) throw error;
    const emails = ((data ?? []) as unknown[]).map(String);
    const out: Json = { enabled: true, checked: 0, failed: 0, released: 0, cancelled: 0 };
    for (const email of emails) {
      const check = await checkAddress(NEVERBOUNCE_API_KEY, email);
      const { data: rec, error: recErr } = await db.rpc("email_verify_record", {
        p_email: email,
        p_result: check.ok ? check.result : null,
        p_error: check.ok ? null : check.error,
      });
      if (recErr) throw recErr;
      if (check.ok) {
        out.checked = Number(out.checked) + 1;
        out.released = Number(out.released) + Number((rec as Json)?.released ?? 0);
        out.cancelled = Number(out.cancelled) + Number((rec as Json)?.cancelled ?? 0);
      } else {
        out.failed = Number(out.failed) + 1;
        out.error = check.error;
        if (check.fatal) break;
      }
    }
    return out;
  } catch (e) {
    console.error("verification failed", e instanceof Error ? e.message : e);
    return { enabled: true, error: "Address checks didn't run this time" };
  }
}

// ---------------------------------------------------------------------------
// POST /webhooks/resend — Svix-signed events
// ---------------------------------------------------------------------------
async function resendWebhook(req: Request) {
  if (!WEBHOOK_SECRET) return fail(503, "not_configured", "RESEND_WEBHOOK_SECRET is not set");
  const raw = await req.text();
  const id = req.headers.get("svix-id") ?? "";
  const valid = await verifySvix(WEBHOOK_SECRET, id, req.headers.get("svix-timestamp") ?? "", raw, req.headers.get("svix-signature") ?? "");
  if (!valid) return fail(401, "invalid_signature", "Webhook signature check failed");

  let event: Json;
  try {
    event = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_json", "Body must be valid JSON");
  }
  const type = String(event.type ?? "");
  const eventData = (event.data ?? {}) as Json;
  const providerId = String(eventData.email_id ?? "");
  if (!type || !providerId) return json({ ok: true, ignored: true });

  if (type === "email.received") return await receiveReply(providerId, eventData);

  const { data, error } = await db.rpc("email_apply_event", { p_event_id: id, p_type: type, p_provider_id: providerId, p_payload: event });
  if (error) throw error;
  return json(data);
}

/**
 * An inbound email (a reply). The webhook carries only metadata, so the body
 * is read from Resend's Received emails API. If that read fails (e.g. the API
 * key only has sending access) the reply is still recorded, with a note.
 */
async function receiveReply(providerId: string, meta: Json) {
  let content: Json = {};
  let readError: string | null = null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(providerId)}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    content = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) readError = typeof content.message === "string" ? content.message : `status ${res.status}`;
  } catch (e) {
    readError = e instanceof Error ? e.message : String(e);
  }
  const text =
    (typeof content.text === "string" && content.text.trim()) ||
    (typeof content.html === "string" ? htmlToText(content.html) : "") ||
    `(The message text couldn't be read from Resend${readError ? `: ${readError}` : ""}. Open it in Resend → Emails → Receiving.)`;

  const { data, error } = await db.rpc("email_record_reply", {
    p: {
      provider_id: providerId,
      from: content.from ?? meta.from,
      to: Array.isArray(content.to) ? content.to : meta.to,
      subject: content.subject ?? meta.subject,
      text,
      received_at: content.created_at ?? meta.created_at,
    },
  });
  if (error) throw error;
  const rec = data as Json & { notify?: { email: string; full_name: string }[]; duplicate?: boolean };

  // Forward a copy so the conversation can continue from the person's own inbox.
  if (!rec.duplicate && rec.ok && rec.notify?.length) {
    const fromLine = String(content.from ?? meta.from ?? "");
    const subject = String(content.subject ?? meta.subject ?? "(no subject)");
    for (const person of rec.notify) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `reply-${providerId}-${person.email}` },
          body: JSON.stringify({
            from: fromFor(EMAIL_FROM, "SportConn CRM"),
            to: [person.email],
            reply_to: fromLine || undefined,
            subject: `Reply from ${rec.company ?? fromLine}: ${subject}`.slice(0, 200),
            text: forwardText({ from: fromLine, company: String(rec.company ?? ""), text, leadUrl: rec.lead_id ? `${APP_URL}/leads?focus=${rec.lead_id}` : `${APP_URL}/email-review` }),
          }),
        });
      } catch (e) {
        console.error("reply forward failed", person.email, e instanceof Error ? e.message : e);
      }
    }
  }
  return json({ ok: true, reply: rec });
}

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------
async function unsubscribe(req: Request, url: URL) {
  let token = url.searchParams.get("t") ?? "";
  if (req.method === "GET") {
    // Never unsubscribe on GET (link scanners prefetch links); send people to the confirm page.
    return new Response(null, { status: 303, headers: { ...CORS, Location: `${APP_URL}/unsubscribe?t=${encodeURIComponent(token)}` } });
  }
  if (!token) {
    const body = (await req.json().catch(() => ({}))) as Json;
    token = String(body.token ?? "");
  }
  if (!UUID_RE.test(token)) return fail(400, "invalid_token", "This unsubscribe link isn't valid.");
  const { data, error } = await db.rpc("email_unsubscribe", { p_token: token });
  if (error) throw error;
  const res = data as Json;
  if (res.ok === false) return fail(404, "unknown_token", "This unsubscribe link isn't valid or has expired.");
  return json({ ok: true, email: res.email, already: res.already });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/email-engine/, "").replace(/\/+$/, "") || "/";
  try {
    if (req.method === "POST" && path === "/run") return await runBatch(req);
    if (req.method === "POST" && path === "/webhooks/resend") return await resendWebhook(req);
    if ((req.method === "POST" || req.method === "GET") && path === "/unsubscribe") return await unsubscribe(req, url);
    return fail(404, "not_found", `No route for ${req.method} ${path}`);
  } catch (e) {
    console.error("email-engine error", req.method, path, e instanceof Error ? e.message : e);
    return fail(500, "server_error", "Something went wrong. The request was not completed.");
  }
});
