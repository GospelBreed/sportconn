// n8n Code node: "Prepare check"   Mode: Run Once for All Items
// Input: the "Claude: candidates" responses. Output: one item -> POST /leads/check
// HTTP body:  {{ JSON.stringify({ candidates: $json.candidates }) }}

function readClaude(res) {
  if (res.error) return { error: typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error)) };
  if (res.stop_reason === 'refusal') return { error: 'Claude declined this request' };
  if (res.stop_reason === 'max_tokens') return { error: 'Claude ran out of room (raise max_tokens)' };
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return { data: JSON.parse(text) }; } catch { return { error: 'Reply was not valid JSON' }; }
}

const builds = $('Build candidates request').all();
const seen = new Set();
const meta = [];
$input.all().forEach((item, i) => {
  const r = readClaude(item.json);
  if (r.error) return;
  const category = builds[i] ? builds[i].json.category : '';
  for (const c of r.data.candidates || []) {
    const name = (c.company_name || '').trim();
    if (!name) continue;
    const website = /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(c.website || '') ? c.website.trim() : '';
    const key = website
      ? website.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#].*$/, '')
      : name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    meta.push({ company_name: name, website, category, why: c.why || '' });
  }
});

const batch = meta.slice(0, 200); // /leads/check takes up to 200
return [{
  json: {
    candidates: batch.map((c) => (c.website ? { company_name: c.company_name, website: c.website } : { company_name: c.company_name })),
    meta: batch,
  },
}];
