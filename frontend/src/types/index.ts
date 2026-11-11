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
  | "email_queue"
  | "engine_dashboard"
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
  | "ai_engine"
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
  | "deal_lost"
  | "email_reply";

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

  // 100-point qualification score (0006) — prospect_score is generated
  score_audience?: number | null;
  score_marketing?: number | null;
  score_partnership_evidence?: number | null;
  score_collaboration?: number | null;
  score_decision_access?: number | null;
  score_contact_quality?: number | null;
  prospect_score?: number | null;

  // company identity + engine provenance (0006); company_key is generated
  company_domain?: string | null;
  company_key?: string | null;
  last_researched_at?: string | null;
  engine_run_id?: string | null;

  // sponsor execution (0004)
  fit_reason?: string | null;
  package_id?: string | null;
  expected_decision_date?: string | null;
  contract_status?: ContractStatus;
  contract_value?: number | null;
  invoice_number?: string | null;
  payment_status?: PaymentStatus;
  payment_due_date?: string | null;
  amount_received?: number | null;
  paid_at?: string | null;
  vendor_registration?: VendorRegistration | null;
  renewal_status?: RenewalStatus | null;
  renewal_due_date?: string | null;

  // email (0005)
  email_opt_out?: boolean;

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
  contacts: LeadContact[];
  approvals: DealApproval[];
  deliverables: SponsorDeliverable[];
  research: LeadResearch[];
}

// ===================== Acquisition engine (0006) =====================

export interface ResearchSource {
  url: string;
  title?: string | null;
  note?: string | null;
}

export interface LeadResearch {
  id: string;
  lead_id: string;
  research_date: string;
  company_overview?: string | null;
  target_audience?: string | null;
  marketing_activities: unknown[];
  sponsorship_history: unknown[];
  business_objective?: string | null;
  partnership_gap?: string | null;
  sportconn_opportunity?: string | null;
  potential_value?: string | null;
  verified_facts: unknown[];
  assumptions: unknown[];
  sources: (ResearchSource | string)[];
  qualification_score?: number | null;
  score_breakdown: Record<string, number>;
  origin: "ai_engine" | "manual";
  engine_run_id?: string | null;
  created_at: string;
  author?: Pick<AppUser, "id" | "full_name"> | null;
}

export type SuppressionReason =
  | "unsubscribed"
  | "opt_out_request"
  | "bounced"
  | "complained"
  | "do_not_contact"
  | "manual"
  | "other";

export interface Suppression {
  id: string;
  email?: string | null;
  domain?: string | null;
  reason: SuppressionReason;
  source: string;
  note?: string | null;
  lead_id?: string | null;
  created_at: string;
  author?: Pick<AppUser, "id" | "full_name"> | null;
}

// ===================== Controlled outreach (0007) =====================

export type ContactSourceType =
  | "company_website"
  | "linkedin"
  | "data_provider"
  | "referral"
  | "event"
  | "inbound"
  | "existing_relationship"
  | "other";
export type LawfulBasis = "consent" | "legitimate_interest" | "existing_relationship" | "none_recorded";
export type VerificationStatus = "unverified" | "valid" | "risky" | "invalid" | "unknown";
export type EligibilityStatus = "eligible" | "pending_review" | "ineligible";

/** One address on a lead with its eligibility (rpc lead_email_eligibility). */
export interface LeadEmailEligibility {
  email: string;
  contact_name?: string | null;
  status: EligibilityStatus;
  reason: string;
  source_type?: ContactSourceType | null;
  source_url?: string | null;
  lawful_basis?: LawfulBasis | null;
  basis_note?: string | null;
  verification_status?: VerificationStatus | null;
  verification_provider?: string | null;
  verified_at?: string | null;
  override?: "eligible" | "ineligible" | null;
  override_reason?: string | null;
}

export type EmailMessageStatus =
  | "draft"
  | "approved"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "rejected"
  | "cancelled";

export interface EmailMessage {
  id: string;
  lead_id: string;
  to_email: string;
  to_name?: string | null;
  subject: string;
  body: string;
  origin: "ai_engine" | "staff";
  status: EmailMessageStatus;
  partnership_concept?: string | null;
  personalization_evidence: unknown[];
  facts_to_verify: unknown[];
  confidence?: number | null;
  sequence_step: number;
  follow_up_of?: string | null;
  replied_at?: string | null;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  approved_at?: string | null;
  attempts: number;
  sent_at?: string | null;
  delivered_at?: string | null;
  bounced_at?: string | null;
  complained_at?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
  leads?: Pick<Lead, "id" | "full_name" | "company_name" | "prospect_score" | "status"> | null;
  reviewer?: Pick<AppUser, "id" | "full_name"> | null;
}

