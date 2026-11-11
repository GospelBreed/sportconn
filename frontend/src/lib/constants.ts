import type {
  ActivityType,
  ApprovalStatus,
  ApprovalType,
  CampaignChannel,
  CampaignStatus,
  CampaignType,
  ContactSourceType,
  ContractStatus,
  DeliverableStatus,
  EligibilityStatus,
  EmailMessageStatus,
  LawfulBasis,
  ReplyClassification,
  VerificationStatus,
  FacilityType,
  PaymentStatus,
  RenewalStatus,
  ScoreField,
  SuppressionReason,
  VendorRegistration,
  FollowUpType,
  LeadSource,
  LeadType,
  LostReason,
  NotificationType,
  OutreachChannel,
  OutreachOutcome,
  PipelineKey,
  Priority,
  Temperature,
  TaskStatus,
  ValueType,
} from "@/types";
import type { IconName } from "@/components/ui/Icon";

// Pipeline stages themselves are configurable (Settings → Pipelines) and live
// in the database — see hooks/queries.ts `usePipelines()` / `usePipelineStages()`.
// Everything below is fixed field metadata (enum labels/colors), not stages.

// ---------- Pipelines ----------
export const PIPELINE_LABEL: Record<PipelineKey, string> = {
  sponsor: "Sponsors",
  investor: "Investors",
  strategic_partnership: "Strategic Partnerships",
  user_acquisition: "User Acquisition",
  facility: "Facilities",
  captain: "Captains & Communities",
};

// ---------- Lead type ----------
export const LEAD_TYPES: LeadType[] = [
  "sponsor","investor","facility","sports_brand","coach","academy","captain","athlete",
  "community","tournament_organizer","strategic_partner","media_partner","corporate_partner","other",
];

export const LEAD_TYPE_LABEL: Record<LeadType, string> = {
  sponsor: "Sponsor",
  investor: "Investor",
  facility: "Facility",
  sports_brand: "Sports Brand",
  coach: "Coach",
  academy: "Academy",
  captain: "Captain",
  athlete: "Athlete",
  community: "Community",
  tournament_organizer: "Tournament Organizer",
  strategic_partner: "Strategic Partner",
  media_partner: "Media Partner",
  corporate_partner: "Corporate Partner",
  other: "Other",
};

// ---------- Temperature ----------
export const TEMPERATURES: Temperature[] = ["hot", "warm", "cold", "at_risk"];

export const TEMPERATURE_META: Record<Temperature, { label: string; badge: string; dot: string }> = {
  hot: { label: "Hot", badge: "bg-danger/12 text-danger", dot: "bg-danger" },
  warm: { label: "Warm", badge: "bg-warning/14 text-warning", dot: "bg-warning" },
  cold: { label: "Cold", badge: "bg-info/12 text-info", dot: "bg-info" },
  at_risk: { label: "At Risk", badge: "bg-line text-muted", dot: "bg-muted" },
};

// ---------- Priority ----------
export const PRIORITIES: Priority[] = ["high", "medium", "low"];

export const PRIORITY_META: Record<Priority, { label: string; badge: string; dot: string }> = {
  high: { label: "High", badge: "bg-danger/12 text-danger", dot: "bg-danger" },
  medium: { label: "Medium", badge: "bg-warning/14 text-warning", dot: "bg-warning" },
  low: { label: "Low", badge: "bg-line text-muted", dot: "bg-muted" },
};

// ---------- Qualification score (0006 — Partnership Acquisition Engine) ----------
export const SCORE_FACTORS: { field: ScoreField; label: string; max: number; key: string }[] = [
  { field: "score_audience", key: "audience", label: "Audience alignment", max: 25 },
  { field: "score_marketing", key: "marketing", label: "Marketing and sponsorship potential", max: 20 },
  { field: "score_partnership_evidence", key: "partnership_evidence", label: "Partnership activity evidence", max: 15 },
  { field: "score_collaboration", key: "collaboration", label: "Identifiable collaboration opportunity", max: 15 },
  { field: "score_decision_access", key: "decision_access", label: "Decision-maker accessibility", max: 15 },
  { field: "score_contact_quality", key: "contact_quality", label: "Contact information quality", max: 10 },
];

export const QUALIFY_MIN = 65;
export const PRIORITY_MIN = 80;

