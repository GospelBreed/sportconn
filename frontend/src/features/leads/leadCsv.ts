import { normalizeHeader } from "@/lib/csv";
import { LEAD_SOURCE_LABEL, LEAD_TYPE_LABEL, PIPELINE_LABEL, TEMPERATURE_META } from "@/lib/constants";
import type { Lead, LeadSource, LeadType, PipelineKey, Temperature } from "@/types";

/** The importable / exportable columns, in order. */
export interface LeadCsvColumn {
  key: string;
  header: string;
  required?: boolean;
  note: string;
  example: string;
}

export const LEAD_CSV_COLUMNS: LeadCsvColumn[] = [
  { key: "full_name", header: "full_name", required: true, note: "Contact person's full name.", example: "Sarah Johnson" },
  { key: "title", header: "title", note: "Job title.", example: "Facility Manager" },
  { key: "email", header: "email", note: "Contact email.", example: "s.johnson@titansports.com" },
  { key: "phone", header: "phone", note: "Any format.", example: "+234 803 555 0184" },
  { key: "whatsapp", header: "whatsapp", note: "Any format. Blank allowed.", example: "+234 803 555 0184" },
  { key: "linkedin_url", header: "linkedin_url", note: "Full URL.", example: "https://linkedin.com/in/sjohnson" },
  { key: "company_name", header: "company_name", note: "Organization / brand name.", example: "Titan Sports Group" },
  {
    key: "lead_type",
    header: "lead_type",
    note: "One of: sponsor, investor, facility, sports_brand, coach, academy, captain, athlete, community, tournament_organizer, strategic_partner, media_partner, corporate_partner, other. Default: other.",
    example: "sponsor",
  },
  {
    key: "pipeline",
    header: "pipeline",
    note: "One of: sponsor, investor, strategic_partnership, user_acquisition. Default: sponsor.",
    example: "sponsor",
  },
  { key: "location_city", header: "location_city", note: "City.", example: "Lagos" },
  { key: "location_country", header: "location_country", note: "Country.", example: "Nigeria" },
  {
    key: "temperature",
    header: "temperature",
    note: "One of: hot, warm, cold, at_risk. Default: warm.",
    example: "hot",
  },
  {
    key: "priority",
    header: "priority",
    note: "One of: high, medium, low. Default: medium.",
    example: "high",
  },
  {
    key: "source",
    header: "source",
    note: "One of: field_sales, referral, website, social_media, linkedin, instagram, facebook, whatsapp, email, event, campaign, existing_network, investor_outreach, sponsor_outreach, facility_outreach, organic, other. Default: import.",
    example: "referral",
  },
  { key: "expected_value", header: "expected_value", note: "Numeric. $ and commas are stripped. Blank allowed.", example: "10000000" },
  {
    key: "next_follow_up_at",
    header: "next_follow_up_at",
    note: "Date or datetime — YYYY-MM-DD, MM/DD/YYYY, or ISO 8601. Blank allowed.",
    example: "2026-10-15",
  },
  { key: "notes", header: "notes", note: "Free text.", example: "Met at grassroots tournament; wants a proposal." },
];

// Columns added on export only (ignored on import).
export const LEAD_CSV_EXPORT_EXTRA = ["id", "stage", "status", "created_at", "last_activity_at"];

const HEADER_ALIASES: Record<string, string> = {
  fullname: "full_name",
  name: "full_name",
  contact: "full_name",
  contactname: "full_name",
  leadname: "full_name",
  jobtitle: "title",
  role: "title",
  emailaddress: "email",
  mail: "email",
  phonenumber: "phone",
  mobile: "phone",
  cell: "phone",
  wa: "whatsapp",
  whatsappnumber: "whatsapp",
  linkedin: "linkedin_url",
  linkedinurl: "linkedin_url",
  company: "company_name",
  companyname: "company_name",
  organization: "company_name",
  account: "company_name",
  brand: "company_name",
  type: "lead_type",
  leadtype: "lead_type",
  category: "lead_type",
  pipeline: "pipeline",
  pipelinetype: "pipeline",
  city: "location_city",
  locationcity: "location_city",
  country: "location_country",
  locationcountry: "location_country",
  temp: "temperature",
  temperature: "temperature",
  priority: "priority",
  source: "source",
  leadsource: "source",
  channel: "source",
  value: "expected_value",
  expectedvalue: "expected_value",
  dealvalue: "expected_value",
  amount: "expected_value",
  followup: "next_follow_up_at",
  nextfollowup: "next_follow_up_at",
  nextfollowupat: "next_follow_up_at",
  followupdate: "next_follow_up_at",
  note: "notes",
  notes: "notes",
  comments: "notes",
};

/** Auto-map an uploaded header to a lead field key, or "" to ignore. */
export function autoMapHeader(header: string): string {
  const norm = normalizeHeader(header);
  if (LEAD_CSV_COLUMNS.some((c) => c.key === norm)) return norm;
  return HEADER_ALIASES[norm] ?? "";
}