export interface EmailSettings {
  daily_send_limit: number;
  per_domain_daily_limit: number;
  send_days: number[];
  send_hour_start: number;
  send_hour_end: number;
  min_days_between_emails: number;
  require_review: boolean;
  default_sender_id?: string | null;
  sending_paused: boolean;
  max_followups: number;
  followup_1_after_days: number;
  followup_2_after_days: number;
  updated_at: string;
}

// ===================== Replies + engine dashboard (0008) =====================

export type ReplyClassification =
  | "interested"
  | "meeting_requested"
  | "needs_information"
  | "not_interested"
  | "unsubscribe"
  | "out_of_office"
  | "other";

export interface EmailReply {
  id: string;
  lead_id?: string | null;
  email_message_id?: string | null;
  matched_by: "reply_address" | "sender_address" | "none";
  from_email: string;
  from_name?: string | null;
  subject?: string | null;
  body_text?: string | null;
  received_at: string;
  classification?: ReplyClassification | null;
  summary?: string | null;
  suggested_response?: string | null;
  classified_by?: "ai" | "staff" | null;
  handled: boolean;
  handled_at?: string | null;
  leads?: Pick<Lead, "id" | "full_name" | "company_name"> | null;
  email?: Pick<EmailMessage, "id" | "subject" | "sequence_step"> | null;
  handler?: Pick<AppUser, "id" | "full_name"> | null;
}

export interface EngineDashboard {
  from: string;
  to: string;
  leads_created: number;
  priority_80_plus: number;
  qualified_65_79: number;
  avg_score: number | null;
  contacts_found: number;
  contacts_verified: number;
  contacts_eligible: number;
  drafts_waiting: number;
  queued: number;
  emails_sent: number;
  first_emails_sent: number;
  followups_sent: number;
  delivered: number;
  bounced: number;
  complaints: number;
  unsubscribes: number;
  replies: number;
  positive_replies: number;
  meeting_requests: number;
  not_interested: number;
  replies_unread: number;
  replies_unmatched: number;
  meetings_held: number;
  proposals: number;
  deals_won: number;
  revenue: number;
  pipeline_value: number;
  daily: { date: string; leads: number; sent: number; replies: number }[];
}

export interface EngineRun {
  id: string;
  run_date: string;
  status: "running" | "completed" | "partial" | "failed";
  target?: number | null;
  created_count: number;
  updated_count: number;
  duplicate_count: number;
  rejected_count: number;
  notes?: string | null;
  errors: unknown[];
  started_at: string;
  finished_at?: string | null;
}

// ===================== Sponsor execution (0004) =====================

export type ContractStatus = "not_started" | "drafting" | "sent" | "signed";
export type PaymentStatus = "not_invoiced" | "invoiced" | "part_paid" | "paid";
export type VendorRegistration = "not_required" | "required" | "in_progress" | "approved";
export type RenewalStatus = "not_started" | "discussing" | "renewed" | "not_renewing";
export type ApprovalType =
  | "pricing_exception"
  | "discount"
  | "exclusivity"
  | "contract_terms"
  | "unusual_deliverable"
  | "other";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type DeliverableStatus = "planned" | "in_progress" | "delivered" | "cancelled";

/** The six qualification factors of the 100-point score (0006). */
export type ScoreField =
  | "score_audience"
  | "score_marketing"
  | "score_partnership_evidence"
  | "score_collaboration"
  | "score_decision_access"
  | "score_contact_quality";

export interface SponsorPackage {
  id: string;
  name: string;
  description?: string | null;
  list_price: number;
  delivery_cost?: number | null;
  min_margin_pct: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
}

export interface LeadContact {
  id: string;
  lead_id: string;
  full_name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  relevance?: string | null;
  created_at: string;
}

export interface DealApproval {
  id: string;
  lead_id: string;
  approval_type: ApprovalType;
  summary: string;
  status: ApprovalStatus;
  requested_by?: string | null;
  requested_at: string;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  requester?: Pick<AppUser, "id" | "full_name"> | null;
  decider?: Pick<AppUser, "id" | "full_name"> | null;
  leads?: Pick<Lead, "id" | "full_name" | "company_name"> | null;
}

export interface SponsorDeliverable {
  id: string;
  lead_id: string;
  title: string;
  due_date?: string | null;
  owner?: string | null;
  status: DeliverableStatus;
  proof?: string | null;
  delivered_at?: string | null;
  created_at: string;
  owner_user?: Pick<AppUser, "id" | "full_name"> | null;
}

export interface ScorecardTarget {
  metric: string;
  label: string;
  target_min: number;
  target_max?: number | null;
}

export interface SponsorScorecard {
  from: string;
  to: string;
  companies: number;
  contacts: number;
  first_contacts: number;
  replies: number;
  meetings: number;
  proposals: number;
  paid: number;
  paid_value: number;
  pipeline_value: number;
  pending_approvals: number;
  targets: ScorecardTarget[];
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
  recipient?: string | null;
  external_id?: string | null;
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