/** Engine blueprint: ≥ 80 priority, 65–79 qualified, < 65 below the threshold. */
export function prospectTier(score?: number | null): { tier: "A" | "B" | "C"; label: string; badge: string } | null {
  if (score === null || score === undefined) return null;
  if (score >= PRIORITY_MIN) return { tier: "A", label: "Priority — contact first", badge: "bg-success/12 text-success" };
  if (score >= QUALIFY_MIN) return { tier: "B", label: "Qualified", badge: "bg-warning/14 text-warning" };
  return { tier: "C", label: "Below the 65 threshold", badge: "bg-line text-muted" };
}

export const SUPPRESSION_REASONS: SuppressionReason[] = [
  "unsubscribed", "opt_out_request", "bounced", "complained", "do_not_contact", "manual", "other",
];
export const SUPPRESSION_REASON_LABEL: Record<SuppressionReason, string> = {
  unsubscribed: "Unsubscribed",
  opt_out_request: "Asked not to be contacted",
  bounced: "Email bounced",
  complained: "Marked as spam",
  do_not_contact: "Do not contact",
  manual: "Added manually",
  other: "Other",
};

// ---------- Controlled outreach (0007) ----------
export const SOURCE_TYPES: ContactSourceType[] = [
  "company_website", "linkedin", "data_provider", "referral", "event", "inbound", "existing_relationship", "other",
];
export const SOURCE_TYPE_LABEL: Record<ContactSourceType, string> = {
  company_website: "Company website",
  linkedin: "LinkedIn",
  data_provider: "B2B data provider",
  referral: "Referral / introduction",
  event: "Met at an event",
  inbound: "They contacted us",
  existing_relationship: "Existing relationship",
  other: "Other",
};
export const LAWFUL_BASES: LawfulBasis[] = ["legitimate_interest", "consent", "existing_relationship", "none_recorded"];
export const LAWFUL_BASIS_LABEL: Record<LawfulBasis, string> = {
  legitimate_interest: "Legitimate interest (relevant B2B offer)",
  consent: "Consent given",
  existing_relationship: "Existing business relationship",
  none_recorded: "Not recorded",
};
export const VERIFICATION_STATUSES: VerificationStatus[] = ["valid", "risky", "invalid", "unknown", "unverified"];
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  valid: "Verified — valid",
  risky: "Risky (catch-all / role)",
  invalid: "Invalid",
  unknown: "Couldn't verify",
  unverified: "Not checked",
};
export const ELIGIBILITY_META: Record<EligibilityStatus, { label: string; cls: string }> = {
  eligible: { label: "Can be emailed", cls: "bg-success/12 text-success" },
  pending_review: { label: "Needs review", cls: "bg-warning/14 text-warning" },
  ineligible: { label: "Don't email", cls: "bg-danger/12 text-danger" },
};
export const EMAIL_STATUS_META: Record<EmailMessageStatus, { label: string; cls: string }> = {
  draft: { label: "To review", cls: "bg-warning/14 text-warning" },
  approved: { label: "Queued", cls: "bg-info/12 text-info" },
  sending: { label: "Sending", cls: "bg-info/12 text-info" },
  sent: { label: "Sent", cls: "bg-success/12 text-success" },
  delivered: { label: "Delivered", cls: "bg-success/12 text-success" },
  bounced: { label: "Bounced", cls: "bg-danger/12 text-danger" },
  complained: { label: "Marked as spam", cls: "bg-danger/12 text-danger" },
  failed: { label: "Failed", cls: "bg-danger/12 text-danger" },
  rejected: { label: "Rejected", cls: "bg-line text-muted" },
  cancelled: { label: "Cancelled", cls: "bg-line text-muted" },
};
export const REPLY_CLASSES: ReplyClassification[] = [
  "interested", "meeting_requested", "needs_information", "not_interested", "unsubscribe", "out_of_office", "other",
];
export const REPLY_CLASS_META: Record<ReplyClassification, { label: string; cls: string }> = {
  interested: { label: "Interested", cls: "bg-success/12 text-success" },
  meeting_requested: { label: "Wants a meeting", cls: "bg-success/12 text-success" },
  needs_information: { label: "Needs information", cls: "bg-info/12 text-info" },
  not_interested: { label: "Not interested", cls: "bg-line text-muted" },
  unsubscribe: { label: "Asked to stop", cls: "bg-danger/12 text-danger" },
  out_of_office: { label: "Out of office", cls: "bg-line text-muted" },
  other: { label: "Other", cls: "bg-line text-muted" },
};
export const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: "Mon" }, { iso: 2, label: "Tue" }, { iso: 3, label: "Wed" }, { iso: 4, label: "Thu" },
  { iso: 5, label: "Fri" }, { iso: 6, label: "Sat" }, { iso: 7, label: "Sun" },
];

// ---------- Sponsor execution (0004) ----------

