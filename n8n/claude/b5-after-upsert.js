// n8n Code node: "After upsert"   Mode: Run Once for Each Item
// Input: the POST /leads/upsert response (HTTP node set to "Never Error").
// Output: { ok, created, lead_id, eligibility[], copy } -> IF ok
const s = $('Parse scoring').item.json;
const r = $input.item.json;
if (!r.ok) {
  return { json: { ok: false, created: false, company_name: s.company_name, error: r.error || 'upsert_failed', message: r.message || '' } };
}
return {
  json: {
    ok: true,
    created: r.action === 'created',
    action: r.action,
    lead_id: r.lead_id,
    score: r.score,
    company_name: s.company_name,
    eligibility: s.eligibility.map((e) => ({ ...e, lead_id: r.lead_id })),
    copy: s.copy_input ? { ...s.copy_input, lead_id: r.lead_id, run_id: s.upsert_body.run_id } : null,
  },
};