// ---- value normalizers ----
function pickEnum<T extends string>(
  raw: string,
  values: readonly T[],
  labels: Record<T, string>,
): T | null {
  const n = normalizeHeader(raw);
  for (const v of values) {
    if (normalizeHeader(v) === n) return v;
    if (normalizeHeader(labels[v]) === n) return v;
  }
  return null;
}

const LEAD_TYPES: LeadType[] = [
  "sponsor","investor","facility","sports_brand","coach","academy","captain","athlete",
  "community","tournament_organizer","strategic_partner","media_partner","corporate_partner","other",
];
const PIPELINES: PipelineKey[] = ["sponsor", "investor", "strategic_partnership", "user_acquisition"];
const TEMPS: Temperature[] = ["hot", "warm", "cold", "at_risk"];
const SOURCES: LeadSource[] = [
  "field_sales","referral","website","social_media","linkedin","instagram","facebook","whatsapp",
  "email","event","campaign","existing_network","investor_outreach","sponsor_outreach",
  "facility_outreach","organic","import","other",
];
const TEMP_LABELS = Object.fromEntries(TEMPS.map((t) => [t, TEMPERATURE_META[t].label])) as Record<Temperature, string>;
const PIPELINE_LABELS = Object.fromEntries(PIPELINES.map((p) => [p, PIPELINE_LABEL[p]])) as Record<PipelineKey, string>;

export interface RowResult {
  payload: Partial<Lead> | null;
  errors: string[];
  warnings: string[];
}

export function csvRowToLead(record: Record<string, string>): RowResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (k: string) => (record[k] ?? "").trim();

  const full_name = get("full_name");
  if (!full_name) errors.push("full_name is required");

  const payload: Partial<Lead> = { full_name, source: "import", pipeline: "sponsor" };

  for (const k of ["title", "email", "phone", "whatsapp", "linkedin_url", "company_name", "location_city", "location_country", "notes"] as const) {
    const v = get(k);
    if (v) (payload as Record<string, unknown>)[k] = v;
  }

  const leadType = get("lead_type");
  if (leadType) {
    const v = pickEnum(leadType, LEAD_TYPES, LEAD_TYPE_LABEL);
    if (v) payload.lead_type = v;
    else warnings.push(`lead_type "${leadType}" not recognized — using other`);
  }

  const pipeline = get("pipeline");
  if (pipeline) {
    const v = pickEnum(pipeline, PIPELINES, PIPELINE_LABELS);
    if (v) payload.pipeline = v;
    else warnings.push(`pipeline "${pipeline}" not recognized — using sponsor`);
  }

  const value = get("expected_value");
  if (value) {
    const n = Number(value.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n) && n >= 0) payload.expected_value = n;
    else warnings.push(`expected_value "${value}" ignored`);
  }

  const temp = get("temperature");
  if (temp) {
    const v = pickEnum(temp, TEMPS, TEMP_LABELS);
    if (v) payload.temperature = v;
    else warnings.push(`temperature "${temp}" not recognized — using warm`);
  }

  const priority = get("priority");
  if (priority) {
    const n = normalizeHeader(priority);
    if (n === "high" || n === "medium" || n === "low") payload.priority = n;
    else warnings.push(`priority "${priority}" not recognized — using medium`);
  }

  const source = get("source");
  if (source) {
    const v = pickEnum(source, SOURCES, LEAD_SOURCE_LABEL);
    if (v) payload.source = v;
    else warnings.push(`source "${source}" not recognized — using import`);
  }

  const follow = get("next_follow_up_at");
  if (follow) {
    const d = new Date(follow);
    if (!Number.isNaN(d.getTime())) payload.next_follow_up_at = d.toISOString();
    else warnings.push(`next_follow_up_at "${follow}" is not a valid date — skipped`);
  }

  return { payload: errors.length ? null : payload, errors, warnings };
}

// ---- export ----
export function leadsToCsvRows(leads: Lead[]): { headers: string[]; rows: unknown[][] } {
  const headers = [...LEAD_CSV_COLUMNS.map((c) => c.header), ...LEAD_CSV_EXPORT_EXTRA];
  const rows = leads.map((l) => [
    l.full_name,
    l.title ?? "",
    l.email ?? "",
    l.phone ?? "",
    l.whatsapp ?? "",
    l.linkedin_url ?? "",
    l.company_name ?? "",
    l.lead_type,
    l.pipeline,
    l.location_city ?? "",
    l.location_country ?? "",
    l.temperature,
    l.priority,
    l.source,
    l.expected_value ?? "",
    l.next_follow_up_at ? l.next_follow_up_at.slice(0, 10) : "",
    l.notes ?? "",
    l.id,
    l.stage,
    l.status,
    l.created_at,
    l.last_activity_at,
  ]);
  return { headers, rows };
}

export function leadCsvTemplate(): string {
  const headers = LEAD_CSV_COLUMNS.map((c) => c.header).join(",");
  const example = LEAD_CSV_COLUMNS.map((c) => {
    const v = c.example;
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
  return `${headers}\r\n${example}\r\n`;
}
