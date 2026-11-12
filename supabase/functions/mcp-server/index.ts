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
// Address checks in record_contact_source: NEVERBOUNCE_API_KEY (shared with email-engine).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  businessDaysStart, EMAIL_RE, estimateSendTime, isGenericInbox, lagosMidnight, mapQueueError, type SendSettings,
  stripQuoted, toLagosIso, UUID_RE,
} from "./email.ts";
import { checkAddress } from "../_shared/neverbounce.ts";

// A refusal the caller should act on: returned as {"error": code, "message": …}.
class ToolError extends Error {
  constructor(public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_AUTH_TOKEN = Deno.env.get("MCP_AUTH_TOKEN")!;
const NEVERBOUNCE_API_KEY = (Deno.env.get("NEVERBOUNCE_API_KEY") ?? "").trim();

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

// Fields update_lead may change. Stage moves go through update_lead_stage;
// generated / bookkeeping columns (prospect_score, weighted_value, status,
// won_at, paid_at, …) are maintained by the database.
const LEAD_UPDATE_FIELDS = [
  "full_name", "title", "email", "phone", "whatsapp", "linkedin_url", "website", "company_name",
  "location_city", "location_state", "location_country", "industry", "sport_category", "interest",
  "priority", "temperature", "expected_value", "currency", "probability", "notes",
  "next_action", "next_follow_up_at", "next_follow_up_type",
  "sponsorship_category", "decision_maker", "budget_status", "proposal_status",
  "score_audience", "score_marketing", "score_partnership_evidence", "score_collaboration",
  "score_decision_access", "score_contact_quality", "company_domain",
  "fit_reason", "package_id", "expected_decision_date", "contract_status", "contract_value",
  "invoice_number", "payment_status", "payment_due_date", "amount_received", "vendor_registration",
  "renewal_status", "renewal_due_date", "campaign_start_date", "campaign_end_date",
  "last_researched_at", "engine_run_id",
];

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
    name: "list_stages",
    description: "List the configured stages (key, label, order, won/lost flags) for a pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        pipeline: { type: "string", enum: ["sponsor", "investor", "strategic_partnership", "user_acquisition", "facility", "captain"] },
      },
      required: ["pipeline"],
    },
  },
  {
    name: "update_lead",
    description:
      "Update fields on a lead (not its stage — use update_lead_stage). 100-point qualification score, factor maxima: score_audience 25, score_marketing 20, score_partnership_evidence 15, score_collaboration 15, score_decision_access 15, score_contact_quality 10 (≥65 qualifies, ≥80 priority). Sponsor deals: a deal can't be marked Won until contract_status='signed', payment_status='paid' and any price below the package list price has an approved pricing exception/discount.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        fields: {
          type: "object",
          description: `Any of: ${LEAD_UPDATE_FIELDS.join(", ")}. Dates as YYYY-MM-DD; next_follow_up_at as ISO datetime.`,
        },
      },
      required: ["id", "fields"],
    },
  },
  {
    name: "add_lead_contact",
    description: "Add another person at the lead's organisation (SOP: two relevant contacts per company).",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        full_name: { type: "string" },
        title: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        linkedin_url: { type: "string" },
        relevance: { type: "string", description: "Why this person matters for the deal." },
      },
      required: ["lead_id", "full_name"],
    },
  },
  {
    name: "list_sponsor_packages",
    description: "List the sponsorship packages with list price, delivery cost and minimum margin.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "request_approval",
    description:
      "Raise an approval request on a deal (pricing exception, discount, exclusivity, contract terms, unusual deliverable). Only management/admin users can decide it, in the app.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        approval_type: {
          type: "string",
          enum: ["pricing_exception", "discount", "exclusivity", "contract_terms", "unusual_deliverable", "other"],
        },
        summary: { type: "string" },
      },
      required: ["lead_id", "approval_type", "summary"],
    },
  },
  {
    name: "list_pending_approvals",
    description: "List approval requests waiting for a decision.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_deliverable",
    description: "Add a promised sponsor deliverable (placement, post, activity) to a deal.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        title: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["lead_id", "title"],
    },
  },
  {
    name: "update_deliverable",
    description: "Change a deliverable's status. Marking it 'delivered' requires proof (a link or short description).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["planned", "in_progress", "delivered", "cancelled"] },
        proof: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_sponsor_scorecard",
    description:
      "Live sponsorship scorecard vs. targets for a window (default: last 30 days): companies, contacts, first contacts, replies, meetings, proposals, paid deals.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
      },
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
  {
    name: "record_contact_source",
    description:
      "Record where an email address came from and its lawful basis, before queueing an email to it. The CRM then checks the address with NeverBounce itself and decides eligibility (the result is in the response): only 'eligible' addresses are sent automatically; others wait in Email review. Leave 'verification' out — the CRM's own check is used, and a caller-supplied result is ignored.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string" },
        lead_id: { type: "string" },
        source_type: {
          type: "string",
          enum: ["company_website", "linkedin", "data_provider", "referral", "event", "inbound", "existing_relationship", "other"],
        },
        source_url: { type: "string", description: "http(s) page where the address was published" },
        lawful_basis: { type: "string", enum: ["legitimate_interest", "consent", "existing_relationship", "none_recorded"] },
        basis_note: { type: "string" },
        verification: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["valid", "risky", "invalid", "unknown", "unverified"] },
            provider: { type: "string" },
            checked_at: { type: "string", description: "ISO datetime" },
          },
        },
      },
      required: ["email", "lead_id", "source_type"],
    },
  },
  {
    name: "queue_email",
    description:
      "Add one email for one lead to the CRM's Email review queue. The CRM sends it under its normal rules (sending days and hours, daily limit, per-company limit, do-not-email, eligibility) — it never bypasses the queue. sequence_step 1 = first email; 2 = follow-up, with reply_to_email_id = the sent step-1 email (it threads as a reply; follow-up spacing is set in Settings → Email sending, default 4 days). Returns status 'queued' (will send) or 'to_review' (waits for a person, with the reason in blocker), an estimated scheduled_for and position_in_queue. Refusals return an error code: do_not_email, recipient_mismatch, generic_inbox, duplicate, person_spacing, sequence_order, sequence_limit, replied, lead_closed, invalid_input.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        to_email: { type: "string", description: "Must be the lead's email or one of its contacts' emails" },
        to_name: { type: "string" },
        subject: { type: "string", description: "Max 150 characters" },
        body_text: { type: "string", description: "Plain text, max 5,000 characters. No unsubscribe line (the CRM adds one), no [placeholders]." },
        sequence_step: { type: "integer", enum: [1, 2] },
        reply_to_email_id: { type: "string", description: "Required for step 2: the sent step-1 email_id" },
        engine_run_id: { type: "string", description: "Optional engine run id (uuid) for reporting" },
        partnership_concept: { type: "string" },
      },
      required: ["lead_id", "to_email", "subject", "body_text", "sequence_step"],
    },
  },
  {
    name: "list_email_events",
    description:
      "What the Email review tabs show, as data: replies (reply_text without quoted history), bounces (bounce_type hard/soft — hard bounces are already on the do-not-contact list), problems, sent, queued, to_review, rejected and cancelled emails, newest first. Every call also returns a summary: sent_today, daily_limit, queued, to_review, sent_last_5_business_days, bounces_last_5_business_days. Replies are never answered automatically.",
    inputSchema: {
      type: "object",
      properties: {
        types: {
          type: "array",
          items: { type: "string", enum: ["reply", "bounce", "problem", "sent", "queued", "to_review", "rejected", "cancelled"] },
          description: "Default: all",
        },
        since: { type: "string", description: "ISO datetime; only events after this" },
        lead_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
        cursor: { type: "string", description: "next_cursor from the previous page" },
      },
    },
  },
  {
    name: "set_email_opt_out",
    description:
      "Mark a lead and/or an address Do not email (for example after an unsubscribe or opt-out request). The address goes on the do-not-contact list and any queued email to it is cancelled. Only management or admins can allow emailing again, in the CRM.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        email: { type: "string" },
        reason: { type: "string", enum: ["unsubscribed", "opt_out_request", "do_not_contact", "other"], default: "opt_out_request" },
        note: { type: "string" },
      },
    },
  },
  {
    name: "cancel_queued_email",
    description: "Cancel an email that hasn't been sent yet (status to_review or queued), for example when a reply arrives before a follow-up goes out.",
    inputSchema: {
      type: "object",
      properties: { email_id: { type: "string" }, reason: { type: "string" } },
      required: ["email_id"],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Email queue actions
// ---------------------------------------------------------------------------
const SPEC_STATUS: Record<string, string> = {
  draft: "to_review", approved: "queued", sending: "queued", sent: "sent", delivered: "sent",
  bounced: "bounced", complained: "complained", failed: "failed", rejected: "rejected", cancelled: "cancelled",
};

async function emailSettings(): Promise<SendSettings> {
  const { data, error } = await db.from("email_settings").select("*").limit(1).single();
  if (error) throw error;
  return data as SendSettings;
}
async function countMessages(filter: (q: any) => any): Promise<number> {
  const { count, error } = await filter(db.from("email_messages").select("id", { count: "exact", head: true }));
  if (error) throw error;
  return count ?? 0;
}

async function recordContactSource(a: Record<string, unknown>) {
  const actor = await getConnectorUserId();
  // With NeverBounce set up the CRM checks addresses itself and never trusts a
  // caller-supplied result; leaving "verification" out keeps any stored check.
  const input = { ...a };
  if (NEVERBOUNCE_API_KEY) delete input.verification;
  const { data, error } = await db.rpc("engine_set_eligibility", { p: input, p_actor: actor });
  if (error) throw error;
  if (!data?.ok) throw new ToolError(data?.error ?? "invalid_input", data?.message ?? "Couldn't record the source");

  // Check the address now, so a queue_email right after this can go out without review.
  const email = String(data.email ?? "");
  if (!NEVERBOUNCE_API_KEY || !email || isGenericInbox(email)) return data;
  const { data: row } = await db.from("contact_eligibility")
    .select("verification_status, verification_attempts, override").eq("email", email).maybeSingle();
  const due = row?.verification_status === "unverified" ||
    (row?.verification_status === "unknown" && Number(row?.verification_attempts ?? 0) < 3);
  if (!row || row.override || !due) return data;

  const check = await checkAddress(NEVERBOUNCE_API_KEY, email);
  const { data: rec, error: recErr } = await db.rpc("email_verify_record", {
    p_email: email,
    p_result: check.ok ? check.result : null,
    p_error: check.ok ? null : check.error,
  });
  if (recErr) throw recErr;
  return {
    ...data,
    eligibility: rec?.eligibility ?? data.eligibility,
    verification: check.ok
      ? { provider: "NeverBounce", result: check.result, status: rec?.verification_status }
      : { provider: "NeverBounce", checked: false, note: `${check.error}. The CRM will check it again automatically.` },
  };
}

async function queueEmail(a: Record<string, unknown>) {
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  const lead_id = str("lead_id"), to = str("to_email").toLowerCase(), subject = str("subject"), body = str("body_text");
  const step = Number(a.sequence_step);
  const parentId = str("reply_to_email_id"), runId = str("engine_run_id");

  if (a.send_after !== undefined) {
    throw new ToolError("invalid_input", "send_after isn't supported: emails go out in the next open sending window. Leave it out.");
  }
  if (!UUID_RE.test(lead_id)) throw new ToolError("invalid_input", "lead_id must be a lead's id");
  if (!EMAIL_RE.test(to)) throw new ToolError("invalid_input", "to_email must be an email address");
  if (!subject || subject.length > 150) throw new ToolError("invalid_input", "subject is required, at most 150 characters");
  if (!body || body.length > 5000) throw new ToolError("invalid_input", "body_text is required, at most 5,000 characters");
  if (runId && !UUID_RE.test(runId)) throw new ToolError("invalid_input", "engine_run_id must be an engine run id (uuid)");
  if (step === 1 && parentId) throw new ToolError("invalid_input", "A step-1 email has no reply_to_email_id");
  if (step !== 1 && step !== 2) {
    throw new ToolError(step > 2 ? "sequence_limit" : "invalid_input", "sequence_step is 1 (first email) or 2 (follow-up); there is no step 3");
  }
  if (step === 2 && !UUID_RE.test(parentId)) throw new ToolError("invalid_input", "A follow-up needs reply_to_email_id: the sent step-1 email");
  if (isGenericInbox(to)) {
    throw new ToolError("generic_inbox", "Generic inboxes (info@, hello@, admin@, contact@, support@) aren't emailed from the queue");
  }

  const { data: lead, error: le } = await db.from("leads").select("id,status").eq("id", lead_id).maybeSingle();
  if (le) throw le;
  if (!lead) throw new ToolError("invalid_input", "No lead with that id");
  if (["won", "lost", "nurture"].includes(lead.status)) throw new ToolError("lead_closed", `The lead is ${lead.status}; nothing is queued`);
  const { count: replies } = await db.from("email_replies").select("id", { count: "exact", head: true }).eq("lead_id", lead_id);
  if (replies) throw new ToolError("replied", "This lead has replied, so the engine doesn't queue more emails; a person takes it from here");

  if (step === 2) {
    const { data: parent } = await db.from("email_messages").select("id,lead_id,sequence_step").eq("id", parentId).maybeSingle();
    if (!parent || parent.lead_id !== lead_id) throw new ToolError("invalid_input", "reply_to_email_id isn't an email on this lead");
    if (parent.sequence_step !== 1) throw new ToolError("sequence_limit", "Only the first email gets a follow-up from the engine; there is no step 3");
  }

  const actor = await getConnectorUserId();
  const p: Record<string, unknown> = { lead_id, to, subject, body };
  if (parentId) p.follow_up_of = parentId;
  if (runId) p.run_id = runId;
  if (typeof a.partnership_concept === "string") p.partnership_concept = a.partnership_concept;
  const { data: r, error } = await db.rpc("engine_create_draft", { p, p_actor: actor });
  if (error) throw error;
  if (!r?.ok) {
    throw new ToolError(mapQueueError(r?.error ?? "invalid_input"), r?.message ?? "Not queued", { crm_error: r?.error, email_id: r?.email_id });
  }
  if (typeof a.to_name === "string" && a.to_name.trim()) {
    await db.from("email_messages").update({ to_name: a.to_name.trim() }).eq("id", r.email_id);
  }

  const out: Record<string, unknown> = {
    email_id: r.email_id,
    status: SPEC_STATUS[r.status] ?? r.status,
    sequence_step: r.sequence_step,
    blocker: r.blocker,
    eligibility: r.eligibility,
    scheduled_for: null,
    position_in_queue: null,
  };
  if (r.status === "approved") {
    const now = new Date();
    const { data: me } = await db.from("email_messages").select("approved_at").eq("id", r.email_id).single();
    const s = await emailSettings();
    const position = await countMessages((q) => q.eq("status", "approved").lte("approved_at", me!.approved_at));
    const sentToday = await countMessages((q) => q.gte("sent_at", lagosMidnight(now).toISOString()));
    out.position_in_queue = position;
    out.scheduled_for = estimateSendTime(now, s, sentToday, position);
    if (s.sending_paused) out.notice = "Sending is paused in Settings; it will go out when sending resumes.";
    else if (sentToday + position > s.daily_send_limit) {
      out.notice = "daily_limit: today's sending limit is full, so it is scheduled for a later sending day.";
    }
  } else {
    out.notice = "Waiting in Email review for a person: " + (r.blocker ?? "review is switched on in Settings");
  }
  return out;
}

async function listEmailEvents(a: Record<string, unknown>) {
  const all = ["reply", "bounce", "problem", "sent", "queued", "to_review", "rejected", "cancelled"];
  const types = Array.isArray(a.types) && a.types.length ? (a.types as string[]).filter((t) => all.includes(t)) : all;
  const limit = Math.min(Math.max(Number(a.limit) || 100, 1), 200);
  const offset = Math.max(Number(a.cursor) || 0, 0);
  const fetchN = offset + limit + 1;
  const since = typeof a.since === "string" && !Number.isNaN(Date.parse(a.since)) ? new Date(a.since).toISOString() : null;
  const leadId = typeof a.lead_id === "string" && UUID_RE.test(a.lead_id) ? a.lead_id : null;

  type Ev = Record<string, unknown> & { occurred_at: string };
  const events: Ev[] = [];
  const msgCols = "id,lead_id,to_email,subject,status,sequence_step,error,created_at,approved_at,sent_at,bounced_at,complained_at,reviewed_at,updated_at,leads:lead_id(company_name,full_name)";
  const company = (m: any) => m.leads?.company_name ?? m.leads?.full_name ?? null;
  const msgEvent = (m: any, type: string, at: string | null, extra: Record<string, unknown> = {}): Ev => ({
    email_id: m.id, lead_id: m.lead_id, company_name: company(m), to_email: m.to_email, type,
    occurred_at: toLagosIso(new Date(at ?? m.updated_at)), subject: m.subject, reply_text: null, bounce_type: null,
    sequence_step: m.sequence_step, status: m.status, error: m.error ?? null, ...extra,
  });
  const messages = async (statuses: string[], timeCol: string, extra?: (q: any) => any) => {
    let q = db.from("email_messages").select(msgCols).in("status", statuses).order(timeCol, { ascending: false, nullsFirst: false }).limit(fetchN);
    if (since) q = q.gte(timeCol, since);
    if (leadId) q = q.eq("lead_id", leadId);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  };

  if (types.includes("reply")) {
    let q = db.from("email_replies")
      .select("id,lead_id,from_email,subject,body_text,received_at,classification,handled,leads:lead_id(company_name,full_name),email:email_message_id(id,sequence_step)")
      .order("received_at", { ascending: false }).limit(fetchN);
    if (since) q = q.gte("received_at", since);
    if (leadId) q = q.eq("lead_id", leadId);
    const { data, error } = await q;
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      events.push({
        email_id: r.email?.id ?? null, reply_id: r.id, lead_id: r.lead_id, company_name: company(r), to_email: r.from_email,
        type: "reply", occurred_at: toLagosIso(new Date(r.received_at)), subject: r.subject,
        reply_text: stripQuoted(r.body_text), bounce_type: null, sequence_step: r.email?.sequence_step ?? null,
        classification: r.classification, handled: r.handled,
      });
    }
  }
  if (types.includes("bounce")) {
    for (const m of await messages(["bounced"], "bounced_at")) events.push(msgEvent(m, "bounce", m.bounced_at, { bounce_type: "hard" }));
    for (const m of await messages(["sent", "delivered"], "updated_at", (q) => q.ilike("error", "Temporary bounce%"))) {
      events.push(msgEvent(m, "bounce", m.updated_at, { bounce_type: "soft" }));
    }
  }
  if (types.includes("problem")) for (const m of await messages(["failed", "complained"], "updated_at")) events.push(msgEvent(m, "problem", m.complained_at ?? m.updated_at));
  if (types.includes("sent")) for (const m of await messages(["sent", "delivered"], "sent_at")) events.push(msgEvent(m, "sent", m.sent_at));
  if (types.includes("queued")) for (const m of await messages(["approved", "sending"], "approved_at")) events.push(msgEvent(m, "queued", m.approved_at));
  if (types.includes("to_review")) for (const m of await messages(["draft"], "created_at")) events.push(msgEvent(m, "to_review", m.created_at));
  if (types.includes("rejected")) for (const m of await messages(["rejected"], "updated_at")) events.push(msgEvent(m, "rejected", m.reviewed_at ?? m.updated_at));
  if (types.includes("cancelled")) for (const m of await messages(["cancelled"], "updated_at")) events.push(msgEvent(m, "cancelled", m.updated_at));

  events.sort((x, y) => Date.parse(y.occurred_at) - Date.parse(x.occurred_at));
  const page = events.slice(offset, offset + limit);

  const now = new Date();
  const s = await emailSettings();
  const fiveStart = businessDaysStart(now, 5, s.send_days).toISOString();
  const summary = {
    sent_today: await countMessages((q) => q.gte("sent_at", lagosMidnight(now).toISOString())),
    daily_limit: s.daily_send_limit,
    queued: await countMessages((q) => q.in("status", ["approved", "sending"])),
    to_review: await countMessages((q) => q.eq("status", "draft")),
    sent_last_5_business_days: await countMessages((q) => q.gte("sent_at", fiveStart)),
    bounces_last_5_business_days: await countMessages((q) => q.eq("status", "bounced").gte("bounced_at", fiveStart)),
    sending_paused: s.sending_paused,
  };
  return {
    summary,
    events: page,
    next_cursor: events.length > offset + limit ? String(offset + limit) : null,
  };
}

async function setEmailOptOut(a: Record<string, unknown>) {
  const leadId = typeof a.lead_id === "string" ? a.lead_id.trim() : "";
  const email = typeof a.email === "string" ? a.email.trim().toLowerCase() : "";
  if (a.clear === true || a.opt_out === false) {
    throw new ToolError("not_allowed", "Only management or admins can allow emailing again, in the CRM (Settings → Do-not-contact list).");
  }
  if (!leadId && !email) throw new ToolError("invalid_input", "Give lead_id, email, or both");
  if (leadId && !UUID_RE.test(leadId)) throw new ToolError("invalid_input", "lead_id must be a lead's id");
  if (email && !EMAIL_RE.test(email)) throw new ToolError("invalid_input", "email must be an email address");
  const reason = ["unsubscribed", "opt_out_request", "do_not_contact", "other"].includes(a.reason as string)
    ? (a.reason as string) : "opt_out_request";
  const actor = await getConnectorUserId();
  const done: Record<string, unknown> = {};

  if (leadId) {
    const { data, error } = await db.from("leads").update({ email_opt_out: true }).eq("id", leadId).select("id,email").maybeSingle();
    if (error) throw error;
    if (!data) throw new ToolError("invalid_input", "No lead with that id");
    done.lead_marked_do_not_email = true;
  }
  if (email) {
    const { data: existing } = await db.from("suppressions").select("id").eq("email", email).maybeSingle();
    if (!existing) {
      const { error } = await db.from("suppressions").insert({
        email, reason, source: "connector", lead_id: leadId || null,
        note: typeof a.note === "string" ? a.note.slice(0, 300) : null, created_by: actor,
      });
      if (error) throw error;
    }
    done.address_on_do_not_contact_list = email;
  }
  // nothing queued may go out to them now
  let q = db.from("email_messages").update({ status: "cancelled", error: "Cancelled: marked Do not email" }).in("status", ["draft", "approved"]);
  q = leadId && email ? q.or(`lead_id.eq.${leadId},to_email.eq.${email}`) : leadId ? q.eq("lead_id", leadId) : q.eq("to_email", email);
  const { data: cancelled, error: ce } = await q.select("id");
  if (ce) throw ce;
  done.cancelled_email_ids = (cancelled ?? []).map((m: any) => m.id);
  await db.from("audit_log").insert({ actor_id: actor, action: "connector.email.opt_out", detail: { lead_id: leadId || null, email: email || null, reason, ...done } });
  return { ok: true, ...done };
}

async function cancelQueuedEmail(a: Record<string, unknown>) {
  const id = typeof a.email_id === "string" ? a.email_id.trim() : "";
  if (!UUID_RE.test(id)) throw new ToolError("invalid_input", "email_id must be an email's id");
  const { data: m, error } = await db.from("email_messages").select("id,status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!m) throw new ToolError("invalid_input", "No email with that id");
  if (!["draft", "approved"].includes(m.status)) {
    throw new ToolError("not_cancellable", `It is already ${SPEC_STATUS[m.status] ?? m.status}; only emails waiting in review or the queue can be cancelled`);
  }
  const reason = typeof a.reason === "string" && a.reason.trim() ? a.reason.trim().slice(0, 300) : "Cancelled by the Claude connector";
  const { data: upd, error: ue } = await db.from("email_messages").update({ status: "cancelled", error: reason })
    .eq("id", id).in("status", ["draft", "approved"]).select("id").maybeSingle();
  if (ue) throw ue;
  if (!upd) throw new ToolError("not_cancellable", "It started sending a moment ago and can no longer be cancelled");
  const actor = await getConnectorUserId();
  await db.from("audit_log").insert({ actor_id: actor, action: "connector.email.cancel", detail: { email_id: id, reason } });
  return { ok: true, email_id: id, status: "cancelled" };
}

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
      const { data, error } = await db
        .from("leads")
        .select("*, contacts:lead_contacts(*), approvals:deal_approvals(*), deliverables:sponsor_deliverables(*)")
        .eq("id", args.id as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`No lead found with id ${args.id}`);
      return data;
    }

    case "list_stages": {
      const { data, error } = await db
        .from("pipeline_stages")
        .select("key,label,sort_order,is_won,is_lost")
        .eq("pipeline_key", args.pipeline as string)
        .order("sort_order");
      if (error) throw error;
      return data;
    }

    case "update_lead": {
      const fields = (args.fields ?? {}) as Record<string, unknown>;
      const unknown = Object.keys(fields).filter((k) => !LEAD_UPDATE_FIELDS.includes(k));
      if (unknown.length) throw new Error(`These fields can't be updated here: ${unknown.join(", ")}`);
      if (Object.keys(fields).length === 0) throw new Error("No fields to update");
      const { data, error } = await db.from("leads").update(fields).eq("id", args.id as string).select().single();
      if (error) throw error;
      return data;
    }

    case "add_lead_contact": {
      const connector = await getConnectorUserId();
      const { data, error } = await db
        .from("lead_contacts")
        .insert({
          lead_id: args.lead_id,
          full_name: args.full_name,
          title: args.title ?? null,
          email: args.email ?? null,
          phone: args.phone ?? null,
          linkedin_url: args.linkedin_url ?? null,
          relevance: args.relevance ?? null,
          created_by: connector,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    case "list_sponsor_packages": {
      const { data, error } = await db.from("sponsor_packages").select("*").order("sort_order");
      if (error) throw error;
      return data;
    }

    case "request_approval": {
      const connector = await getConnectorUserId();
      const { data, error } = await db
        .from("deal_approvals")
        .insert({
          lead_id: args.lead_id,
          approval_type: args.approval_type,
          summary: args.summary,
          requested_by: connector,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    case "list_pending_approvals": {
      const { data, error } = await db
        .from("deal_approvals")
        .select("*, leads:lead_id(id,full_name,company_name)")
        .eq("status", "pending")
        .order("requested_at");
      if (error) throw error;
      return data;
    }

    case "add_deliverable": {
      const connector = await getConnectorUserId();
      const { data, error } = await db
        .from("sponsor_deliverables")
        .insert({ lead_id: args.lead_id, title: args.title, due_date: args.due_date ?? null, created_by: connector })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    case "update_deliverable": {
      const update: Record<string, unknown> = {};
      for (const k of ["status", "proof", "due_date"]) if (args[k] !== undefined) update[k] = args[k];
      if (Object.keys(update).length === 0) throw new Error("Nothing to update");
      const { data, error } = await db.from("sponsor_deliverables").update(update).eq("id", args.id as string).select().single();
      if (error) throw error;
      return data;
    }

    case "get_sponsor_scorecard": {
      const { data, error } = await db.rpc("get_sponsor_scorecard", { p_from: args.from ?? null, p_to: args.to ?? null });
      if (error) throw error;
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

    case "record_contact_source":
      return await recordContactSource(args);
    case "queue_email":
      return await queueEmail(args);
    case "list_email_events":
      return await listEmailEvents(args);
    case "set_email_opt_out":
      return await setEmailOptOut(args);
    case "cancel_queued_email":
      return await cancelQueuedEmail(args);

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
              content: [{
                type: "text",
                text: e instanceof ToolError
                  ? JSON.stringify({ error: e.code, message: e.message, ...e.extra })
                  : e instanceof Error ? e.message : "Tool error",
              }],
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
