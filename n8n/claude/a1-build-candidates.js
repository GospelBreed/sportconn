// n8n Code node: "Build candidates request"   Mode: Run Once for Each Item
// Input item: { category: "Fintech", count: 20 }  (from the "Categories" node)
// Output: { category, claude_body } -> "Claude: candidates" HTTP node
const MODEL = 'claude-opus-5-5';
const EXCLUDE = []; // industries SportConn won't approach, e.g. ['betting and gambling', 'tobacco']

const { category, count = 20 } = $input.item.json;

const system = `You build prospect lists for SportConn, a Nigerian sports platform that connects grassroots and amateur players, team captains, sports facilities, coaches and academies. SportConn looks for brands that could sponsor or partner with it to reach active, sports-loving Nigerians.

List real companies that operate in Nigeria in the category you are given and that plausibly market to young Nigerian consumers or communities.

Rules:
- Only companies you are confident exist and are trading in Nigeria today. Fewer good names beat a long list.
- website is the company's own homepage (https://...). If you are not sure of the exact domain, return an empty string. Never guess or construct a domain.
- One entry per company. Use the Nigerian business where one exists (the local subsidiary, not the global parent).
- why: one sentence on why this company could sponsor or partner with grassroots sport. No invented facts.${EXCLUDE.length ? `\n- Leave out: ${EXCLUDE.join('; ')}.` : ''}`;

const schema = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company_name: { type: 'string' },
          website: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['company_name', 'website', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
};

return {
  json: {
    category,
    claude_body: {
      model: MODEL,
      max_tokens: 8000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: `Category: ${category}\nReturn up to ${count} companies.` }],
    },
  },
};
