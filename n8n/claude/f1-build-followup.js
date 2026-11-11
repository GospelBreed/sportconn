// n8n Code node: "Build follow-up request"   Mode: Run Once for Each Item
// Input: one result from GET /emails/followups-due (after Split Out "results").
// Output: { followup, claude_body } -> "Claude: follow-up" HTTP node
// Then "Parse copy" (copy of c2-parse-copy.js with SOURCE = 'followup').
const MODEL = 'claude-opus-5-5';
const f = $input.item.json;
const isLast = Number(f.next_step) >= 3; // step 2 = first follow-up, step 3 = second (last)

const system = `You write short follow-up emails for SportConn, a Nigerian grassroots sports platform, to a person who hasn't answered an earlier partnership email.

The follow-up:
- Greet the person by first name.
- ${isLast
    ? 'This is the last follow-up. 40-70 words: briefly restate the idea in one line, say you will not keep following up, and leave the door open for later.'
    : '50-80 words: refer to the earlier email in one line, add one useful angle using only what the earlier email says, and ask again for a 15-minute call.'}
- Plain text, short paragraphs. No bullet points, markdown, emojis or links. No guilt-tripping ("just bumping this", "did you see my email?").
- Subject: "Re: " followed by the earlier subject exactly (don't add a second "Re:").
- End with the same sign-off as the earlier email.

Hard rules:
- Use only facts from the earlier email. Add no new claims, numbers or names.
- Never write square brackets or curly braces anywhere. The CRM rejects them as unfilled placeholders.
- No unsubscribe or opt-out line; the CRM adds one.

Also return: status "ready" (or "needs_research" with a reason in "missing" if the earlier email is unusable), partnership_concept (repeat the earlier idea in under 10 words), personalization_evidence (empty list), facts_to_verify (anything a person should check), and confidence from 0 to 1.`;

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

const content = `To: ${f.to_name || ''} at ${f.company}
Earlier email, sent ${f.previous_sent_at}:
Subject: ${f.previous_subject}
"""
${f.previous_body}
"""`;

return {
  json: {
    followup: { follow_up_of: f.follow_up_of, lead_id: f.lead_id, to: f.to },
    claude_body: {
      model: MODEL,
      max_tokens: 4000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content }],
    },
  },
};
