// n8n Code node: "Build scoring request"   Mode: Run Once for Each Item
// Input: the research reply (from "Paused?" false branch OR "Claude: research (resume)").
// Output: { ok, company_name, claude_body } -> IF ok -> "Claude: scoring" HTTP node
const MODEL = 'claude-opus-5-5';
const c = $('Build research request').item.json;
const res = $input.item.json;

if (res.error || res.stop_reason !== 'end_turn') {
  return { json: { ok: false, company_name: c.company_name, reason: `research stopped: ${res.stop_reason || 'error'}` } };
}
const dossier = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
const cited = [];
for (const b of res.content || []) {
  for (const ci of (b.type === 'text' && b.citations) || []) {
    if (ci.url && !cited.some((x) => x.url === ci.url)) cited.push({ url: ci.url, title: ci.title || '' });
  }
}
if (dossier.length < 200) {
  return { json: { ok: false, company_name: c.company_name, reason: 'research came back empty' } };
}

const system = `You turn a research dossier about one company into SportConn's prospect record and score it. SportConn is a Nigerian grassroots sports platform connecting players, team captains, sports facilities, coaches and academies; brands sponsor or partner with it to reach active, sports-loving Nigerians.

Use only what the dossier says. Anything marked NOT FOUND scores nothing; anything marked INFERRED counts for at most half.

Scores (whole numbers):
- audience (0-25): 21-25 core customers are young (16-35), urban, sports-engaged Nigerians; 13-20 mass-market consumers that include them; 6-12 partial overlap; 0-5 little overlap.
- marketing (0-20): 16-20 visible campaigns in Nigeria in the last 12 months across channels; 9-15 some recent activity; 1-8 little; 0 none found.
- partnership_evidence (0-15): 12-15 sports sponsorships in Nigeria in the last 3 years; 7-11 other sponsorships (music, events, education) or older sports deals; 1-6 occasional collaborations; 0 none found.
- collaboration (0-15): 12-15 runs youth, community or CSR programmes or invites partners; 6-11 some community activity or brand activations; 0-5 none found.
- decision_access (0-15): 12-15 a named, current marketing, brand, sponsorship or partnerships lead with a source from the last 24 months; 6-11 a relevant but less senior or older-sourced person, or a partnerships channel; 0-5 nobody identified.
- contact_quality (0-10): 8-10 a published business email for a decision maker or a partnerships address; 4-7 only a general company email, phone or LinkedIn; 0-3 nothing usable.

decision: "qualified" if the evidence supports outreach; "insufficient_evidence" if the dossier is too thin to score fairly; "not_qualified" otherwise. decision_reason: one sentence.
pipeline: "sponsor" for a paid sponsorship fit; "strategic_partnership" for a better fit as a co-marketing, distribution or non-cash partner.

company: name as the company presents itself in Nigeria; website = the confirmed official homepage (https://...), empty if not confirmed; country usually "Nigeria"; location = city of the Nigerian head office if known, else empty.

contacts (at most 5, best first): only people or channels in the dossier. email only if the dossier shows it as published, with email_source_url = the page it was published on; otherwise email and email_source_url are empty. Never write an address that is not in the dossier. email_source_type: company_website (their own site), linkedin, event, or other (press, directories). is_primary = true for exactly one contact: the best-placed decision maker who has an email, else the best-placed person. relevance: one line on why this person matters. Unknown fields are empty strings.

intelligence:
- company_overview, target_audience, business_objective (what they seem to want from marketing), partnership_gap (what they lack that SportConn could give), sportconn_opportunity (one concrete idea grounded in their audience and activity), potential_value (qualitative, e.g. "Large: national brand with active youth campaigns"; never invent naira amounts).
- marketing_activities and sponsorship_history: short items, each with its source URL in parentheses.
- verified_facts: facts read from sources, each with its URL in parentheses. assumptions: anything INFERRED.
- sources: every URL from the dossier that supports something you used, with a title and a short note on what it supports. Only http(s) URLs that appear in the dossier; never add new ones.

score_rationale: one short line per score explaining it.`;

const str = { type: 'string' };
const strList = { type: 'array', items: str };
const schema = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['qualified', 'not_qualified', 'insufficient_evidence'] },
    decision_reason: str,
    pipeline: { type: 'string', enum: ['sponsor', 'strategic_partnership'] },
    company: {
      type: 'object',
      properties: { name: str, website: str, industry: str, country: str, location: str },
      required: ['name', 'website', 'industry', 'country', 'location'],
      additionalProperties: false,
    },
    contacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          full_name: str, job_title: str, email: str, phone: str, linkedin: str, relevance: str,
          is_primary: { type: 'boolean' },
          email_source_url: str,
          email_source_type: { type: 'string', enum: ['company_website', 'linkedin', 'event', 'other'] },
        },
        required: ['full_name', 'job_title', 'email', 'phone', 'linkedin', 'relevance', 'is_primary', 'email_source_url', 'email_source_type'],
        additionalProperties: false,
      },
    },
    scores: {
      type: 'object',
      properties: {
        audience: { type: 'integer' }, marketing: { type: 'integer' }, partnership_evidence: { type: 'integer' },
        collaboration: { type: 'integer' }, decision_access: { type: 'integer' }, contact_quality: { type: 'integer' },
      },
      required: ['audience', 'marketing', 'partnership_evidence', 'collaboration', 'decision_access', 'contact_quality'],
      additionalProperties: false,
    },
    score_rationale: str,
    intelligence: {
      type: 'object',
      properties: {
        company_overview: str, target_audience: str, marketing_activities: strList, sponsorship_history: strList,
        business_objective: str, partnership_gap: str, sportconn_opportunity: str, potential_value: str,
        verified_facts: strList, assumptions: strList,
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: { url: str, title: str, note: str },
            required: ['url', 'title', 'note'],
            additionalProperties: false,
          },
        },
      },
      required: ['company_overview', 'target_audience', 'marketing_activities', 'sponsorship_history', 'business_objective',
        'partnership_gap', 'sportconn_opportunity', 'potential_value', 'verified_facts', 'assumptions', 'sources'],
      additionalProperties: false,
    },
  },
  required: ['decision', 'decision_reason', 'pipeline', 'company', 'contacts', 'scores', 'score_rationale', 'intelligence'],
  additionalProperties: false,
};

const citedList = cited.length ? `\n\nPages the research cited:\n${cited.map((x) => `${x.url} - ${x.title}`).join('\n')}` : '';
return {
  json: {
    ok: true,
    company_name: c.company_name,
    claude_body: {
      model: MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: `Company: ${c.company_name}\nCategory: ${c.category}\n\nDossier:\n${dossier}${citedList}` }],
    },
  },
};
