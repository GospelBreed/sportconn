// n8n Code node: "Parse copy"   Mode: Run Once for Each Item
// Works for both the first email ("Build copy request" -> "Claude: copy") and
// follow-ups ("Build follow-up request" -> "Claude: follow-up"): set SOURCE.
// Output: { ok, reason, draft } -> IF ok -> POST /emails/draft with body
//   {{ JSON.stringify($json.draft) }}
const SOURCE = 'first'; // 'first' or 'followup'

function readClaude(res) {
  if (res.error) return { error: typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error)) };
  if (res.stop_reason === 'refusal') return { error: 'Claude declined this request' };
  if (res.stop_reason === 'max_tokens') return { error: 'Claude ran out of room (raise max_tokens)' };
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return { data: JSON.parse(text) }; } catch { return { error: 'Reply was not valid JSON' }; }
}
// Same checks the CRM runs, so a bad draft is caught here with a clear reason.
const hasPlaceholders = (t) => /\[[^\]\n]{2,120}\]/.test(t) || /NEEDS_RESEARCH/i.test(t) || /\{[a-z_]{2,40}\}/.test(t);

const r = readClaude($input.item.json);
if (r.error) return { json: { ok: false, reason: r.error } };
const d = r.data;
if (d.status === 'needs_research') return { json: { ok: false, reason: `needs research: ${d.missing}` } };

const subject = (d.subject || '').trim();
const body = (d.body || '').trim();
if (!subject || !body) return { json: { ok: false, reason: 'empty subject or body' } };
if (hasPlaceholders(subject) || hasPlaceholders(body)) return { json: { ok: false, reason: 'placeholder text in the email' } };
if (subject.length > 200 || body.length > 6000) return { json: { ok: false, reason: 'too long' } };
const confidence = Math.max(0, Math.min(1, Number(d.confidence) || 0));

let draft;
if (SOURCE === 'followup') {
  const f = $('Build follow-up request').item.json.followup;
  draft = { follow_up_of: f.follow_up_of, lead_id: f.lead_id, to: f.to, subject, body, confidence,
            facts_to_verify: d.facts_to_verify || [] };
} else {
  const x = $('After upsert').item.json.copy;
  draft = { lead_id: x.lead_id, to: x.to, run_id: x.run_id, subject, body, confidence,
            partnership_concept: d.partnership_concept || '',
            personalization_evidence: d.personalization_evidence || [],
            facts_to_verify: d.facts_to_verify || [] };
}
return { json: { ok: true, words: body.split(/\s+/).length, draft } };
