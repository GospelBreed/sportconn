import type {
  ActivityType,
  CampaignChannel,
  CampaignStatus,
  CampaignType,
  FacilityType,
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
