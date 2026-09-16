// Shared types — kept in sync with supabase/migrations/0001_init.sql by hand.

export type UserRole = "super_admin" | "admin" | "case_manager" | "read_only";

export type NavKey =
  | "dashboard"
  | "leads"
  | "pipeline"
  | "cases"
  | "residents"
  | "properties"
  | "experience"
  | "outreach"
  | "tasks"
  | "analytics"
  | "campaigns";

export interface RolePermissions {
  role: UserRole;
  can_manage_users: boolean;
  can_edit_permissions: boolean;
  can_manage_staff: boolean;
  can_write: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_import: boolean;
  nav: Partial<Record<NavKey, boolean>>;
  updated_at?: string;
  updated_by?: string | null;
}

export interface AuditEntry {
  id: string;
  actor_id?: string | null;
  actor_email?: string | null;
  action: string;
  target_user_id?: string | null;
  target_email?: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export type PropertyType =
  | "conventional"
  | "luxury"
  | "senior"
  | "affordable"
  | "mixed_use";

export type ResidentStatus = "active" | "pending" | "at_risk" | "former";

export type CaseStage =
  | "intake"
  | "in_progress"
  | "awaiting_resident"
  | "resolved"
  | "closed";

export type CasePriority = "low" | "medium" | "high" | "urgent";

export type CaseCategory =
  | "maintenance"
  | "billing"
  | "lease"
  | "complaint"
  | "community"
  | "wellness"
  | "other";

export type ActivityType =
  | "call"
  | "visit"
  | "note"
  | "stage_change"
  | "case_opened"
  | "case_closed"
  | "follow_up_set"
  | "resident_created"
  | "system"
  | "lead_created"
  | "lead_stage_change"
  | "outreach"
  | "task_done";

export type NotificationType =
  | "follow_up_due"
  | "follow_up_overdue"
  | "case_assigned"
  | "stage_change"
  | "lead_assigned"
  | "task_assigned"
  | "task_due";

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  title?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface Property {
  id: string;
  name: string;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  unit_count: number;
  property_type: PropertyType;
  manager_name?: string | null;
  manager_email?: string | null;
  manager_phone?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // computed via embeds / follow-up queries
  resident_count?: number;
  open_case_count?: number;
}

export interface Resident {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  property_id?: string | null;
  unit_number?: string | null;
  status: ResidentStatus;
  experience_score?: number | null;
  assigned_case_manager?: string | null;
  move_in_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  properties?: Pick<Property, "id" | "name"> | null;
  case_manager?: Pick<AppUser, "id" | "full_name"> | null;
  open_case_count?: number;
}

export interface Case {
  id: string;
  title: string;
  resident_id?: string | null;
  property_id?: string | null;
  category: CaseCategory;
  description?: string | null;
  stage: CaseStage;
  priority: CasePriority;
  assigned_to?: string | null;
  stage_entered_at: string;
  next_follow_up_at?: string | null;
  calendar_event_id?: string | null;
  opened_at: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  residents?: Pick<Resident, "id" | "full_name" | "unit_number"> | null;
  properties?: Pick<Property, "id" | "name"> | null;
  assignee?: Pick<AppUser, "id" | "full_name"> | null;
}

export interface Activity {
  id: string;
  resident_id?: string | null;
  case_id?: string | null;
  property_id?: string | null;
  type: ActivityType;
  description?: string | null;
  created_by?: string | null;
  created_at: string;
  author?: Pick<AppUser, "id" | "full_name"> | null;
  residents?: Pick<Resident, "id" | "full_name"> | null;
  cases?: Pick<Case, "id" | "title"> | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  case_id?: string | null;
  resident_id?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  read_at?: string | null;
  created_at: string;
}

export interface ResidentDetail extends Resident {
  cases: Case[];
  activities: Activity[];
}

export interface PropertyDetail extends Property {
  residents: Resident[];
  cases: Case[];
}

// ===================== Dealflow layer (migration 0002) =====================

export type LeadStage =
  | "new_lead"
  | "contacted"
  | "qualified"
  | "discovery"
  | "proposal"
  | "pilot"
  | "closed_won"
  | "closed_lost";

export type LeadTemperature = "hot" | "warm" | "cold";

export type LeadSource =
  | "res_exp_check"
  | "cold_email"
  | "linkedin"
  | "referral"
  | "website"
  | "import"
  | "other";

export type TaskStatus = "open" | "done";
export type OutreachChannel = "email" | "call" | "linkedin" | "meeting" | "sms" | "other";
export type OutreachOutcome =
  | "sent"
  | "opened"
  | "replied"
  | "no_response"
  | "bounced"
  | "completed"
  | "scheduled";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type CampaignChannel = "email" | "linkedin" | "event" | "multi";

export interface Lead {
  id: string;
  full_name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  company_name?: string | null;
  property_name?: string | null;
  property_id?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  unit_count?: number | null;
  asset_type: PropertyType;
  temperature: LeadTemperature;
  experience_score?: number | null;
  stage: LeadStage;
  source: LeadSource;
  assigned_to?: string | null;
  estimated_arr: number;
  stage_entered_at: string;
  next_follow_up_at?: string | null;
  last_activity_at: string;
  converted_property_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Pick<AppUser, "id" | "full_name"> | null;
  properties?: Pick<Property, "id" | "name"> | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: CasePriority;
  due_at?: string | null;
  assigned_to?: string | null;
  lead_id?: string | null;
  resident_id?: string | null;
  case_id?: string | null;
  property_id?: string | null;
  completed_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Pick<AppUser, "id" | "full_name"> | null;
  leads?: Pick<Lead, "id" | "full_name" | "company_name"> | null;
  residents?: Pick<Resident, "id" | "full_name"> | null;
  cases?: Pick<Case, "id" | "title"> | null;
}

export interface Outreach {
  id: string;
  lead_id: string;
  campaign_id?: string | null;
  channel: OutreachChannel;
  direction: "outbound" | "inbound";
  subject?: string | null;
  body?: string | null;
  outcome: OutreachOutcome;
  occurred_at: string;
  created_by?: string | null;
  created_at: string;
  leads?: Pick<Lead, "id" | "full_name" | "company_name"> | null;
  campaigns?: Pick<Campaign, "id" | "name"> | null;
  author?: Pick<AppUser, "id" | "full_name"> | null;
}

export interface Campaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  goal?: string | null;
  target_segment?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  sent_count: number;
  reply_count: number;
  meeting_count: number;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperienceAssessment {
  id: string;
  lead_id?: string | null;
  resident_id?: string | null;
  property_id?: string | null;
  overall_score: number;
  synthesis?: string | null;
  pillar_engagement?: number | null;
  pillar_programming?: number | null;
  pillar_belonging?: number | null;
  pillar_wellness?: number | null;
  pillar_resources?: number | null;
  pillar_strategy?: number | null;
  responses: { q: string; a: string }[];
  recommended_scope: string[];
  submitted_at: string;
  created_by?: string | null;
  created_at: string;
  leads?: Pick<Lead, "id" | "full_name" | "company_name" | "property_name"> | null;
  properties?: Pick<Property, "id" | "name"> | null;
}

export interface LeadDetail extends Lead {
  outreach: Outreach[];
  tasks: Task[];
  activities: Activity[];
  assessment: ExperienceAssessment | null;
}

export interface DashboardSummary {
  total_leads: number;
  new_qualified: number;
  hot_leads: number;
  assessments_done: number;
  consultations: number;
  pipeline_arr: number;
  won_arr: number;
  open_cases: number;
  at_risk_residents: number;
  tasks_overdue: number;
  tasks_today: number;
  overdue_followups: number;
  lead_flow: { stage: LeadStage; label: string; count: number; arr: number }[];
  temperature: { hot: number; warm: number; cold: number };
  experience_ranges: { label: string; count: number }[];
  demand_heatmap: { pillar: string; gap: number }[];
  median_experience: number;
}

export interface AnalyticsSummary {
  total_residents: number;
  total_properties: number;
  open_cases: number;
  at_risk_residents: number;
  overdue_followups: number;
  due_today_followups: number;
  avg_resolution_days: number;
  resolved_this_week: number;
  resolved_last_week: number;
  cases_by_stage: { stage: CaseStage; label: string; count: number }[];
  priority_breakdown: { priority: CasePriority; count: number }[];
  resolution_funnel: { label: string; count: number }[];
  cases_opened_per_week: { week_start: string; count: number }[];
  caseload_by_manager: { user_id: string; full_name: string; open_cases: number }[];
}
