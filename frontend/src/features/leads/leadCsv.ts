import { normalizeHeader } from "@/lib/csv";
import {
  LEAD_SOURCE_LABEL,
  LEAD_STAGE_LABEL,
  PROPERTY_TYPE_LABEL,
  TEMPERATURE_META,
} from "@/lib/constants";
import type {
  Lead,
  LeadSource,
  LeadStage,
  LeadTemperature,
  PropertyType,
} from "@/types";

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
  { key: "phone", header: "phone", note: "Any format.", example: "(972) 555-0184" },
  { key: "linkedin_url", header: "linkedin_url", note: "Full URL.", example: "https://linkedin.com/in/sjohnson" },
  { key: "company_name", header: "company_name", note: "Management company.", example: "Titan Sports Group" },
  { key: "property_name", header: "property_name", note: "Facility name (free text).", example: "Downtown Sports Complex" },
  { key: "location_city", header: "location_city", note: "City.", example: "Plano" },
  { key: "location_state", header: "location_state", note: "2-letter state.", example: "TX" },
  { key: "unit_count", header: "unit_count", note: "Whole number ≥ 0.", example: "420" },
  {
    key: "asset_type",
    header: "asset_type",
    note: "One of: conventional, luxury, senior, affordable, mixed_use (labels like \"Senior Living\" also accepted). Default: conventional.",
    example: "conventional",
  },
  {
    key: "temperature",
    header: "temperature",
    note: "One of: hot, warm, cold. Default: warm.",
    example: "hot",
  },
  { key: "experience_score", header: "experience_score", note: "Integer 0–100. Blank allowed.", example: "68" },
  {
    key: "stage",
    header: "stage",
    note: 'One of: new_lead, contacted, qualified, discovery, proposal, pilot, closed_won, closed_lost (labels like "Discovery Call" also accepted). Default: new_lead.',
    example: "qualified",
  },
  {
    key: "source",
    header: "source",
    note: "One of: res_exp_check, cold_email, linkedin, referral, website, import, other. Default: import.",
    example: "cold_email",
  },
  { key: "estimated_arr", header: "estimated_arr", note: "Annual USD value. $ and commas are stripped. Default: 0.", example: "18000" },
  {
    key: "next_follow_up_at",
    header: "next_follow_up_at",
    note: "Date or datetime — YYYY-MM-DD, MM/DD/YYYY, or ISO 8601. Blank allowed.",
    example: "2025-10-15",
  },
  { key: "notes", header: "notes", note: "Free text.", example: "Downloaded checklist; wants to loop in Regional VP." },
];

// Columns added on export only (ignored on import).
export const LEAD_CSV_EXPORT_EXTRA = ["id", "created_at", "last_activity_at"];

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
  linkedin: "linkedin_url",
  linkedinurl: "linkedin_url",
  company: "company_name",
  companyname: "company_name",
  managementcompany: "company_name",
  organization: "company_name",
  account: "company_name",
  property: "property_name",
  propertyname: "property_name",
  community: "property_name",
  communityname: "property_name",
  city: "location_city",
  locationcity: "location_city",
  state: "location_state",
  locationstate: "location_state",
  units: "unit_count",
  unitcount: "unit_count",
  doors: "unit_count",
  assettype: "asset_type",
  type: "asset_type",
  temp: "temperature",
  temperature: "temperature",
  experiencescore: "experience_score",
  score: "experience_score",
  resexpscore: "experience_score",
  stage: "stage",
  pipelinestage: "stage",
  status: "stage",
  source: "source",
  leadsource: "source",
  channel: "source",
  arr: "estimated_arr",
  estimatedarr: "estimated_arr",
  value: "estimated_arr",
  annualvalue: "estimated_arr",
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

const ASSET_TYPES: PropertyType[] = ["conventional", "luxury", "senior", "affordable", "mixed_use"];
const TEMPS: LeadTemperature[] = ["hot", "warm", "cold"];
const STAGES: LeadStage[] = [
  "new_lead",
  "contacted",
  "qualified",
  "discovery",
  "proposal",
  "pilot",
  "closed_won",
  "closed_lost",
];
const SOURCES: LeadSource[] = [
  "res_exp_check",
  "cold_email",
  "linkedin",
  "referral",
  "website",
  "import",
  "other",
];
const TEMP_LABELS = Object.fromEntries(
  TEMPS.map((t) => [t, TEMPERATURE_META[t].label]),
) as Record<LeadTemperature, string>;

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

  const payload: Partial<Lead> = { full_name, source: "import" };

  for (const k of ["title", "email", "phone", "linkedin_url", "company_name", "property_name", "location_city", "location_state", "notes"] as const) {
    const v = get(k);
    if (v) (payload as Record<string, unknown>)[k] = v;
  }

  const units = get("unit_count");
  if (units) {
    const n = Number(units.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n) && n >= 0) payload.unit_count = Math.round(n);
    else warnings.push(`unit_count "${units}" ignored`);
  }

  const arr = get("estimated_arr");
  if (arr) {
    const n = Number(arr.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n) && n >= 0) payload.estimated_arr = n;
    else warnings.push(`estimated_arr "${arr}" ignored`);
  }

  const score = get("experience_score");
  if (score) {
    const n = Number(score.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n) && n >= 0 && n <= 100) payload.experience_score = Math.round(n);
    else warnings.push(`experience_score "${score}" ignored (need 0–100)`);
  }

  const at = get("asset_type");
  if (at) {
    const v = pickEnum(at, ASSET_TYPES, PROPERTY_TYPE_LABEL);
    if (v) payload.asset_type = v;
    else warnings.push(`asset_type "${at}" not recognized — using conventional`);
  }

  const temp = get("temperature");
  if (temp) {
    const v = pickEnum(temp, TEMPS, TEMP_LABELS);
    if (v) payload.temperature = v;
    else warnings.push(`temperature "${temp}" not recognized — using warm`);
  }

  const stage = get("stage");
  if (stage) {
    const v = pickEnum(stage, STAGES, LEAD_STAGE_LABEL);
    if (v) payload.stage = v;
    else warnings.push(`stage "${stage}" not recognized — using new_lead`);
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
    l.linkedin_url ?? "",
    l.company_name ?? "",
    l.property_name ?? "",
    l.location_city ?? "",
    l.location_state ?? "",
    l.unit_count ?? "",
    l.asset_type,
    l.temperature,
    l.experience_score ?? "",
    l.stage,
    l.source,
    l.estimated_arr ?? 0,
    l.next_follow_up_at ? l.next_follow_up_at.slice(0, 10) : "",
    l.notes ?? "",
    l.id,
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
