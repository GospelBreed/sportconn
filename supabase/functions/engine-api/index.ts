// Sportconn CRM — engine-api Edge Function
//
// REST API for the AI Partnership Acquisition Engine (n8n + Claude). This is
// the engine's ONLY way into the CRM: a fixed set of validated operations, no
// raw table access, every write attributed to the "AI Partnership Engine"
// user and recorded in audit_log. The engine can't send email, change deal
// money fields, mark anything Won, or delete records.
//
// Auth: `Authorization: Bearer <ENGINE_API_KEY>` (a secret, not a user JWT —
// deploy with --no-verify-jwt). See docs/ENGINE_API.md for every route.
//
// Deploy:
//   supabase secrets set ENGINE_API_KEY=<long random string>
//   supabase functions deploy engine-api --no-verify-jwt
// Optional: ENGINE_MIN_SCORE (default 65), ENGINE_DAILY_TARGET (default 80).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENGINE_API_KEY = Deno.env.get("ENGINE_API_KEY") ?? "";
const MIN_SCORE = Number(Deno.env.get("ENGINE_MIN_SCORE") ?? "65");
const DAILY_TARGET = Number(Deno.env.get("ENGINE_DAILY_TARGET") ?? "80");

const ENGINE_EMAIL = "engine@sportconn.internal";
const MAX_BODY_BYTES = 512 * 1024;
const MAX_CHECK = 200;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const db = admin.schema("sportconn");

// Fields PATCH /leads/{id} may change. Commercial, contract, payment, owner
// and scoring fields are deliberately absent: people own those.
const PATCHABLE = new Set([
  "stage", "next_action", "next_follow_up_at", "next_follow_up_type", "temperature", "priority",
  "notes", "title", "phone", "linkedin_url", "website", "industry", "location_city", "location_country",
]);

type Json = Record<string, unknown>;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
const fail = (status: number, error: string, message: string) => json({ error, message }, status);

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Start of "today" in Lagos (UTC+1, no daylight saving), as an ISO timestamp. */
function lagosDayStart(d = new Date()): { date: string; startIso: string } {
  const lagos = new Date(d.getTime() + 3600_000);
  const date = lagos.toISOString().slice(0, 10);
  return { date, startIso: new Date(`${date}T00:00:00+01:00`).toISOString() };
}

let engineUserId: string | null = null;
async function getEngineUserId(): Promise<string> {
  if (engineUserId) return engineUserId;
  const { data: existing } = await db.from("users").select("id").eq("email", ENGINE_EMAIL).maybeSingle();
  if (existing) return (engineUserId = existing.id as string);
  const { data, error } = await admin.auth.admin.createUser({
    email: ENGINE_EMAIL,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: "AI Partnership Engine" },
    app_metadata: { role: "business_development" },
  });
  if (error) throw new Error(`Could not provision the engine user: ${error.message}`);
  await db.from("users").update({ role: "business_development", full_name: "AI Partnership Engine" }).eq("id", data.user.id);
  return (engineUserId = data.user.id);
}

async function audit(action: string, detail: Json) {
  const actor = await getEngineUserId();
  await db.from("audit_log").insert({ actor_id: actor, actor_email: ENGINE_EMAIL, action, detail });
}

