// Sportconn CRM — mcp-server Edge Function
//
// Exposes the CRM as a remote MCP (Model Context Protocol) server so Claude
// can connect to it as a custom connector, the same way it connects to
// Salesforce/HubSpot/etc. Speaks JSON-RPC 2.0 over a single stateless HTTP
// POST per request (Streamable HTTP transport, no session/SSE needed since
// every tool call is a fast, self-contained DB read/write).
//
// Auth: a static bearer token (MCP_AUTH_TOKEN secret), checked against the
// Authorization header on every request — NOT a Supabase user JWT, so this
// function must be deployed with --no-verify-jwt.
//
// Writes are attributed to a dedicated "Claude Connector" service user
// (sportconn.users, role=business_development — read/write, no delete, no
// user/governance management), created lazily on first use. This keeps the
// connector's effective capability envelope the same as a department-role
// human user even though the DB calls run under the service-role key.
//
// Deploy:
//   supabase secrets set MCP_AUTH_TOKEN=<random-token>
//   supabase functions deploy mcp-server --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_AUTH_TOKEN = Deno.env.get("MCP_AUTH_TOKEN")!;

const CONNECTOR_EMAIL = "claude-connector@sportconn.internal";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const db = admin.schema("sportconn");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let connectorUserId: string | null = null;
async function getConnectorUserId(): Promise<string> {
  if (connectorUserId) return connectorUserId;
  const { data: existing } = await db.from("users").select("id").eq("email", CONNECTOR_EMAIL).maybeSingle();
  if (existing) {
    connectorUserId = existing.id;
    return connectorUserId!;
  }
  const password = crypto.randomUUID() + crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email: CONNECTOR_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Claude Connector" },
    app_metadata: { role: "business_development" },
  });
  if (error) throw new Error(`Failed to provision connector user: ${error.message}`);
  await db.from("users").update({ role: "business_development", full_name: "Claude Connector" }).eq("id", data.user.id);
  connectorUserId = data.user.id;
  return connectorUserId;
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema per MCP spec)
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: "list_leads",
    description:
      "Search/list Sponsor, Investor, Strategic Partnership, or User Acquisition leads. Returns id, name, pipeline, stage, status, value, and follow-up info.",
    inputSchema: {
      type: "object",
      properties: {
        pipeline: { type: "string", enum: ["sponsor", "investor", "strategic_partnership", "user_acquisition"] },
        status: { type: "string", enum: ["open", "won", "lost", "nurture"] },
        stage: { type: "string", description: "Exact stage key, e.g. 'contacted' or 'negotiation'." },
        temperature: { type: "string", enum: ["hot", "warm", "cold", "at_risk"] },
        search: { type: "string", description: "Matches against full_name, company_name, or email." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
    },
  },
  {
    name: "get_lead",
    description: "Get full detail for a single lead by id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "create_lead",
    description:
      "Create a new lead/opportunity in one of the four lead pipelines. Stage defaults to that pipeline's first stage if omitted.",
    inputSchema: {
      type: "object",
      properties: {
        pipeline: { type: "string", enum: ["sponsor", "investor", "strategic_partnership", "user_acquisition"] },
        full_name: { type: "string" },
        company_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        stage: { type: "string" },
        expected_value: { type: "number" },
        currency: { type: "string", default: "NGN" },
        priority: { type: "string", enum: ["high", "medium", "low"], default: "medium" },
        temperature: { type: "string", enum: ["hot", "warm", "cold", "at_risk"], default: "warm" },
        notes: { type: "string" },
      },
      required: ["pipeline", "full_name"],
    },
  },
  {
    name: "update_lead_stage",
    description:
      "Move a lead to a new stage. If the stage is a 'Lost' stage for its pipeline, lost_reason is required (enforced by the database).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        stage: { type: "string" },
        lost_reason: {
          type: "string",
          enum: [
            "no_budget", "not_interested", "competitor", "timing", "no_response",
            "decision_maker_unavailable", "terms_not_agreed", "failed_qualification",
            "internal_decision", "funding_not_available", "partnership_not_suitable", "other",
          ],
        },
      },
      required: ["id", "stage"],
    },
  },
  {
    name: "list_facilities",
    description: "List sports facility partnership opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "won", "lost", "nurture"] },
        search: { type: "string", description: "Matches against name or city." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
    },
  },
  {
    name: "list_captains",
    description: "List local community/football captains.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string" },
        search: { type: "string", description: "Matches against full_name or community." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
    },
  },
  {
    name: "list_tasks",
    description: "List CRM tasks/to-dos.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["to_do", "in_progress", "completed", "cancelled"] },
        due_before: { type: "string", description: "ISO date/time; returns tasks due at or before this." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
    },
  },
  {
    name: "create_task",
    description: "Create a follow-up task, optionally linked to a lead, facility, or captain.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        due_at: { type: "string", description: "ISO datetime." },
        priority: { type: "string", enum: ["low", "medium", "high"], default: "medium" },
        lead_id: { type: "string" },
        facility_id: { type: "string" },
        captain_id: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "log_activity",
    description: "Log a note/call/email/meeting activity against a lead, facility, or captain.",
    inputSchema: {
      type: "object",
      properties: {
        entity_type: { type: "string", enum: ["lead", "facility", "captain"] },
        entity_id: { type: "string" },
        type: { type: "string", enum: ["call", "whatsapp", "email", "meeting", "visit", "note"] },
        description: { type: "string" },
      },
      required: ["entity_type", "entity_id", "type", "description"],
    },
  },
  {
    name: "get_dashboard_summary",
    description: "Get the live cross-pipeline dashboard summary: total leads, pipeline values, follow-ups due, tasks due, temperature breakdown.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_pipeline_metrics",
    description: "Get won/lost/open counts and stage breakdown for one pipeline (or all pipelines if omitted).",
    inputSchema: {
      type: "object",
      properties: {
        pipeline: { type: "string", enum: ["sponsor", "investor", "strategic_partnership", "user_acquisition", "facility", "captain"] },
      },
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_leads": {
      let q = db
        .from("leads")
        .select("id,full_name,company_name,pipeline,stage,status,temperature,priority,expected_value,currency,next_follow_up_at,created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(args.limit) || 25, 100));
      if (args.pipeline) q = q.eq("pipeline", args.pipeline as string);
      if (args.status) q = q.eq("status", args.status as string);
      if (args.stage) q = q.eq("stage", args.stage as string);
      if (args.temperature) q = q.eq("temperature", args.temperature as string);
      if (args.search) {
        const s = args.search as string;
        q = q.or(`full_name.ilike.%${s}%,company_name.ilike.%${s}%,email.ilike.%${s}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }

    case "get_lead": {
      const { data, error } = await db.from("leads").select("*").eq("id", args.id as string).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`No lead found with id ${args.id}`);
      return data;
    }

    case "create_lead": {
      const connector = await getConnectorUserId();
      let stage = args.stage as string | undefined;
      if (!stage) {
        const { data: firstStage } = await db
          .from("pipeline_stages")
          .select("key")
          .eq("pipeline_key", args.pipeline as string)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        stage = firstStage?.key;
        if (!stage) throw new Error(`No stages configured for pipeline "${args.pipeline}"`);
      }
      const { data, error } = await db
        .from("leads")
        .insert({
          pipeline: args.pipeline,
          full_name: args.full_name,
          company_name: args.company_name ?? null,
          email: args.email ?? null,
          phone: args.phone ?? null,
          stage,
          expected_value: args.expected_value ?? null,
          currency: (args.currency as string) ?? "NGN",
          priority: (args.priority as string) ?? "medium",
          temperature: (args.temperature as string) ?? "warm",
          notes: args.notes ?? null,
          source: "other",
          created_by: connector,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    case "update_lead_stage": {
      const update: Record<string, unknown> = { stage: args.stage };
      if (args.lost_reason) update.lost_reason = args.lost_reason;
      const { data, error } = await db.from("leads").update(update).eq("id", args.id as string).select().single();
      if (error) throw error;
      return data;
    }

    case "list_facilities": {
      let q = db
        .from("facilities")
        .select("id,name,city,stage,status,expected_value,currency,next_follow_up_at,created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(args.limit) || 25, 100));
      if (args.status) q = q.eq("status", args.status as string);
      if (args.search) {
        const s = args.search as string;
        q = q.or(`name.ilike.%${s}%,city.ilike.%${s}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }

    case "list_captains": {
      let q = db
        .from("captains")
        .select("id,full_name,community,location_city,stage,active,player_count,created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(args.limit) || 25, 100));
      if (args.stage) q = q.eq("stage", args.stage as string);
      if (args.search) {
        const s = args.search as string;
        q = q.or(`full_name.ilike.%${s}%,community.ilike.%${s}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }

    case "list_tasks": {
      let q = db
        .from("tasks")
        .select("id,title,status,priority,due_at,lead_id,facility_id,captain_id,created_at")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(Math.min(Number(args.limit) || 25, 100));
      if (args.status) q = q.eq("status", args.status as string);
      if (args.due_before) q = q.lte("due_at", args.due_before as string);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }

    case "create_task": {
      const connector = await getConnectorUserId();
      const { data, error } = await db
        .from("tasks")
        .insert({
          title: args.title,
          description: args.description ?? null,
          due_at: args.due_at ?? null,
          priority: (args.priority as string) ?? "medium",
          lead_id: args.lead_id ?? null,
          facility_id: args.facility_id ?? null,
          captain_id: args.captain_id ?? null,
          created_by: connector,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    case "log_activity": {
      const connector = await getConnectorUserId();
      const entityCol = `${args.entity_type}_id`;
      const { data, error } = await db
        .from("activities")
        .insert({
          [entityCol]: args.entity_id,
          type: args.type,
          description: args.description,
          created_by: connector,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    case "get_dashboard_summary": {
      const { data, error } = await db.rpc("get_dashboard_summary");
      if (error) throw error;
      return data;
    }

    case "get_pipeline_metrics": {
      const { data, error } = await db.rpc("get_pipeline_metrics", { p_pipeline: args.pipeline ?? null });
      if (error) throw error;
      return data;
    }

    default:
      throw new Error(`Unknown tool "${name}"`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC / MCP request handling
// ---------------------------------------------------------------------------
function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token !== MCP_AUTH_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { id, method, params } = body;

  // Notifications (no id) never get a body response.
  if (id === undefined && method?.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: CORS });
  }

  try {
    if (method === "initialize") {
      return new Response(
        JSON.stringify(
          rpcResult(id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "sportconn-crm", version: "1.0.0" },
          }),
        ),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    if (method === "ping") {
      return new Response(JSON.stringify(rpcResult(id, {})), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (method === "tools/list") {
      return new Response(JSON.stringify(rpcResult(id, { tools: TOOLS })), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (method === "tools/call") {
      const toolName = String(params?.name ?? "");
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      try {
        const result = await callTool(toolName, args);
        return new Response(
          JSON.stringify(
            rpcResult(id, {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
              isError: false,
            }),
          ),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      } catch (e) {
        return new Response(
          JSON.stringify(
            rpcResult(id, {
              content: [{ type: "text", text: e instanceof Error ? e.message : "Tool error" }],
              isError: true,
            }),
          ),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(JSON.stringify(rpcError(id, -32601, `Method not found: ${method}`)), {
      status: 404,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify(rpcError(id, -32603, e instanceof Error ? e.message : "Internal error")), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
