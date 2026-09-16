// Shared types — kept in sync with supabase/migrations/000{1,2,3}_*.sql by hand.

export type UserRole =
  | "super_admin"
  | "admin"
  | "management"
  | "business_development"
  | "sales"
  | "partnerships"
  | "investor_relations"
  | "marketing"
  | "community_manager"
  | "viewer";

export type NavKey =
  | "dashboard"
  | "leads"
  | "pipeline"
  | "sponsors"
  | "investors"
  | "facilities"
  | "partners"
  | "user_acquisition"
  | "captains"
  | "campaigns"
  | "tasks"
  | "activities"
  | "analytics";

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

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department?: string | null;
  title?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  is_active?: boolean;
  created_at?: string;
}

// ===================== Pipelines (configurable — Settings) =====================

export type PipelineKey =
  | "sponsor"
  | "investor"
  | "strategic_partnership"
  | "user_acquisition"
  | "facility"
  | "captain";

export interface PipelineDef {
  key: PipelineKey;
  label: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface PipelineStageDef {
  id: string;
  pipeline_key: PipelineKey;
  key: string;
  label: string;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
}

// ===================== Shared enums =====================

export type LeadType =
  | "sponsor"
  | "investor"
  | "facility"
  | "sports_brand"
  | "coach"
  | "academy"
  | "captain"
  | "athlete"
  | "community"
  | "tournament_organizer"
  | "strategic_partner"
  | "media_partner"
  | "corporate_partner"
  | "other";

export type LeadSource =
  | "field_sales"
  | "referral"
  | "website"
  | "social_media"
  | "linkedin"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "email"
  | "event"
  | "campaign"
  | "existing_network"
  | "investor_outreach"
  | "sponsor_outreach"
  | "facility_outreach"
  | "organic"
  | "import"
  | "other";

export type Temperature = "hot" | "warm" | "cold" | "at_risk";
export type Priority = "high" | "medium" | "low";
export type OpportunityStatus = "open" | "won" | "lost" | "nurture";

export type LostReason =
  | "no_budget"
  | "not_interested"
  | "competitor"
  | "timing"
  | "no_response"
  | "decision_maker_unavailable"
  | "terms_not_agreed"
  | "failed_qualification"
  | "internal_decision"
  | "funding_not_available"
  | "partnership_not_suitable"
  | "other";

export type FollowUpType =
  | "call"
  | "whatsapp"
  | "email"
  | "meeting"
  | "proposal"
  | "demo"
  | "site_visit"
  | "investor_meeting"
  | "sponsor_meeting"
  | "other";

export type ValueType = "monetary" | "non_monetary" | "user_acquisition" | "partnership" | "investment";

export type ActivityType =
  | "call"
  | "whatsapp"
  | "email"
  | "meeting"
  | "visit"
  | "note"
  | "stage_change"
  | "follow_up_set"
  | "follow_up_completed"
  | "lead_created"
  | "lead_stage_change"
  | "facility_created"
  | "captain_created"
  | "task_done"
  | "won"
  | "lost"
  | "document"
  | "outreach"
  | "system";

export type NotificationType =
  | "follow_up_due"
  | "follow_up_overdue"
  | "lead_assigned"
  | "stage_change"
  | "task_assigned"
  | "task_due"
  | "task_overdue"
  | "deal_won"
  | "deal_lost";

export type TaskStatus = "to_do" | "in_progress" | "completed" | "cancelled";

export type OutreachChannel =
  | "call"
  | "whatsapp"
  | "email"
  | "meeting"
  | "sms"
  | "linkedin"
  | "proposal"
  | "demo"
  | "site_visit"
  | "investor_meeting"
  | "sponsor_meeting"
  | "other";

export type OutreachOutcome =
  | "sent"
  | "opened"
  | "replied"
  | "no_response"
  | "bounced"
  | "completed"
  | "scheduled";

export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled";
export type CampaignChannel = "email" | "linkedin" | "event" | "multi";
export type CampaignType =
  | "sponsor_outreach"
  | "investor_outreach"
  | "facility_acquisition"
  | "user_acquisition"
  | "captain_recruitment"
  | "brand_awareness"
  | "event"
  | "other";

export type FacilityType =
  | "football_turf"
  | "five_a_side"
  | "astroturf"
  | "sports_centre"
  | "recreation_centre"
  | "sports_complex"
  | "other";

// ===================== Core Lead / Opportunity record (§6) =====================
// Covers Sponsor, Investor, Strategic Partnership and User Acquisition pipelines.
// Facility and Captain opportunities live on their own tables below.

export interface Lead {
  id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  linkedin_url?: string | null;
  website?: string | null;
  company_name?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;

  lead_type: LeadType;
  pipeline: PipelineKey;
  stage: string;
  source: LeadSource;
  industry?: string | null;
  sport_category?: string | null;
  interest?: string | null;
  priority: Priority;
  temperature: Temperature;
  assigned_to?: string | null;
  campaign_id?: string | null;

  expected_value?: number | null;
  currency: string;
  value_type: ValueType;
  probability?: number | null;
  weighted_value?: number | null;

  sponsorship_category?: string | null;
  decision_maker?: string | null;
  budget_status?: string | null;
  proposal_status?: string | null;

