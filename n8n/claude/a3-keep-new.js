// n8n Code node: "Keep new candidates"   Mode: Run Once for All Items
// Input: the POST /leads/check response. Output: one item per company to research.
// Drops companies already in the CRM and anything on the do-not-contact list,
// and caps the list so a run doesn't research far more than it needs.
const OVERSHOOT = 1.5; // research ~1.5x the gap; some companies won't qualify

const res = $input.first().json;
const meta = $('Prepare check').first().json.meta;
const run = $('Start run').first().json;              // POST /runs response
const runId = run.run && run.run.id;
const remaining = (run.today && run.today.remaining) || 0;
const cap = Math.ceil(remaining * OVERSHOOT);

const out = [];
(res.results || []).forEach((r, i) => {
  if (r.match || r.domain_suppressed || r.email_suppressed) return;
  const c = meta[i];
  if (c && out.length < cap) out.push({ json: { ...c, run_id: runId } });
});
return out;
