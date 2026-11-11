// n8n Code node: "Run summary"   Mode: Run Once for All Items
// Connect it from "Parse scoring" as the LOWEST branch on the canvas, so n8n
// runs it after the upsert/email branches above it have finished.
// Output: one item -> PATCH /runs/{{ $json.run_id }} with body
//   {{ JSON.stringify($json.patch) }}
const run = $('Start run').first().json;
const scored = $input.all().map((i) => i.json);
const upserts = $('After upsert').isExecuted ? $('After upsert').all().map((i) => i.json) : [];
const skippedResearch = $('Build scoring request').isExecuted
  ? $('Build scoring request').all().map((i) => i.json).filter((j) => !j.ok) : [];

const created = upserts.filter((u) => u.ok && u.action === 'created').length;
const updated = upserts.filter((u) => u.ok && u.action === 'updated').length;
const duplicate = upserts.filter((u) => !u.ok && u.error === 'duplicate').length;
const rejected = scored.filter((s) => !s.ok).length + upserts.filter((u) => !u.ok && u.error !== 'duplicate').length;
const errors = [
  ...skippedResearch.map((j) => `${j.company_name}: ${j.reason}`),
  ...upserts.filter((u) => !u.ok).map((u) => `${u.company_name}: ${u.error} ${u.message}`.trim()),
].slice(0, 50);

const target = (run.today && run.today.remaining) || 0;
return [{
  json: {
    run_id: run.run.id,
    patch: {
      status: created >= target ? 'completed' : 'partial',
      created_count: created,
      updated_count: updated,
      duplicate_count: duplicate,
      rejected_count: rejected,
      notes: `Researched ${scored.length + skippedResearch.length}, qualified ${created + updated}.`,
      errors,
    },
  },
}];
