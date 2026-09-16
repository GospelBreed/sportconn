import type {
  ActivityType,
  CampaignChannel,
  CampaignStatus,
  CaseCategory,
  CasePriority,
  CaseStage,
  LeadSource,
  LeadStage,
  LeadTemperature,
  OutreachChannel,
  OutreachOutcome,
  PropertyType,
  ResidentStatus,
} from "@/types";
import type { IconName } from "@/components/ui/Icon";

// ---------- Case stages (pipeline order) ----------
export const STAGES: { key: CaseStage; label: string }[] = [
  { key: "intake", label: "Intake" },
  { key: "in_progress", label: "In Progress" },
  { key: "awaiting_resident", label: "Awaiting Member" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

export const ACTIVE_STAGES: CaseStage[] = ["intake", "in_progress", "awaiting_resident"];
export const ARCHIVE_STAGES: CaseStage[] = ["resolved", "closed"];

export const STAGE_LABEL: Record<CaseStage, string> = {
  intake: "Intake",
  in_progress: "In Progress",
  awaiting_resident: "Awaiting Member",
  resolved: "Resolved",
  closed: "Closed",
};

export const STAGE_ACCENT: Record<CaseStage, string> = {
  intake: "bg-info",
  in_progress: "bg-primary",
  awaiting_resident: "bg-warning",
  resolved: "bg-success",
  closed: "bg-muted",
};

// ---------- Case priority ----------
export const PRIORITIES: CasePriority[] = ["urgent", "high", "medium", "low"];

export const PRIORITY_META: Record<
  CasePriority,
  { label: string; badge: string; dot: string }
> = {
  urgent: { label: "Urgent", badge: "bg-danger/12 text-danger", dot: "bg-danger" },
  high: { label: "High", badge: "bg-warning/14 text-warning", dot: "bg-warning" },
  medium: { label: "Medium", badge: "bg-info/12 text-info", dot: "bg-info" },
  low: { label: "Low", badge: "bg-line text-muted", dot: "bg-muted" },
};

// ---------- Resident status ----------
export const RESIDENT_STATUSES: ResidentStatus[] = ["active", "pending", "at_risk", "former"];

export const RESIDENT_STATUS_META: Record<
  ResidentStatus,
  { label: string; badge: string; dot: string }
> = {
  active: { label: "Active", badge: "bg-success/12 text-success", dot: "bg-success" },
  pending: { label: "Pending", badge: "bg-warning/14 text-warning", dot: "bg-warning" },
  at_risk: { label: "At Risk", badge: "bg-danger/12 text-danger", dot: "bg-danger" },
  former: { label: "Former", badge: "bg-line text-muted", dot: "bg-muted" },
};

// ---------- Case category ----------
export const CASE_CATEGORIES: CaseCategory[] = [
  "maintenance",
  "billing",
  "lease",
  "complaint",
  "community",
  "wellness",
  "other",
];

export const CATEGORY_META: Record<CaseCategory, { label: string; icon: IconName }> = {
  maintenance: { label: "Maintenance", icon: "wrench" },
  billing: { label: "Billing", icon: "dollar" },
  lease: { label: "Lease", icon: "file" },
  complaint: { label: "Complaint", icon: "flag" },
  community: { label: "Community", icon: "users" },
  wellness: { label: "Wellness", icon: "heart" },
  other: { label: "Other", icon: "dots" },
};

// ---------- Property type ----------
export const PROPERTY_TYPES: PropertyType[] = [
  "conventional",
  "luxury",
  "senior",
  "affordable",
  "mixed_use",
];

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  conventional: "Conventional",
  luxury: "Luxury",
  senior: "Senior Living",
  affordable: "Affordable",
  mixed_use: "Mixed Use",
};

// ---------- Activity meta ----------
export const ACTIVITY_META: Record<
  ActivityType,
  { label: string; icon: IconName; tone: string }
> = {
  call: { label: "Call", icon: "phone", tone: "bg-info/10 text-info" },
  visit: { label: "Visit", icon: "home", tone: "bg-success/10 text-success" },
  note: { label: "Note", icon: "note", tone: "bg-line text-muted" },
  stage_change: { label: "Stage change", icon: "flag", tone: "bg-primary/10 text-primary" },
  case_opened: { label: "Case opened", icon: "folder", tone: "bg-info/10 text-info" },
  case_closed: { label: "Case closed", icon: "check", tone: "bg-success/10 text-success" },
  follow_up_set: { label: "Follow-up set", icon: "clock", tone: "bg-warning/12 text-warning" },
  resident_created: { label: "Member added", icon: "users", tone: "bg-primary/10 text-primary" },
  system: { label: "System", icon: "dots", tone: "bg-line text-muted" },
  lead_created: { label: "Lead created", icon: "sparkle", tone: "bg-primary/10 text-primary" },
  lead_stage_change: { label: "Stage change", icon: "flag", tone: "bg-primary/10 text-primary" },
  outreach: { label: "Outreach", icon: "mail", tone: "bg-info/10 text-info" },
  task_done: { label: "Task done", icon: "check", tone: "bg-success/10 text-success" },
};

// ---------- Follow-up buckets ----------
export const FOLLOWUP_META = {
  overdue: { label: "Overdue", badge: "bg-danger/12 text-danger", dot: "bg-danger" },
  today: { label: "Due today", badge: "bg-warning/14 text-warning", dot: "bg-warning" },
  upcoming: { label: "Upcoming", badge: "bg-info/12 text-info", dot: "bg-info" },
  none: { label: "", badge: "", dot: "" },
} as const;

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  case_manager: "Case Manager",
  read_only: "Read Only",
};

