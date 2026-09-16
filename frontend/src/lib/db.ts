import { supabase } from "./supabase";
import type {
  Activity,
  AnalyticsSummary,
  AppNotification,
  AppUser,
  AuditEntry,
  Campaign,
  Case,
  CaseStage,
  DashboardSummary,
  ExperienceAssessment,
  Lead,
  LeadDetail,
  Outreach,
  Property,
  PropertyDetail,
  Resident,
  ResidentDetail,
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
const CASE_SELECT =
  "*, residents:resident_id(id,full_name,unit_number), properties:property_id(id,name), assignee:assigned_to(id,full_name)";
const RESIDENT_SELECT =
  "*, properties:property_id(id,name), case_manager:assigned_case_manager(id,full_name)";
const ACTIVITY_SELECT =
  "*, author:created_by(id,full_name), residents:resident_id(id,full_name), cases:case_id(id,title)";

// ===========================================================================
// CASES
// ===========================================================================
export function listCases(): Promise<Case[]> {
  return run<Case[]>(
    supabase.from("cases").select(CASE_SELECT).order("stage_entered_at", { ascending: false }),
  ).then((r) => r ?? []);
}

export function getCase(id: string): Promise<Case> {
  return run<Case>(supabase.from("cases").select(CASE_SELECT).eq("id", id).single());
}

export function createCase(body: Partial<Case>): Promise<Case> {
  return run<Case[]>(supabase.from("cases").insert(body).select(CASE_SELECT)).then((r) => r[0]);
}

export function updateCase(id: string, body: Partial<Case>): Promise<Case> {
  return run<Case[]>(
    supabase.from("cases").update(body).eq("id", id).select(CASE_SELECT),
  ).then((r) => r[0]);
}

export function updateCaseStage(id: string, stage: CaseStage): Promise<Case> {
  return updateCase(id, { stage });
}

export async function deleteCase(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("cases").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// RESIDENTS
// ===========================================================================
export interface ResidentFilters {
  q?: string;
  status?: string;
  property_id?: string;
  case_manager?: string;
}

export function listResidents(f: ResidentFilters = {}): Promise<Resident[]> {
  // Filters (.or/.eq) must be applied before transforms (.order).
  let q = supabase.from("residents").select(RESIDENT_SELECT);
  if (f.q) q = q.or(`full_name.ilike.%${f.q}%,email.ilike.%${f.q}%,unit_number.ilike.%${f.q}%`);
  if (f.status) q = q.eq("status", f.status);
  if (f.property_id) q = q.eq("property_id", f.property_id);
  if (f.case_manager) q = q.eq("assigned_case_manager", f.case_manager);
  return run<Resident[]>(q.order("full_name")).then((r) => r ?? []);
}

export function getResident(id: string): Promise<Resident> {
  return run<Resident>(supabase.from("residents").select(RESIDENT_SELECT).eq("id", id).single());
}

export async function getResidentDetail(id: string): Promise<ResidentDetail> {
  const [resident, cases, activities] = await Promise.all([
    getResident(id),
    run<Case[]>(
      supabase.from("cases").select(CASE_SELECT).eq("resident_id", id).order("opened_at", {
        ascending: false,
      }),
    ),
    run<Activity[]>(
      supabase
        .from("activities")
        .select(ACTIVITY_SELECT)
        .eq("resident_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
  ]);
  return { ...resident, cases: cases ?? [], activities: activities ?? [] };
}

export function createResident(body: Partial<Resident>): Promise<Resident> {
  return run<Resident[]>(
    supabase.from("residents").insert(body).select(RESIDENT_SELECT),
  ).then((r) => r[0]);
}

export function updateResident(id: string, body: Partial<Resident>): Promise<Resident> {
  return run<Resident[]>(
    supabase.from("residents").update(body).eq("id", id).select(RESIDENT_SELECT),
  ).then((r) => r[0]);
}

export async function deleteResident(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("residents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// PROPERTIES
// ===========================================================================
export function listProperties(q?: string): Promise<Property[]> {
  let query = supabase.from("properties").select("*");
  if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,address_line1.ilike.%${q}%`);
  return run<Property[]>(query.order("name")).then((r) => r ?? []);
}

export function getProperty(id: string): Promise<Property> {
  return run<Property>(supabase.from("properties").select("*").eq("id", id).single());
}

export async function getPropertyDetail(id: string): Promise<PropertyDetail> {
  const [property, residents, cases] = await Promise.all([
    getProperty(id),
    run<Resident[]>(
      supabase.from("residents").select(RESIDENT_SELECT).eq("property_id", id).order("full_name"),
    ),
    run<Case[]>(
      supabase
        .from("cases")
        .select(CASE_SELECT)
        .eq("property_id", id)
        .order("opened_at", { ascending: false }),
    ),
  ]);
  return { ...property, residents: residents ?? [], cases: cases ?? [] };
}

export function createProperty(body: Partial<Property>): Promise<Property> {
  return run<Property[]>(supabase.from("properties").insert(body).select("*")).then((r) => r[0]);
}

export function updateProperty(id: string, body: Partial<Property>): Promise<Property> {
  return run<Property[]>(
    supabase.from("properties").update(body).eq("id", id).select("*"),
  ).then((r) => r[0]);
}

export async function deleteProperty(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("properties").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// ACTIVITIES
// ===========================================================================
export function listActivities(limit = 60): Promise<Activity[]> {
  return run<Activity[]>(
    supabase
      .from("activities")
      .select(ACTIVITY_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit),
  ).then((r) => r ?? []);
}

export async function createActivity(body: Partial<Activity>): Promise<Activity> {
  const { data: userData } = await supabase.auth.getUser();
  const payload = { ...body, created_by: body.created_by ?? userData.user?.id ?? null };
  return run<Activity[]>(
    supabase.from("activities").insert(payload).select(ACTIVITY_SELECT),
  ).then((r) => r[0]);
}

// ===========================================================================
// NOTIFICATIONS
// ===========================================================================
export function listNotifications(): Promise<AppNotification[]> {
  return run<AppNotification[]>(
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
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
      .select("id,email,full_name,role,title,phone,avatar_url,is_active,created_at")
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
    // FunctionsHttpError carries the raw Response in .context — the function
    // replies with a JSON { error } body on every non-2xx.
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
// ANALYTICS
// ===========================================================================
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const { data, error } = await supabase.rpc("get_analytics_summary");
  if (error) throw new Error(error.message);
  return data as AnalyticsSummary;
}

// ===========================================================================
// LEADS
// ===========================================================================
const LEAD_SELECT =
  "*, assignee:assigned_to(id,full_name), properties:property_id(id,name)";

export interface LeadFilters {
  q?: string;
  stage?: string;
  temperature?: string;
  source?: string;
  assigned_to?: string;
}

export function listLeads(f: LeadFilters = {}): Promise<Lead[]> {
  let q = supabase.from("leads").select(LEAD_SELECT);
  if (f.q)
    q = q.or(
      `full_name.ilike.%${f.q}%,company_name.ilike.%${f.q}%,property_name.ilike.%${f.q}%,email.ilike.%${f.q}%`,
    );
  if (f.stage) q = q.eq("stage", f.stage);
  if (f.temperature) q = q.eq("temperature", f.temperature);
  if (f.source) q = q.eq("source", f.source);
  if (f.assigned_to) q = q.eq("assigned_to", f.assigned_to);
  return run<Lead[]>(q.order("last_activity_at", { ascending: false })).then((r) => r ?? []);
}

export function getLead(id: string): Promise<Lead> {
  return run<Lead>(supabase.from("leads").select(LEAD_SELECT).eq("id", id).single());
}

export async function getLeadDetail(id: string): Promise<LeadDetail> {
  const [lead, outreach, tasks, activities, assessments] = await Promise.all([
    getLead(id),
    run<Outreach[]>(
      supabase
        .from("outreach")
        .select("*, campaigns:campaign_id(id,name), author:created_by(id,full_name)")
        .eq("lead_id", id)
        .order("occurred_at", { ascending: false }),
    ),
    run<Task[]>(
      supabase
        .from("tasks")
        .select("*, assignee:assigned_to(id,full_name)")
        .eq("lead_id", id)
        .order("due_at", { ascending: true }),
    ),
    run<Activity[]>(
      supabase
        .from("activities")
        .select("*, author:created_by(id,full_name)")
        .eq("lead_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
    run<ExperienceAssessment[]>(
      supabase
        .from("experience_assessments")
        .select("*")
        .eq("lead_id", id)
        .order("submitted_at", { ascending: false })
        .limit(1),
    ),
  ]);
  return {
    ...lead,
    outreach: outreach ?? [],
    tasks: tasks ?? [],
    activities: activities ?? [],
    assessment: assessments?.[0] ?? null,
  };
}

export function createLead(body: Partial<Lead>): Promise<Lead> {
  return run<Lead[]>(supabase.from("leads").insert(body).select(LEAD_SELECT)).then((r) => r[0]);
}

export function updateLead(id: string, body: Partial<Lead>): Promise<Lead> {
  return run<Lead[]>(
    supabase.from("leads").update(body).eq("id", id).select(LEAD_SELECT),
  ).then((r) => r[0]);
}

export function updateLeadStage(id: string, stage: Lead["stage"]): Promise<Lead> {
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
// TASKS
// ===========================================================================
const TASK_SELECT =
  "*, assignee:assigned_to(id,full_name), leads:lead_id(id,full_name,company_name), residents:resident_id(id,full_name), cases:case_id(id,title)";

export function listTasks(includeDone = true): Promise<Task[]> {
  let q = supabase.from("tasks").select(TASK_SELECT);
  if (!includeDone) q = q.eq("status", "open");
  return run<Task[]>(q.order("due_at", { ascending: true, nullsFirst: false })).then((r) => r ?? []);
}

export function createTask(body: Partial<Task>): Promise<Task> {
  return run<Task[]>(supabase.from("tasks").insert(body).select(TASK_SELECT)).then((r) => r[0]);
}

export function updateTask(id: string, body: Partial<Task>): Promise<Task> {
  return run<Task[]>(
    supabase.from("tasks").update(body).eq("id", id).select(TASK_SELECT),
  ).then((r) => r[0]);
}

export async function deleteTask(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// OUTREACH
// ===========================================================================
const OUTREACH_SELECT =
  "*, leads:lead_id(id,full_name,company_name), campaigns:campaign_id(id,name), author:created_by(id,full_name)";

export function listOutreach(limit = 100): Promise<Outreach[]> {
  return run<Outreach[]>(
    supabase
      .from("outreach")
      .select(OUTREACH_SELECT)
      .order("occurred_at", { ascending: false })
      .limit(limit),
  ).then((r) => r ?? []);
}

export async function createOutreach(body: Partial<Outreach>): Promise<Outreach> {
  const { data: userData } = await supabase.auth.getUser();
  const payload = { ...body, created_by: body.created_by ?? userData.user?.id ?? null };
  return run<Outreach[]>(
    supabase.from("outreach").insert(payload).select(OUTREACH_SELECT),
  ).then((r) => r[0]);
}

// ===========================================================================
// CAMPAIGNS
// ===========================================================================
export function listCampaigns(): Promise<Campaign[]> {
  return run<Campaign[]>(
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
  ).then((r) => r ?? []);
}

export function createCampaign(body: Partial<Campaign>): Promise<Campaign> {
  return run<Campaign[]>(supabase.from("campaigns").insert(body).select("*")).then((r) => r[0]);
}

export function updateCampaign(id: string, body: Partial<Campaign>): Promise<Campaign> {
  return run<Campaign[]>(
    supabase.from("campaigns").update(body).eq("id", id).select("*"),
  ).then((r) => r[0]);
}

export async function deleteCampaign(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

// ===========================================================================
// EXPERIENCE ASSESSMENTS
// ===========================================================================
const ASSESSMENT_SELECT =
  "*, leads:lead_id(id,full_name,company_name,property_name), properties:property_id(id,name)";

export function listAssessments(): Promise<ExperienceAssessment[]> {
  return run<ExperienceAssessment[]>(
    supabase
      .from("experience_assessments")
      .select(ASSESSMENT_SELECT)
      .order("submitted_at", { ascending: false }),
  ).then((r) => r ?? []);
}

export function getAssessment(id: string): Promise<ExperienceAssessment> {
  return run<ExperienceAssessment>(
    supabase.from("experience_assessments").select(ASSESSMENT_SELECT).eq("id", id).single(),
  );
}

export function createAssessment(body: Partial<ExperienceAssessment>): Promise<ExperienceAssessment> {
  return run<ExperienceAssessment[]>(
    supabase.from("experience_assessments").insert(body).select(ASSESSMENT_SELECT),
  ).then((r) => r[0]);
}

// ===========================================================================
// DASHBOARD
// ===========================================================================
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc("get_dashboard_summary");
  if (error) throw new Error(error.message);
  return data as DashboardSummary;
}

// ===========================================================================
// HEALTH
// ===========================================================================
export async function pingDb(): Promise<boolean> {
  const { error } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return true;
}