export const CONTRACT_STATUSES: ContractStatus[] = ["not_started", "drafting", "sent", "signed"];
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  not_started: "Not started",
  drafting: "Drafting",
  sent: "Sent for signature",
  signed: "Signed",
};

export const PAYMENT_STATUSES: PaymentStatus[] = ["not_invoiced", "invoiced", "part_paid", "paid"];
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  not_invoiced: "Not invoiced",
  invoiced: "Invoiced",
  part_paid: "Part paid",
  paid: "Paid — confirmed by Finance",
};

export const VENDOR_REGISTRATIONS: VendorRegistration[] = ["not_required", "required", "in_progress", "approved"];
export const VENDOR_REGISTRATION_LABEL: Record<VendorRegistration, string> = {
  not_required: "Not required",
  required: "Required — not started",
  in_progress: "Documents submitted",
  approved: "Approved as vendor",
};

export const RENEWAL_STATUSES: RenewalStatus[] = ["not_started", "discussing", "renewed", "not_renewing"];
export const RENEWAL_STATUS_LABEL: Record<RenewalStatus, string> = {
  not_started: "Not started",
  discussing: "In discussion",
  renewed: "Renewed",
  not_renewing: "Not renewing",
};

export const APPROVAL_TYPES: ApprovalType[] = [
  "pricing_exception", "discount", "exclusivity", "contract_terms", "unusual_deliverable", "other",
];
export const APPROVAL_TYPE_LABEL: Record<ApprovalType, string> = {
  pricing_exception: "Pricing exception",
  discount: "Discount",
  exclusivity: "Category exclusivity",
  contract_terms: "Contract terms",
  unusual_deliverable: "Unusual deliverable",
  other: "Other",
};
export const APPROVAL_STATUS_META: Record<ApprovalStatus, { label: string; cls: string }> = {
  pending: { label: "Waiting for decision", cls: "bg-warning/14 text-warning" },
  approved: { label: "Approved", cls: "bg-success/12 text-success" },
  rejected: { label: "Rejected", cls: "bg-danger/12 text-danger" },
};

export const DELIVERABLE_STATUSES: DeliverableStatus[] = ["planned", "in_progress", "delivered", "cancelled"];
export const DELIVERABLE_STATUS_META: Record<DeliverableStatus, { label: string; cls: string }> = {
  planned: { label: "Planned", cls: "bg-line text-muted" },
  in_progress: { label: "In progress", cls: "bg-info/12 text-info" },
  delivered: { label: "Delivered", cls: "bg-success/12 text-success" },
  cancelled: { label: "Cancelled", cls: "bg-line text-muted" },
};

// ---------- Source ----------
export const LEAD_SOURCES: LeadSource[] = [
  "field_sales","referral","website","social_media","linkedin","instagram","facebook","whatsapp",
  "email","event","campaign","existing_network","investor_outreach","sponsor_outreach",
  "facility_outreach","organic","import","other",
];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  field_sales: "Field Sales",
  referral: "Referral",
  website: "Website",
  social_media: "Social Media",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  email: "Email",
  event: "Event",
  campaign: "Campaign",
  existing_network: "Existing Network",
  investor_outreach: "Investor Outreach",
  sponsor_outreach: "Sponsor Outreach",
  facility_outreach: "Facility Outreach",
  organic: "Organic",
  import: "Imported",
  ai_engine: "AI Partnership Engine", // set only by the engine API, not offered when adding a lead
  other: "Other",
};

// ---------- Value type ----------
export const VALUE_TYPE_LABEL: Record<ValueType, string> = {
  monetary: "Monetary",
  non_monetary: "Non-Monetary",
  user_acquisition: "User Acquisition",
  partnership: "Partnership",
  investment: "Investment",
};

// ---------- Lost reasons (§22) ----------
export const LOST_REASONS: LostReason[] = [
  "no_budget","not_interested","competitor","timing","no_response","decision_maker_unavailable",
  "terms_not_agreed","failed_qualification","internal_decision","funding_not_available",
  "partnership_not_suitable","other",
];

export const LOST_REASON_LABEL: Record<LostReason, string> = {
  no_budget: "No Budget",
  not_interested: "Not Interested",
  competitor: "Competitor",
  timing: "Timing",
  no_response: "No Response",
  decision_maker_unavailable: "Decision Maker Unavailable",
  terms_not_agreed: "Terms Not Agreed",
  failed_qualification: "Failed Qualification",
  internal_decision: "Internal Decision",
  funding_not_available: "Funding Not Available",
  partnership_not_suitable: "Partnership Not Suitable",
  other: "Other",
};

