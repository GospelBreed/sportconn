// n8n Code node: "Build copy request"   Mode: Run Once for Each Item
// Input: an "After upsert" item with created = true and copy set.
// Output: { claude_body } -> "Claude: copy" HTTP node
const MODEL = 'claude-opus-5-5';

// ---- EDIT THESE TWO BLOCKS ONCE --------------------------------------------
// The ONLY things the email may say about SportConn. Keep every line true and
// current; add real numbers (members, facilities, cities, past partners) only
// if they are accurate. Remove the EDIT ME line when done.
const ABOUT_SPORTCONN = `EDIT ME
SportConn (sportconn.com) is a Nigerian sports platform that connects grassroots and amateur players, team captains, sports facilities, coaches and academies.
Brands work with SportConn to reach active, sports-loving young Nigerians.`;

// Exactly how the email ends (name, role, company). Plain text.
const SIGN_OFF = `EDIT ME
SportConn`;
// -----------------------------------------------------------------------------

if (ABOUT_SPORTCONN.includes('EDIT ME') || SIGN_OFF.includes('EDIT ME')) {
  throw new Error('Fill in ABOUT_SPORTCONN and SIGN_OFF in the "Build copy request" node first.');
}

const x = $input.item.json.copy;

const system = `You write first-touch partnership emails for SportConn: one email, to one person, about one idea.

About SportConn (the only things you may say about SportConn):
${ABOUT_SPORTCONN}

The email:
- Greet the person by first name ("Hello Ada,").
- Body of 100-160 words. Plain text, short paragraphs. No bullet points, markdown, emojis or links.
- Open with one specific, verified fact about their company (a campaign, sponsorship, audience or programme) and why it matters to us. Never open with "I hope this email finds you well" or with praise that has no fact behind it.
- Offer one concrete partnership idea that connects what they already do to SportConn.
- Ask for one easy next step: a 15-minute call in the next two weeks.
- End with exactly this sign-off:
${SIGN_OFF}
- Subject: under 8 words, specific to them, no hype, no ALL CAPS, never "Partnership opportunity".
- Sound like a person: warm, direct, Nigerian business English. No sales clichés ("synergy", "leverage", "game-changer", "revolutionary").

Hard rules:
- Use only the research's verified facts, marketing activities and sponsorship history. Never present anything from assumptions, or anything marked INFERRED, as fact. Never invent numbers, names, results or partners, for them or for SportConn.
- Never write square brackets or curly braces anywhere in the subject or body. The CRM rejects them as unfilled placeholders.
- No unsubscribe or opt-out line; the CRM adds one.
- If there is no verified, company-specific fact worth opening with, or no clear reason this company fits, set status to "needs_research", say what is missing in "missing", and leave subject and body empty.

Also return:
- partnership_concept: the idea in under 10 words.
- personalization_evidence: each company-specific fact you used, with its source URL.
- facts_to_verify: anything in the email a person should double-check before it goes out (names, titles, dates, campaign names).
- confidence: a number from 0 to 1 for how sure you are that every statement is accurate and the idea fits.`;

const str = { type: 'string' };
const schema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ready', 'needs_research'] },
    missing: str,
    subject: str,
    body: str,
    partnership_concept: str,
    personalization_evidence: { type: 'array', items: str },
    facts_to_verify: { type: 'array', items: str },
    confidence: { type: 'number' },
  },
  required: ['status', 'missing', 'subject', 'body', 'partnership_concept', 'personalization_evidence', 'facts_to_verify', 'confidence'],
  additionalProperties: false,
};

const brief = {
  recipient: { name: x.to_name, job_title: x.job_title },
  company: x.company,
  pipeline: x.pipeline,
  research: x.intelligence,
};

return {
  json: {
    claude_body: {
      model: MODEL,
      max_tokens: 8000,
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: `Write the email from this brief:\n${JSON.stringify(brief, null, 2)}` }],
    },
  },
};
