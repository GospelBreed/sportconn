// Sportconn CRM — send-email Edge Function
//
// Sends a one-to-one email to a lead (or one of the lead's contacts) through
// Resend, then logs it as an outbound `outreach` row so it shows on the lead's
// timeline and counts on the sponsor scorecard.
//
// Every database read/write runs with the CALLER's JWT, so RLS applies exactly
// as it does in the app: the caller must be able to read the lead and write
// outreach. The Resend key lives only in this function's secrets.
//
// Guards:
//   • caller must be signed in and have write access (viewers can't send)
//   • recipient must be an address already on the lead or its contacts —
//     this is not a general-purpose mail relay
//   • leads marked "do not email" are refused
//   • per-user daily cap (EMAIL_DAILY_LIMIT, default 100)
//
// Deploy:
//   supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="SportConn Partnerships <partnerships@your-verified-domain>"
//   supabase functions deploy send-email
//
// (SUPABASE_URL and SUPABASE_ANON_KEY are injected by the platform.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "";
const DAILY_LIMIT = Number(Deno.env.get("EMAIL_DAILY_LIMIT") ?? "100");

const MAX_SUBJECT = 200;
const MAX_BODY = 20_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Lead email fields sometimes hold several addresses ("a@x.com / b@y.com"). */
function addressesIn(value: string | null | undefined): string[] {
  return (value ?? "").match(EMAIL_RE)?.map((a) => a.toLowerCase()) ?? [];
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text → simple HTML: paragraphs, line breaks, clickable links. */
function toHtml(text: string) {
  const linked = escapeHtml(text).replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, (m) => {
    const href = m.startsWith("http") ? m : `https://${m}`;
    return `<a href="${href}">${m}</a>`;
  });
  const paras = linked
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#17171F">${paras}</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!RESEND_API_KEY || !EMAIL_FROM) {
    return json({ error: "Email isn't set up yet. Add the RESEND_API_KEY and EMAIL_FROM secrets in Supabase." }, 503);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Please sign in again." }, 401);

    // A client that acts as the caller: RLS applies to everything below.
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: who, error: whoErr } = await asCaller.auth.getUser(jwt);
    if (whoErr || !who.user) return json({ error: "Your session has expired. Please sign in again." }, 401);
    const db = asCaller.schema("sportconn");

    const { data: canWrite, error: cwErr } = await db.rpc("can_write");
    if (cwErr) throw cwErr;
    if (!canWrite) return json({ error: "Your role can't send emails." }, 403);

    const body = await req.json().catch(() => ({}));
    const leadId = String(body.lead_id ?? "");
    const to = String(body.to ?? "").trim().toLowerCase();
    const subject = String(body.subject ?? "").trim();
    const text = String(body.body ?? "").trim();

    if (!leadId) return json({ error: "Choose a lead to email." }, 400);
    if (!subject) return json({ error: "Add a subject." }, 400);
    if (!text) return json({ error: "Write the email before sending." }, 400);
    if (subject.length > MAX_SUBJECT) return json({ error: `Keep the subject under ${MAX_SUBJECT} characters.` }, 400);
    if (text.length > MAX_BODY) return json({ error: "That email is too long to send." }, 400);

    const { data: lead, error: leadErr } = await db
      .from("leads")
      .select("id, full_name, email, email_opt_out, contacts:lead_contacts(email)")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return json({ error: "That lead no longer exists." }, 404);
    if (lead.email_opt_out) {
      return json({ error: "This lead asked not to be emailed. Turn off “Do not email” on the lead first if that has changed." }, 409);
    }

    const allowed = new Set([
      ...addressesIn(lead.email),
      ...((lead.contacts ?? []) as { email: string | null }[]).flatMap((c) => addressesIn(c.email)),
    ]);
    if (!to || !allowed.has(to)) {
      return json({ error: "Send only to an email address saved on this lead or its contacts." }, 400);
    }

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count, error: countErr } = await db
      .from("outreach")
      .select("id", { count: "exact", head: true })
      .eq("created_by", who.user.id)
      .eq("channel", "email")
      .eq("direction", "outbound")
      .not("external_id", "is", null)
      .gte("occurred_at", since);
    if (countErr) throw countErr;
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json({ error: `You've reached today's limit of ${DAILY_LIMIT} emails. Try again tomorrow.` }, 429);
    }

    const replyTo = who.user.email ?? undefined;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": typeof body.idempotency_key === "string" ? body.idempotency_key.slice(0, 256) : crypto.randomUUID(),
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        reply_to: replyTo,
        subject,
        text,
        html: toHtml(text),
      }),
    });
    const sent = await res.json().catch(() => ({}));
    if (!res.ok || !sent?.id) {
      const reason = typeof sent?.message === "string" ? sent.message : `status ${res.status}`;
      console.error("resend error", res.status, reason);
      return json({ error: `The email provider refused the message: ${reason}` }, 502);
    }

    const { error: logErr } = await db.from("outreach").insert({
      lead_id: lead.id,
      channel: "email",
      direction: "outbound",
      outcome: "sent",
      subject,
      body: text,
      recipient: to,
      external_id: sent.id,
      created_by: who.user.id,
    });
    if (logErr) {
      console.error("outreach log failed", logErr.message);
      return json({ data: { id: sent.id, logged: false }, warning: "Email sent, but it couldn't be added to the timeline." });
    }

    return json({ data: { id: sent.id, logged: true } });
  } catch (e) {
    console.error("send-email failed", e instanceof Error ? e.message : e);
    return json({ error: "Something went wrong sending the email. Please try again." }, 500);
  }
});