// ---------- Follow-up types (§19) ----------
export const FOLLOWUP_TYPES: FollowUpType[] = [
  "call","whatsapp","email","meeting","proposal","demo","site_visit",
  "investor_meeting","sponsor_meeting","other",
];

export const FOLLOWUP_TYPE_LABEL: Record<FollowUpType, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Meeting",
  proposal: "Proposal",
  demo: "Demo",
  site_visit: "Site Visit",
  investor_meeting: "Investor Meeting",
  sponsor_meeting: "Sponsor Meeting",
  other: "Other",
};

export const FOLLOWUP_BUCKET_META = {
  overdue: { label: "Overdue", badge: "bg-danger/12 text-danger", dot: "bg-danger" },
  today: { label: "Due today", badge: "bg-warning/14 text-warning", dot: "bg-warning" },
  upcoming: { label: "Upcoming", badge: "bg-info/12 text-info", dot: "bg-info" },
  none: { label: "", badge: "", dot: "" },
} as const;

// ---------- Task ----------
export const TASK_STATUSES: TaskStatus[] = ["to_do", "in_progress", "completed", "cancelled"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  to_do: "To Do",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

// ---------- Outreach ----------
export const CHANNEL_META: Record<OutreachChannel, { label: string; icon: IconName }> = {
  call: { label: "Call", icon: "phone" },
  whatsapp: { label: "WhatsApp", icon: "mail" },
  email: { label: "Email", icon: "mail" },
  meeting: { label: "Meeting", icon: "users" },
  sms: { label: "SMS", icon: "note" },
  linkedin: { label: "LinkedIn", icon: "external" },
  proposal: { label: "Proposal", icon: "file" },
  demo: { label: "Demo", icon: "sparkle" },
  site_visit: { label: "Site Visit", icon: "home" },
  investor_meeting: { label: "Investor Meeting", icon: "users" },
  sponsor_meeting: { label: "Sponsor Meeting", icon: "users" },
  other: { label: "Other", icon: "dots" },
};

export const OUTCOME_META: Record<OutreachOutcome, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "bg-line text-muted" },
  opened: { label: "Opened", cls: "bg-info/12 text-info" },
  replied: { label: "Replied", cls: "bg-success/12 text-success" },
  no_response: { label: "No response", cls: "bg-warning/14 text-warning" },
  bounced: { label: "Bounced", cls: "bg-danger/12 text-danger" },
  completed: { label: "Completed", cls: "bg-success/12 text-success" },
  scheduled: { label: "Scheduled", cls: "bg-primary/10 text-primary" },
};

// ---------- Activity meta ----------
export const ACTIVITY_META: Record<ActivityType, { label: string; icon: IconName; tone: string }> = {
  call: { label: "Call", icon: "phone", tone: "bg-info/10 text-info" },
  whatsapp: { label: "WhatsApp", icon: "mail", tone: "bg-success/10 text-success" },
  email: { label: "Email", icon: "mail", tone: "bg-info/10 text-info" },
  meeting: { label: "Meeting", icon: "users", tone: "bg-primary/10 text-primary" },
  visit: { label: "Site Visit", icon: "home", tone: "bg-success/10 text-success" },
  note: { label: "Note", icon: "note", tone: "bg-line text-muted" },
  stage_change: { label: "Stage change", icon: "flag", tone: "bg-primary/10 text-primary" },
  follow_up_set: { label: "Follow-up set", icon: "clock", tone: "bg-warning/12 text-warning" },
  follow_up_completed: { label: "Follow-up completed", icon: "check", tone: "bg-success/10 text-success" },
  lead_created: { label: "Lead created", icon: "sparkle", tone: "bg-primary/10 text-primary" },
  lead_stage_change: { label: "Stage change", icon: "flag", tone: "bg-primary/10 text-primary" },
  facility_created: { label: "Facility added", icon: "properties", tone: "bg-primary/10 text-primary" },
  captain_created: { label: "Captain added", icon: "users", tone: "bg-primary/10 text-primary" },
  task_done: { label: "Task done", icon: "check", tone: "bg-success/10 text-success" },
  won: { label: "Won", icon: "check", tone: "bg-success/10 text-success" },
  lost: { label: "Lost", icon: "flag", tone: "bg-danger/10 text-danger" },
  document: { label: "Document", icon: "file", tone: "bg-line text-muted" },
  outreach: { label: "Outreach", icon: "mail", tone: "bg-info/10 text-info" },
  system: { label: "System", icon: "dots", tone: "bg-line text-muted" },
};