  investor_type?: string | null;
  ticket_size?: number | null;
  target_raise?: number | null;
  intro_source?: string | null;
  due_diligence_status?: string | null;

  target_users?: number | null;
  actual_users: number;
  active_users?: number | null;
  target_location?: string | null;
  target_community?: string | null;
  campaign_start_date?: string | null;
  campaign_end_date?: string | null;
  cost?: number | null;

  status: OpportunityStatus;
  lost_reason?: LostReason | null;
  won_at?: string | null;
  lost_at?: string | null;

  next_follow_up_at?: string | null;
  next_follow_up_type?: FollowUpType | null;
  next_action?: string | null;
  stage_entered_at: string;
  last_activity_at: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;

  assignee?: Pick<AppUser, "id" | "full_name"> | null;
  campaigns?: Pick<Campaign, "id" | "name"> | null;
}

export interface LeadDetail extends Lead {
  outreach: Outreach[];
  tasks: Task[];
  activities: Activity[];
}

// ===================== Facility (§10) =====================

export interface Facility {
  id: string;
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  area?: string | null;
  state?: string | null;
  country?: string | null;
  facility_type: FacilityType;
  pitch_count?: number | null;
  operating_hours?: string | null;
  booking_model?: string | null;
  current_software?: string | null;
  partnership_type?: string | null;
  stage: string;
  expected_value?: number | null;
  currency: string;
  assigned_to?: string | null;
  next_follow_up_at?: string | null;
  status: OpportunityStatus;
  lost_reason?: LostReason | null;
  won_at?: string | null;
  lost_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Pick<AppUser, "id" | "full_name"> | null;
}

export interface FacilityDetail extends Facility {
  outreach: Outreach[];
  tasks: Task[];
  activities: Activity[];
}

// ===================== Captain (§12) =====================

export interface Captain {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  location_city?: string | null;
  area?: string | null;
  community?: string | null;
  player_count?: number | null;
  games_coordinated: number;
  active: boolean;
  date_joined?: string | null;
  next_game_at?: string | null;
  last_activity_at: string;
  stage: string;
  assigned_to?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Pick<AppUser, "id" | "full_name"> | null;
}

export interface CaptainDetail extends Captain {
  outreach: Outreach[];
  tasks: Task[];
  activities: Activity[];
}

// ===================== Tasks / Outreach / Activities / Campaigns =====================

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  due_at?: string | null;
  assigned_to?: string | null;
  lead_id?: string | null;
  facility_id?: string | null;
  captain_id?: string | null;
  completed_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Pick<AppUser, "id" | "full_name"> | null;
  leads?: Pick<Lead, "id" | "full_name" | "company_name"> | null;
  facilities?: Pick<Facility, "id" | "name"> | null;
  captains?: Pick<Captain, "id" | "full_name"> | null;
}

export interface Outreach {
  id: string;
  lead_id?: string | null;
  facility_id?: string | null;
  captain_id?: string | null;
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
  facilities?: Pick<Facility, "id" | "name"> | null;
  captains?: Pick<Captain, "id" | "full_name"> | null;
  campaigns?: Pick<Campaign, "id" | "name"> | null;
  author?: Pick<AppUser, "id" | "full_name"> | null;
}

export interface Activity {
  id: string;
  lead_id?: string | null;
  facility_id?: string | null;
  captain_id?: string | null;
  type: ActivityType;
  description?: string | null;
  created_by?: string | null;
  created_at: string;
  author?: Pick<AppUser, "id" | "full_name"> | null;
  leads?: Pick<Lead, "id" | "full_name" | "company_name"> | null;
  facilities?: Pick<Facility, "id" | "name"> | null;
  captains?: Pick<Captain, "id" | "full_name"> | null;
}

export interface Campaign {
  id: string;
  name: string;
  objective?: string | null;
  campaign_type: CampaignType;
  channel: CampaignChannel;
  status: CampaignStatus;
  target_audience?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  target_leads?: number | null;
  actual_leads: number;
  target_users?: number | null;
  actual_users: number;
  budget?: number | null;
  cost?: number | null;
  sent_count: number;
  reply_count: number;
  meeting_count: number;
  owner?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  owner_user?: Pick<AppUser, "id" | "full_name"> | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  lead_id?: string | null;
  facility_id?: string | null;
  captain_id?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  read_at?: string | null;
  created_at: string;
}

// ===================== Dashboard / reporting =====================

export interface PipelineBreakdownRow {
  pipeline: PipelineKey;
  label: string;
  count: number;
  value: number;
}

export interface DashboardSummary {
  total_leads: number;
  active_opportunities: number;
  total_pipeline_value: number;
  weighted_pipeline: number;
  sponsor_pipeline: number;
  sponsor_count: number;
  investor_pipeline: number;
  investor_count: number;
  facility_pipeline: number;
  facility_count: number;
  partnership_pipeline: number;
  partnership_count: number;
  users_target: number;
  users_acquired: number;
  overdue_followups: number;
  today_followups: number;
  tasks_overdue: number;
  tasks_today: number;
  pipeline_breakdown: PipelineBreakdownRow[];
  temperature: { hot: number; warm: number; cold: number; at_risk: number };
}

export interface PipelineMetrics {
  total_value: number;
  weighted_value?: number;
  active_count: number;
  avg_value: number;
  won_count: number;
  lost_count: number;
  win_rate: number;
}