export const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-primary text-white",
  admin: "bg-primary/10 text-primary",
  case_manager: "bg-info/10 text-info",
  read_only: "bg-line text-muted",
};

// Governance — nav sections + capability flags for the permission matrix UI.
export const NAV_KEYS = [
  "dashboard",
  "leads",
  "pipeline",
  "cases",
  "residents",
  "properties",
  "experience",
  "outreach",
  "tasks",
  "analytics",
  "campaigns",
] as const;

export const NAV_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  pipeline: "Pipeline",
  cases: "Case Pipeline",
  residents: "Members",
  properties: "Facilities",
  experience: "Member Experience",
  outreach: "Outreach",
  tasks: "Tasks",
  analytics: "Reports & Analytics",
  campaigns: "Campaigns",
};

export const PERMISSION_FLAGS: { key: string; label: string; hint: string }[] = [
  { key: "can_write", label: "Create & edit", hint: "Add and update records" },
  { key: "can_delete", label: "Delete", hint: "Remove records" },
  { key: "can_import", label: "Import CSV", hint: "Bulk-add leads from a file" },
  { key: "can_export", label: "Export CSV", hint: "Download data" },
  { key: "can_manage_staff", label: "Manage staff", hint: "Edit profiles, assign Case Manager / Read Only" },
  { key: "can_manage_users", label: "Manage users", hint: "Create / delete / disable users, grant Admin+" },
  { key: "can_edit_permissions", label: "Edit permissions", hint: "Change this matrix" },
];

// ===================== Dealflow layer =====================

export const LEAD_STAGES: { key: LeadStage; label: string }[] = [
  { key: "new_lead", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "discovery", label: "Discovery Call" },
  { key: "proposal", label: "Proposal" },
  { key: "pilot", label: "Pilot Term" },
  { key: "closed_won", label: "Closed Won" },
  { key: "closed_lost", label: "Closed Lost" },
];

export const LEAD_ACTIVE_STAGES: LeadStage[] = [
  "new_lead",
  "contacted",
  "qualified",
  "discovery",
  "proposal",
  "pilot",
];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  qualified: "Qualified",
  discovery: "Discovery Call",
  proposal: "Proposal",
  pilot: "Pilot Term",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

export const LEAD_STAGE_ACCENT: Record<LeadStage, string> = {
  new_lead: "bg-muted",
  contacted: "bg-info",
  qualified: "bg-primary",
  discovery: "bg-warning",
  proposal: "bg-warning",
  pilot: "bg-success",
  closed_won: "bg-success",
  closed_lost: "bg-muted",
};

export const TEMPERATURE_META: Record<
  LeadTemperature,
  { label: string; badge: string; dot: string }
> = {
  hot: { label: "Hot", badge: "bg-danger/12 text-danger", dot: "bg-danger" },
  warm: { label: "Warm", badge: "bg-warning/14 text-warning", dot: "bg-warning" },
  cold: { label: "Cold", badge: "bg-info/12 text-info", dot: "bg-info" },
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  res_exp_check: "Res. Exp. Check",
  cold_email: "Cold Email",
  linkedin: "LinkedIn",
  referral: "Referral",
  website: "Website Inbound",
  import: "Imported",
  other: "Other",
};

export const CHANNEL_META: Record<OutreachChannel, { label: string; icon: IconName }> = {
  email: { label: "Email", icon: "mail" },
  call: { label: "Call", icon: "phone" },
  linkedin: { label: "LinkedIn", icon: "external" },
  meeting: { label: "Meeting", icon: "users" },
  sms: { label: "SMS", icon: "note" },
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

export const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "Draft", cls: "bg-line text-muted", dot: "bg-muted" },
  active: { label: "Active", cls: "bg-success/12 text-success", dot: "bg-success" },
  paused: { label: "Paused", cls: "bg-warning/14 text-warning", dot: "bg-warning" },
  completed: { label: "Completed", cls: "bg-info/12 text-info", dot: "bg-info" },
};

export const CAMPAIGN_CHANNEL_LABEL: Record<CampaignChannel, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  event: "Event",
  multi: "Multi-channel",
};

export const PILLARS: { key: string; label: string }[] = [
  { key: "pillar_engagement", label: "Member Engagement" },
  { key: "pillar_programming", label: "Community Programming" },
  { key: "pillar_belonging", label: "Connection & Belonging" },
  { key: "pillar_wellness", label: "Wellness & Lifestyle" },
  { key: "pillar_resources", label: "Resources & Comms" },
  { key: "pillar_strategy", label: "Strategy & Operations" },
];