// ---------- Notifications ----------
export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  follow_up_due: "Follow-up due",
  follow_up_overdue: "Follow-up overdue",
  lead_assigned: "Lead assigned",
  stage_change: "Stage change",
  task_assigned: "Task assigned",
  task_due: "Task due",
  task_overdue: "Task overdue",
  deal_won: "Deal won",
  deal_lost: "Deal lost",
  email_reply: "Email reply",
};

// ---------- Campaigns ----------
export const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "Draft", cls: "bg-line text-muted", dot: "bg-muted" },
  active: { label: "Active", cls: "bg-success/12 text-success", dot: "bg-success" },
  paused: { label: "Paused", cls: "bg-warning/14 text-warning", dot: "bg-warning" },
  completed: { label: "Completed", cls: "bg-info/12 text-info", dot: "bg-info" },
  cancelled: { label: "Cancelled", cls: "bg-line text-muted", dot: "bg-muted" },
};

export const CAMPAIGN_CHANNEL_LABEL: Record<CampaignChannel, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  event: "Event",
  multi: "Multi-channel",
};

export const CAMPAIGN_TYPES: CampaignType[] = [
  "sponsor_outreach","investor_outreach","facility_acquisition","user_acquisition",
  "captain_recruitment","brand_awareness","event","other",
];

export const CAMPAIGN_TYPE_LABEL: Record<CampaignType, string> = {
  sponsor_outreach: "Sponsor Outreach",
  investor_outreach: "Investor Outreach",
  facility_acquisition: "Facility Acquisition",
  user_acquisition: "User Acquisition",
  captain_recruitment: "Captain Recruitment",
  brand_awareness: "Brand Awareness",
  event: "Event",
  other: "Other",
};

// ---------- Facilities ----------
export const FACILITY_TYPES: FacilityType[] = [
  "football_turf","five_a_side","astroturf","sports_centre","recreation_centre","sports_complex","other",
];

export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = {
  football_turf: "Football Turf",
  five_a_side: "5-a-Side Facility",
  astroturf: "Astroturf",
  sports_centre: "Sports Centre",
  recreation_centre: "Recreation Centre",
  sports_complex: "Sports Complex",
  other: "Other",
};

// ---------- Roles (§28) ----------
export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  management: "Management",
  business_development: "Business Development",
  sales: "Sales",
  partnerships: "Partnerships",
  investor_relations: "Investor Relations",
  marketing: "Marketing",
  community_manager: "Community Manager",
  viewer: "Viewer",
};

export const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-primary text-white",
  admin: "bg-primary/10 text-primary",
  management: "bg-primary/10 text-primary",
  business_development: "bg-info/10 text-info",
  sales: "bg-info/10 text-info",
  partnerships: "bg-info/10 text-info",
  investor_relations: "bg-info/10 text-info",
  marketing: "bg-info/10 text-info",
  community_manager: "bg-info/10 text-info",
  viewer: "bg-line text-muted",
};

export const STAFF_ROLES: string[] = [
  "management","business_development","sales","partnerships",
  "investor_relations","marketing","community_manager",
];

// Governance — nav sections + capability flags for the permission matrix UI.
export const NAV_KEYS = [
  "dashboard",
  "leads",
  "pipeline",
  "sponsors",
  "email_queue",
  "engine_dashboard",
  "investors",
  "facilities",
  "partners",
  "user_acquisition",
  "captains",
  "campaigns",
  "tasks",
  "activities",
  "analytics",
] as const;

export const NAV_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  pipeline: "Pipeline",
  sponsors: "Sponsors",
  email_queue: "Email review",
  engine_dashboard: "Engine dashboard",
  investors: "Investors",
  facilities: "Facilities",
  partners: "Partners",
  user_acquisition: "User Acquisition",
  captains: "Captains & Communities",
  campaigns: "Campaigns",
  tasks: "Tasks",
  activities: "Activities",
  analytics: "Reports & Analytics",
};

export const PERMISSION_FLAGS: { key: string; label: string; hint: string }[] = [
  { key: "can_write", label: "Create & edit", hint: "Add and update records" },
  { key: "can_delete", label: "Delete", hint: "Remove records" },
  { key: "can_import", label: "Import CSV", hint: "Bulk-add leads from a file" },
  { key: "can_export", label: "Export CSV", hint: "Download data" },
  { key: "can_manage_staff", label: "Manage staff", hint: "Edit profiles, assign departments" },
  { key: "can_manage_users", label: "Manage users", hint: "Create / delete / disable users, grant Admin+" },
  { key: "can_edit_permissions", label: "Edit permissions", hint: "Change this matrix" },
];
