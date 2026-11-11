// n8n Code node: "Parse scoring"   Mode: Run Once for Each Item
// Input: the "Claude: scoring" reply. Output:
//   { ok, company_name, total, reason, upsert_body, eligibility[], copy_input }
//   -> IF ok -> POST /leads/upsert with body  {{ JSON.stringify($json.upsert_body) }}
const MIN_SCORE = 65; // same as the CRM's ENGINE_MIN_SCORE

// Lawful basis recorded for an address the company itself published for a
// business role. This is SportConn's policy decision, not the AI's: change it
// to 'none_recorded' if management hasn't agreed legitimate interest.
const BASIS_FOR_PUBLISHED = 'legitimate_interest';

function readClaude(res) {
  if (res.error) return { error: typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error)) };
  if (res.stop_reason === 'refusal') return { error: 'Claude declined this request' };
  if (res.stop_reason === 'max_tokens') return { error: 'Claude ran out of room (raise max_tokens)' };
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return { data: JSON.parse(text) }; } catch { return { error: 'Reply was not valid JSON' }; }
}
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined));
const isUrl = (u) => /^https?:\/\/\S+$/i.test(u || '');
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

const c = $('Build research request').item.json;
const fail = (reason, extra = {}) => ({ json: { ok: false, company_name: c.company_name, reason, ...extra } });

const r = readClaude($input.item.json);
if (r.error) return fail(r.error);
const d = r.data;

const LIMITS = { audience: 25, marketing: 20, partnership_evidence: 15, collaboration: 15, decision_access: 15, contact_quality: 10 };
const scores = {};
for (const [k, max] of Object.entries(LIMITS)) scores[k] = Math.max(0, Math.min(max, Math.round(Number(d.scores[k]) || 0)));
const total = Object.values(scores).reduce((a, b) => a + b, 0);

if (d.decision !== 'qualified') return fail(`${d.decision}: ${d.decision_reason}`, { total });
if (total < MIN_SCORE) return fail(`below threshold (${total})`, { total });
if (!isUrl(d.company.website)) return fail('no confirmed website', { total });
const sources = (d.intelligence.sources || []).filter((s) => isUrl(s.url));
if (!sources.length) return fail('no sources', { total });

// Contacts: drop any email without a published source page.
const contacts = (d.contacts || []).filter((x) => (x.full_name || '').trim()).slice(0, 5).map((x) => {
  const ok = isEmail(x.email) && isUrl(x.email_source_url);
  return { ...x, email: ok ? x.email.trim().toLowerCase() : '' };
});
if (contacts.length && !contacts.some((x) => x.is_primary)) contacts[0].is_primary = true;
let primarySeen = false;
for (const x of contacts) { if (x.is_primary && !primarySeen) primarySeen = true; else x.is_primary = false; }

const lagosToday = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const upsert_body = {
  pipeline: d.pipeline,
  run_id: c.run_id,
  company: clean({ ...d.company, country: d.company.country || 'Nigeria' }),
  contacts: contacts.map(({ email_source_url, email_source_type, ...rest }) => clean(rest)),
  scores,
  intelligence: { ...d.intelligence, research_date: lagosToday, sources },
  notes: `AI scoring (${total}/100): ${d.score_rationale}`,
};

const eligibility = contacts.filter((x) => x.email).map((x) => ({
  email: x.email,
  source_type: x.email_source_type,
  source_url: x.email_source_url,
  lawful_basis: ['company_website', 'other'].includes(x.email_source_type) ? BASIS_FOR_PUBLISHED : 'none_recorded',
  basis_note: `Business address published for their role (${x.job_title || 'contact'}) at ${x.email_source_url}`,
  // Replace with a real result from an email-verification service (ZeroBounce,
  // NeverBounce...). "unverified" keeps the contact in pending review.
  verification: { status: 'unverified' },
}));

const p = contacts.find((x) => x.is_primary && x.email);
const copy_input = p ? {
  to: p.email,
  to_name: p.full_name,
  job_title: p.job_title,
  company: upsert_body.company,
  pipeline: d.pipeline,
  intelligence: upsert_body.intelligence,
} : null;

return { json: { ok: true, company_name: c.company_name, total, upsert_body, eligibility, copy_input } };
