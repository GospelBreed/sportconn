// Roseway CRM — manage-users Edge Function
//
// The ONLY place privileged auth operations run. Holds the service-role key
// server-side (env), verifies the caller's JWT resolves to a `super_admin`, then
// performs: create user · set role · enable/disable · delete. Every action is
// written to roseway.audit_log.
//
// Deploy:
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
//   supabase functions deploy manage-users
//
// (SUPABASE_URL and SUPABASE_ANON_KEY are injected by the platform.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ROLES = ["super_admin", "admin", "case_manager", "read_only"] as const;
type Role = (typeof ROLES)[number];

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing Authorization header" }, 401);

    // Resolve the caller.
    const caller = createClient(SUPABASE_URL, ANON_KEY);
    const { data: who, error: whoErr } = await caller.auth.getUser(jwt);
    if (whoErr || !who.user) return json({ error: "Invalid session" }, 401);

    const actorId = who.user.id;
    const actorEmail = who.user.email ?? null;
    const actorRole = (who.user.app_metadata as Record<string, unknown> | null)?.role ?? null;
    if (actorRole !== "super_admin") {
      return json({ error: "Only a super_admin may manage users" }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const db = admin.schema("roseway");
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    const audit = (
      a: string,
      targetId: string | null,
      targetEmail: string | null,
      detail: unknown,
    ) =>
      db.from("audit_log").insert({
        actor_id: actorId,
        actor_email: actorEmail,
        action: a,
        target_user_id: targetId,
        target_email: targetEmail,
        detail: detail ?? {},
      });

    const countSuperAdmins = async () => {
      const { count } = await db
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin");
      return count ?? 0;
    };

    // ---- create ---------------------------------------------------------
    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const full_name = String(body.full_name ?? "").trim() || email.split("@")[0];
      const role = body.role as Role;
      if (!email || !password) return json({ error: "email and password are required" }, 400);
      if (password.length < 8) return json({ error: "password must be at least 8 characters" }, 400);
      if (!ROLES.includes(role)) return json({ error: "invalid role" }, 400);

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
        app_metadata: { role },
      });
      if (error) return json({ error: error.message }, 400);

      // the handle_new_user trigger inserts roseway.users; make sure it agrees
      await db.from("users").update({ role, full_name }).eq("id", data.user.id);
      await audit("user.create", data.user.id, email, { role });
      return json({ ok: true, user: { id: data.user.id, email, role } });
    }

    // ---- set_role -----------------------------------------------------
    if (action === "set_role") {
      const userId = String(body.user_id ?? "");
      const role = body.role as Role;
      if (!userId || !ROLES.includes(role)) return json({ error: "user_id and valid role required" }, 400);
      if (userId === actorId && role !== "super_admin") {
        return json({ error: "You cannot remove your own super_admin role" }, 400);
      }
      if (role !== "super_admin") {
        const { data: tgt } = await db.from("users").select("role").eq("id", userId).maybeSingle();
        if (tgt?.role === "super_admin" && (await countSuperAdmins()) <= 1) {
          return json({ error: "Cannot demote the last super_admin" }, 400);
        }
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { role } });
      if (error) return json({ error: error.message }, 400);
      await db.from("users").update({ role }).eq("id", userId);
      await audit("user.set_role", userId, null, { role });
      return json({ ok: true });
    }

    // ---- set_active -------------------------------------------------
    if (action === "set_active") {
      const userId = String(body.user_id ?? "");
      const active = Boolean(body.active);
      if (!userId) return json({ error: "user_id required" }, 400);
      if (userId === actorId) return json({ error: "You cannot disable yourself" }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: active ? "none" : "876000h",
      });
      if (error) return json({ error: error.message }, 400);
      await db.from("users").update({ is_active: active }).eq("id", userId);
      await audit("user.set_active", userId, null, { active });
      return json({ ok: true });
    }

    // ---- delete -----------------------------------------------------
    if (action === "delete") {
      const userId = String(body.user_id ?? "");
      if (!userId) return json({ error: "user_id required" }, 400);
      if (userId === actorId) return json({ error: "You cannot delete yourself" }, 400);
      const { data: tgt } = await db.from("users").select("role,email").eq("id", userId).maybeSingle();
      if (tgt?.role === "super_admin" && (await countSuperAdmins()) <= 1) {
        return json({ error: "Cannot delete the last super_admin" }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      await audit("user.delete", null, tgt?.email ?? null, { user_id: userId, role: tgt?.role });
      return json({ ok: true });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
