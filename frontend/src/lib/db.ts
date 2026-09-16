import { supabase } from "./supabase";
import type {
  Activity,
  AppNotification,
  AppUser,
  AuditEntry,
  Campaign,
  Captain,
  CaptainDetail,
  DashboardSummary,
  Facility,
  FacilityDetail,
  Lead,
  LeadDetail,
  Outreach,
  PipelineDef,
  PipelineKey,
  PipelineMetrics,
  PipelineStageDef,
  RolePermissions,
  Task,
  UserRole,
} from "@/types";

/** Run a Supabase query, throw a clean Error on failure, return the data. */
async function run<T>(
  builder: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------------
// Select shapes (PostgREST embeds).
// ---------------------------------------------------------------------------
const LEAD_SELECT = "*, assignee:assigned_to(id,full_name), campaigns:campaign_id(id,name)";
const FACILITY_SELECT = "*, assignee:assigned_to(id,full_name)";
const CAPTAIN_SELECT = "*, assignee:assigned_to(id,full_name)";
const TASK_SELECT =
  "*, assignee:assigned_to(id,full_name), leads:lead_id(id,full_name,company_name), facilities:facility_id(id,name), captains:captain_id(id,full_name)";
const OUTREACH_SELECT =
  "*, leads:lead_id(id,full_name,company_name), facilities:facility_id(id,name), captains:captain_id(id,full_name), campaigns:campaign_id(id,name), author:created_by(id,full_name)";
const ACTIVITY_SELECT =
  "*, author:created_by(id,full_name), leads:lead_id(id,full_name,company_name), facilities:facility_id(id,name), captains:captain_id(id,full_name)";

// ===========================================================================
// PIPELINES / STAGES (configurable — Settings)
// ===========================================================================
export function listPipelines(): Promise<PipelineDef[]> {
  return run<PipelineDef[]>(
    supabase.from("pipelines").select("*").order("sort_order"),
  ).then((r) => r ?? []);
}

export function listPipelineStages(pipeline?: PipelineKey): Promise<PipelineStageDef[]> {
  let q = supabase.from("pipeline_stages").select("*");
  if (pipeline) q = q.eq("pipeline_key", pipeline);
  return run<PipelineStageDef[]>(q.order("sort_order")).then((r) => r ?? []);
}

export function createPipelineStage(body: Partial<PipelineStageDef>): Promise<PipelineStageDef> {
  return run<PipelineStageDef[]>(
    supabase.from("pipeline_stages").insert(body).select("*"),
  ).then((r) => r[0]);
}

export function updatePipelineStage(id: string, body: Partial<PipelineStageDef>): Promise<PipelineStageDef> {
  return run<PipelineStageDef[]>(
    supabase.from("pipeline_stages").update(body).eq("id", id).select("*"),
  ).then((r) => r[0]);
}

export async function deletePipelineStage(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// LEADS (Sponsor / Investor / Strategic Partnership / User Acquisition)
// ===========================================================================
export interface LeadFilters {
  q?: string;
  pipeline?: string;
  lead_type?: string;
  stage?: string;
  temperature?: string;
  priority?: string;
  source?: string;
  status?: string;
  assigned_to?: string;
}

export function listLeads(f: LeadFilters = {}): Promise<Lead[]> {
  let q = supabase.from("leads").select(LEAD_SELECT);
  if (f.q)
    q = q.or(
      `full_name.ilike.%${f.q}%,company_name.ilike.%${f.q}%,email.ilike.%${f.q}%,location_city.ilike.%${f.q}%`,
    );
  if (f.pipeline) q = q.eq("pipeline", f.pipeline);
  if (f.lead_type) q = q.eq("lead_type", f.lead_type);
  if (f.stage) q = q.eq("stage", f.stage);
  if (f.temperature) q = q.eq("temperature", f.temperature);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.source) q = q.eq("source", f.source);
  if (f.status) q = q.eq("status", f.status);
  if (f.assigned_to) q = q.eq("assigned_to", f.assigned_to);
  return run<Lead[]>(q.order("last_activity_at", { ascending: false })).then((r) => r ?? []);
}

export function getLead(id: string): Promise<Lead> {
  return run<Lead>(supabase.from("leads").select(LEAD_SELECT).eq("id", id).single());
}

export async function getLeadDetail(id: string): Promise<LeadDetail> {
  const [lead, outreach, tasks, activities] = await Promise.all([
    getLead(id),
    run<Outreach[]>(
      supabase.from("outreach").select(OUTREACH_SELECT).eq("lead_id", id).order("occurred_at", { ascending: false }),
    ),
    run<Task[]>(
      supabase.from("tasks").select(TASK_SELECT).eq("lead_id", id).order("due_at", { ascending: true }),
    ),
    run<Activity[]>(
      supabase
        .from("activities")
        .select(ACTIVITY_SELECT)
        .eq("lead_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
  ]);
  return { ...lead, outreach: outreach ?? [], tasks: tasks ?? [], activities: activities ?? [] };
}

export function createLead(body: Partial<Lead>): Promise<Lead> {
  return run<Lead[]>(supabase.from("leads").insert(body).select(LEAD_SELECT)).then((r) => r[0]);
}

export function updateLead(id: string, body: Partial<Lead>): Promise<Lead> {
  return run<Lead[]>(supabase.from("leads").update(body).eq("id", id).select(LEAD_SELECT)).then((r) => r[0]);
}

export function updateLeadStage(id: string, stage: string): Promise<Lead> {
  return updateLead(id, { stage });
}

export async function deleteLead(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

/** Bulk insert leads (CSV import). Chunked; returns count inserted. */
export async function createLeadsBulk(rows: Partial<Lead>[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { data, error } = await supabase.from("leads").insert(chunk).select("id");
    if (error) throw new Error(error.message);
    inserted += data?.length ?? 0;
  }
  return inserted;
}

// ===========================================================================
// FACILITIES (§10)
// ===========================================================================
export interface FacilityFilters {
  q?: string;
  stage?: string;
  status?: string;
  assigned_to?: string;
}

export function listFacilities(f: FacilityFilters = {}): Promise<Facility[]> {
  let q = supabase.from("facilities").select(FACILITY_SELECT);
  if (f.q) q = q.or(`name.ilike.%${f.q}%,city.ilike.%${f.q}%,area.ilike.%${f.q}%`);
  if (f.stage) q = q.eq("stage", f.stage);
  if (f.status) q = q.eq("status", f.status);
  if (f.assigned_to) q = q.eq("assigned_to", f.assigned_to);
  return run<Facility[]>(q.order("name")).then((r) => r ?? []);
}

export function getFacility(id: string): Promise<Facility> {
  return run<Facility>(supabase.from("facilities").select(FACILITY_SELECT).eq("id", id).single());
}

export async function getFacilityDetail(id: string): Promise<FacilityDetail> {
  const [facility, outreach, tasks, activities] = await Promise.all([
    getFacility(id),
    run<Outreach[]>(
      supabase.from("outreach").select(OUTREACH_SELECT).eq("facility_id", id).order("occurred_at", { ascending: false }),
    ),
    run<Task[]>(
      supabase.from("tasks").select(TASK_SELECT).eq("facility_id", id).order("due_at", { ascending: true }),
    ),
    run<Activity[]>(
      supabase
        .from("activities")
        .select(ACTIVITY_SELECT)
        .eq("facility_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
  ]);
  return { ...facility, outreach: outreach ?? [], tasks: tasks ?? [], activities: activities ?? [] };
}

export function createFacility(body: Partial<Facility>): Promise<Facility> {
  return run<Facility[]>(supabase.from("facilities").insert(body).select(FACILITY_SELECT)).then((r) => r[0]);
}

export function updateFacility(id: string, body: Partial<Facility>): Promise<Facility> {
  return run<Facility[]>(
    supabase.from("facilities").update(body).eq("id", id).select(FACILITY_SELECT),
  ).then((r) => r[0]);
}

export async function deleteFacility(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("facilities").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// CAPTAINS & COMMUNITIES (§12)
// ===========================================================================
export interface CaptainFilters {
  q?: string;
  stage?: string;
  active?: boolean;
  assigned_to?: string;
}

export function listCaptains(f: CaptainFilters = {}): Promise<Captain[]> {
  let q = supabase.from("captains").select(CAPTAIN_SELECT);
  if (f.q) q = q.or(`full_name.ilike.%${f.q}%,community.ilike.%${f.q}%,area.ilike.%${f.q}%`);
  if (f.stage) q = q.eq("stage", f.stage);
  if (f.active !== undefined) q = q.eq("active", f.active);
  if (f.assigned_to) q = q.eq("assigned_to", f.assigned_to);
  return run<Captain[]>(q.order("full_name")).then((r) => r ?? []);
}

export function getCaptain(id: string): Promise<Captain> {
  return run<Captain>(supabase.from("captains").select(CAPTAIN_SELECT).eq("id", id).single());
}

export async function getCaptainDetail(id: string): Promise<CaptainDetail> {
  const [captain, outreach, tasks, activities] = await Promise.all([
    getCaptain(id),
    run<Outreach[]>(
      supabase.from("outreach").select(OUTREACH_SELECT).eq("captain_id", id).order("occurred_at", { ascending: false }),
    ),
    run<Task[]>(
      supabase.from("tasks").select(TASK_SELECT).eq("captain_id", id).order("due_at", { ascending: true }),
    ),
    run<Activity[]>(
      supabase
        .from("activities")
        .select(ACTIVITY_SELECT)
        .eq("captain_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
  ]);
  return { ...captain, outreach: outreach ?? [], tasks: tasks ?? [], activities: activities ?? [] };
}

export function createCaptain(body: Partial<Captain>): Promise<Captain> {
  return run<Captain[]>(supabase.from("captains").insert(body).select(CAPTAIN_SELECT)).then((r) => r[0]);
}

export function updateCaptain(id: string, body: Partial<Captain>): Promise<Captain> {
  return run<Captain[]>(
    supabase.from("captains").update(body).eq("id", id).select(CAPTAIN_SELECT),
  ).then((r) => r[0]);
}

export async function deleteCaptain(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("captains").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// ACTIVITIES
// ===========================================================================
export function listActivities(limit = 60): Promise<Activity[]> {
  return run<Activity[]>(
    supabase.from("activities").select(ACTIVITY_SELECT).order("created_at", { ascending: false }).limit(limit),
  ).then((r) => r ?? []);
}

export async function createActivity(body: Partial<Activity>): Promise<Activity> {
  const { data: userData } = await supabase.auth.getUser();
  const payload = { ...body, created_by: body.created_by ?? userData.user?.id ?? null };
  return run<Activity[]>(supabase.from("activities").insert(payload).select(ACTIVITY_SELECT)).then((r) => r[0]);
}

// ===========================================================================
// NOTIFICATIONS
// ===========================================================================
export function listNotifications(): Promise<AppNotification[]> {
  return run<AppNotification[]>(
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
  ).then((r) => r ?? []);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function createNotification(body: Partial<AppNotification>): Promise<void> {
  const { error } = await supabase.from("notifications").insert(body);
  if (error) throw new Error(error.message);
}

// ===========================================================================
// USERS (staff)
// ===========================================================================
export function listUsers(): Promise<AppUser[]> {
  return run<AppUser[]>(
    supabase
      .from("users")
      .select("id,email,full_name,role,department,title,phone,avatar_url,is_active,created_at")
      .order("created_at"),
  ).then((r) => r ?? []);
}

export async function updateUser(id: string, body: Partial<AppUser>): Promise<void> {
  const { error } = await supabase.from("users").update(body).eq("id", id);
  if (error) throw new Error(error.message);
}

// ===========================================================================
// GOVERNANCE — role permissions, audit log, privileged user management
// ===========================================================================
export function listRolePermissions(): Promise<RolePermissions[]> {
  return run<RolePermissions[]>(
    supabase.from("role_permissions").select("*").order("role"),
  ).then((r) => r ?? []);
}

export async function updateRolePermissions(
  role: UserRole,
  patch: Partial<RolePermissions>,
): Promise<void> {
  const { error } = await supabase.from("role_permissions").update(patch).eq("role", role);
  if (error) throw new Error(error.message);
}

export function listAuditLog(limit = 50): Promise<AuditEntry[]> {
  return run<AuditEntry[]>(
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit),
  ).then((r) => r ?? []);
}

export type ManageUsersAction =
  | { action: "create"; email: string; password: string; full_name?: string; role: UserRole }
  | { action: "set_role"; user_id: string; role: UserRole }
  | { action: "set_active"; user_id: string; active: boolean }
  | { action: "delete"; user_id: string };

/** Calls the `manage-users` Edge Function (service-role, super_admin-only). */
export async function manageUsers(payload: ManageUsersAction): Promise<void> {
  const { data, error } = await supabase.functions.invoke("manage-users", { body: payload });
  if (error) {
    let msg = error.message || "Request failed";
    const ctx = (error as { context?: unknown }).context as Response | undefined;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      } catch {
        /* keep msg */
      }
    }
    if (/failed to (fetch|send)|not ?found|networkerror/i.test(msg)) {
      throw new Error(
        "The manage-users Edge Function isn't deployed. See README → User management.",
      );
    }
    throw new Error(msg);
  }
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
}

// ===========================================================================
// TASKS
// ===========================================================================
export function listTasks(includeDone = true): Promise<Task[]> {
  let q = supabase.from("tasks").select(TASK_SELECT);
  if (!includeDone) q = q.not("status", "in", "(completed,cancelled)");
  return run<Task[]>(q.order("due_at", { ascending: true, nullsFirst: false })).then((r) => r ?? []);
}

export function createTask(body: Partial<Task>): Promise<Task> {
  return run<Task[]>(supabase.from("tasks").insert(body).select(TASK_SELECT)).then((r) => r[0]);
}

export function updateTask(id: string, body: Partial<Task>): Promise<Task> {
  return run<Task[]>(supabase.from("tasks").update(body).eq("id", id).select(TASK_SELECT)).then((r) => r[0]);
}

export async function deleteTask(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// OUTREACH / ACTIVITIES (interaction log — §19)
// ===========================================================================
export function listOutreach(limit = 100): Promise<Outreach[]> {
  return run<Outreach[]>(
    supabase.from("outreach").select(OUTREACH_SELECT).order("occurred_at", { ascending: false }).limit(limit),
  ).then((r) => r ?? []);
}

export async function createOutreach(body: Partial<Outreach>): Promise<Outreach> {
  const { data: userData } = await supabase.auth.getUser();
  const payload = { ...body, created_by: body.created_by ?? userData.user?.id ?? null };
  return run<Outreach[]>(supabase.from("outreach").insert(payload).select(OUTREACH_SELECT)).then((r) => r[0]);
}

// ===========================================================================
// CAMPAIGNS (§24)
// ===========================================================================
export function listCampaigns(): Promise<Campaign[]> {
  return run<Campaign[]>(
    supabase.from("campaigns").select("*, owner_user:owner(id,full_name)").order("created_at", { ascending: false }),
  ).then((r) => r ?? []);
}

export function createCampaign(body: Partial<Campaign>): Promise<Campaign> {
  return run<Campaign[]>(supabase.from("campaigns").insert(body).select("*")).then((r) => r[0]);
}

export function updateCampaign(id: string, body: Partial<Campaign>): Promise<Campaign> {
  return run<Campaign[]>(supabase.from("campaigns").update(body).eq("id", id).select("*")).then((r) => r[0]);
}

export async function deleteCampaign(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// DASHBOARD / PIPELINE METRICS / REPORTING
// ===========================================================================
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc("get_dashboard_summary");
  if (error) throw new Error(error.message);
  return data as DashboardSummary;
}

export async function getPipelineMetrics(pipeline?: string): Promise<PipelineMetrics> {
  const { data, error } = await supabase.rpc("get_pipeline_metrics", { p_pipeline: pipeline ?? null });
  if (error) throw new Error(error.message);
  return data as PipelineMetrics;
}

// ===========================================================================
// HEALTH
// ===========================================================================
export async function pingDb(): Promise<boolean> {
  const { error } = await supabase.from("pipelines").select("key", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return true;
}
