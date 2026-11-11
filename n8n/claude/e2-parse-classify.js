// n8n Code node: "Parse classify"   Mode: Run Once for Each Item
// Output: { ok, reply_id, body } -> IF ok -> POST /replies/{{ $json.reply_id }}/classify
//   with body  {{ JSON.stringify($json.body) }}
function readClaude(res) {
  if (res.error) return { error: typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error)) };
  if (res.stop_reason === 'refusal') return { error: 'Claude declined this request' };
  if (res.stop_reason === 'max_tokens') return { error: 'Claude ran out of room (raise max_tokens)' };
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return { data: JSON.parse(text) }; } catch { return { error: 'Reply was not valid JSON' }; }
}
const reply_id = $('Build classify request').item.json.reply_id;
const r = readClaude($input.item.json);
if (r.error) return { json: { ok: false, reply_id, reason: r.error } };
return {
  json: {
    ok: true,
    reply_id,
    body: {
      classification: r.data.classification,
      summary: r.data.summary,
      suggested_response: r.data.suggested_response,
    },
  },
};