async function readBody(req: Request): Promise<Json | Response> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return fail(413, "too_large", "Request body is too large");
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "invalid_json", "Body must be a JSON object");
    return body as Json;
  } catch {
    return fail(400, "invalid_json", "Body must be valid JSON");
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function checkLeads(body: Json) {
  const candidates = body.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return fail(400, "invalid_request", "candidates must be a non-empty array");
  if (candidates.length > MAX_CHECK) return fail(400, "too_many", `At most ${MAX_CHECK} candidates per call`);
  const { data, error } = await db.rpc("engine_check_leads", { p: { candidates } });
  if (error) throw error;
  return json(data);
}

async function searchLeads(url: URL) {
  const q = url.searchParams.get("q")?.trim();
  const domain = url.searchParams.get("domain")?.trim();
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20") || 20, 1), 100);
  if (!q && !domain && !email) return fail(400, "invalid_request", "Give q, domain or email");
  let query = db
    .from("leads")
    .select("id,full_name,company_name,company_domain,email,pipeline,stage,status,source,prospect_score,email_opt_out,last_researched_at,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (domain) {
    const { data: nd } = await db.rpc("normalize_domain", { p: domain });
    if (!nd) return fail(400, "invalid_domain", "That isn't a valid domain");
    query = query.eq("company_domain", nd as string);
  }
  if (email) query = query.ilike("email", `%${email.replace(/[%_]/g, "")}%`);
  if (q) {
    const s = q.replace(/[%_,()]/g, " ");
    query = query.or(`company_name.ilike.%${s}%,full_name.ilike.%${s}%,company_domain.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return json({ results: data });
}

async function upsertLead(body: Json) {
  const actor = await getEngineUserId();
  const { data, error } = await db.rpc("engine_upsert_lead", { p: body, p_actor: actor, p_min_score: MIN_SCORE });
  if (error) {
    // A race with another write for the same domain surfaces as the trigger's message.
    if (/already exists/i.test(error.message)) return fail(409, "duplicate", error.message);
    throw error;
  }
  const res = data as Json;
  if (res.ok === false) {
    const status = res.error === "suppressed" ? 409 : 422;
    return json(res, status);
  }
  return json(res, res.action === "created" ? 201 : 200);
}

async function patchLead(id: string, body: Json) {
  if (!UUID_RE.test(id)) return fail(400, "invalid_id", "Lead id must be a uuid");
  const fields = (body.fields ?? body) as Json;
  const keys = Object.keys(fields);
  if (keys.length === 0) return fail(400, "invalid_request", "No fields to update");
  const bad = keys.filter((k) => !PATCHABLE.has(k));
  if (bad.length) return fail(400, "field_not_allowed", `The engine can't change: ${bad.join(", ")}`);

  const { data: lead, error: le } = await db.from("leads").select("id,pipeline").eq("id", id).maybeSingle();
  if (le) throw le;
  if (!lead) return fail(404, "not_found", "No lead with that id");

  if (typeof fields.stage === "string") {
    const { data: st } = await db
      .from("pipeline_stages")
      .select("key,is_won,is_lost")
      .eq("pipeline_key", lead.pipeline)
      .eq("key", fields.stage)
      .maybeSingle();
    if (!st) return fail(400, "invalid_stage", `"${fields.stage}" isn't a stage in the ${lead.pipeline} pipeline`);
    if (st.is_won) return fail(403, "stage_not_allowed", "Only people can mark a deal Won");
    if (st.is_lost) return fail(403, "stage_not_allowed", "Only people can mark a deal Lost");
  }

  const { data, error } = await db
    .from("leads")
    .update(fields)
    .eq("id", id)
    .select("id,stage,status,next_action,next_follow_up_at,updated_at")
    .single();
  if (error) return fail(400, "update_failed", error.message);
  await audit("engine.lead.update", { lead_id: id, fields: keys });
  return json({ ok: true, lead: data });
}

async function listSuppression(url: URL) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "500") || 500, 1), 1000);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0") || 0, 0);
  let query = db
    .from("suppressions")
    .select("email,domain,reason,source,created_at", { count: "exact" })
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  const since = url.searchParams.get("since");
  if (since) {
    if (Number.isNaN(Date.parse(since))) return fail(400, "invalid_since", "since must be an ISO date/time");
    query = query.gte("created_at", since);
  }
  const { data, error, count } = await query;
  if (error) throw error;
  return json({ results: data, total: count, offset, limit });
}

const SUPPRESSION_REASONS = new Set(["unsubscribed", "opt_out_request", "bounced", "complained", "do_not_contact", "manual", "other"]);

async function addSuppression(body: Json) {
  const email = typeof body.email === "string" ? body.email : null;
  const domain = typeof body.domain === "string" ? body.domain : null;
  const reason = String(body.reason ?? "");
  if ((email ? 1 : 0) + (domain ? 1 : 0) !== 1) return fail(400, "invalid_request", "Give exactly one of email or domain");
  if (!SUPPRESSION_REASONS.has(reason)) return fail(400, "invalid_reason", `reason must be one of: ${[...SUPPRESSION_REASONS].join(", ")}`);
  const actor = await getEngineUserId();
  const { data, error } = await db
    .from("suppressions")
    .insert({ email, domain, reason, source: "engine", note: typeof body.note === "string" ? body.note : null, created_by: actor })
    .select("email,domain,reason,created_at")
    .single();
  if (error) {
    if (error.code === "23505") return json({ ok: true, already_suppressed: true });
    return fail(400, "invalid_suppression", error.message);
  }
  await audit("engine.suppression.add", { email: data.email, domain: data.domain, reason });
  return json({ ok: true, suppression: data }, 201);
}

async function todaySummary() {
  const { date, startIso } = lagosDayStart();
  const [created, updated, runs] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).eq("source", "ai_engine").gte("created_at", startIso),
    db.from("lead_research").select("lead_id", { count: "exact", head: true }).eq("origin", "ai_engine").gte("created_at", startIso),
    db.from("engine_runs").select("*").eq("run_date", date).order("started_at"),
  ]);
  if (created.error) throw created.error;
  if (updated.error) throw updated.error;
  if (runs.error) throw runs.error;
  const createdToday = created.count ?? 0;
  return {
    date,
    daily_target: DAILY_TARGET,
    created_today: createdToday,
    research_saved_today: updated.count ?? 0,
    remaining: Math.max(DAILY_TARGET - createdToday, 0),
    runs: runs.data,
  };
}

async function startRun(body: Json) {
  const target = body.target === undefined ? DAILY_TARGET : Number(body.target);
  if (!Number.isInteger(target) || target < 0) return fail(400, "invalid_target", "target must be a whole number ≥ 0");
  const { data, error } = await db
    .from("engine_runs")
    .insert({ target, notes: typeof body.notes === "string" ? body.notes : null })
    .select("*")
    .single();
  if (error) throw error;
  await audit("engine.run.start", { run_id: data.id, target });
  return json({ ok: true, run: data, today: await todaySummary() }, 201);
}

const RUN_COUNTS = ["created_count", "updated_count", "duplicate_count", "rejected_count"] as const;
const RUN_STATUSES = new Set(["running", "completed", "partial", "failed"]);

async function finishRun(id: string, body: Json) {
  if (!UUID_RE.test(id)) return fail(400, "invalid_id", "Run id must be a uuid");
  const patch: Json = {};
  if (body.status !== undefined) {
    if (!RUN_STATUSES.has(String(body.status))) return fail(400, "invalid_status", "status must be running, completed, partial or failed");
    patch.status = body.status;
    if (body.status !== "running") patch.finished_at = new Date().toISOString();
  }
  for (const k of RUN_COUNTS) {
    if (body[k] === undefined) continue;
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < 0) return fail(400, "invalid_count", `${k} must be a whole number ≥ 0`);
    patch[k] = n;
  }
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (body.errors !== undefined) {
    if (!Array.isArray(body.errors)) return fail(400, "invalid_errors", "errors must be an array");
    patch.errors = body.errors.slice(0, 200);
  }
  if (Object.keys(patch).length === 0) return fail(400, "invalid_request", "Nothing to update");
  const { data, error } = await db.from("engine_runs").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  if (!data) return fail(404, "not_found", "No run with that id");
  await audit("engine.run.update", { run_id: id, ...patch });
  return json({ ok: true, run: data });
}

async function stats(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  for (const v of [from, to]) {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail(400, "invalid_date", "from/to must be YYYY-MM-DD");
  }
  const { data: scorecard, error } = await db.rpc("get_sponsor_scorecard", { p_from: from, p_to: to });
  if (error) throw error;
  const sc = scorecard as { from: string; to: string };
  const startIso = new Date(`${sc.from}T00:00:00+01:00`).toISOString();
  const endIso = new Date(new Date(`${sc.to}T00:00:00+01:00`).getTime() + 86_400_000).toISOString();
  const { data: rows, error: e2 } = await db
    .from("leads")
    .select("prospect_score,pipeline")
    .eq("source", "ai_engine")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .limit(10000);
  if (e2) throw e2;
  const scores = (rows ?? []).map((r) => r.prospect_score as number | null);
  return json({
    window: { from: sc.from, to: sc.to },
    engine: {
      leads_created: scores.length,
      priority_80_plus: scores.filter((s) => (s ?? 0) >= 80).length,
      qualified_65_79: scores.filter((s) => s !== null && s >= 65 && s < 80).length,
      by_pipeline: (rows ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.pipeline as string] = (acc[r.pipeline as string] ?? 0) + 1;
        return acc;
      }, {}),
    },
    scorecard,
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (!ENGINE_API_KEY) return fail(503, "not_configured", "ENGINE_API_KEY is not set");
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !safeEqual(token, ENGINE_API_KEY)) return fail(401, "unauthorized", "Invalid or missing API key");

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/engine-api/, "").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const m = req.method;

  try {
    if (m === "GET" && path === "/health") return json({ ok: true, time: new Date().toISOString(), min_score: MIN_SCORE, daily_target: DAILY_TARGET });
    if (m === "GET" && path === "/leads/search") return await searchLeads(url);
    if (m === "GET" && path === "/suppression") return await listSuppression(url);
    if (m === "GET" && path === "/runs/today") return json(await todaySummary());
    if (m === "GET" && path === "/stats") return await stats(url);

    if (m === "POST" || m === "PATCH") {
      const body = await readBody(req);
      if (body instanceof Response) return body;
      if (m === "POST" && path === "/leads/check") return await checkLeads(body);
      if (m === "POST" && path === "/leads/upsert") return await upsertLead(body);
      if (m === "POST" && path === "/suppression") return await addSuppression(body);
      if (m === "POST" && path === "/runs") return await startRun(body);
      if (m === "PATCH" && parts[0] === "leads" && parts.length === 2) return await patchLead(parts[1], body);
      if (m === "PATCH" && parts[0] === "runs" && parts.length === 2) return await finishRun(parts[1], body);
    }
    return fail(404, "not_found", `No route for ${m} ${path}`);
  } catch (e) {
    console.error("engine-api error", m, path, e instanceof Error ? e.message : e);
    return fail(500, "server_error", "Something went wrong. The request was not completed.");
  }
});
