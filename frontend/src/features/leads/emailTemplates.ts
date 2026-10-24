// Starting points from the SportConn Sponsorship Acquisition SOP (§6).
// {first_name}, {company} and {sender} are filled in automatically; anything in
// [square brackets] must be personalised before the email can be sent.

export interface EmailTemplate {
  key: string;
  label: string;
  subject: string;
  body: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: "first_contact",
    label: "First contact (Day 1)",
    subject: "Brand partnership opportunity with SportConn",
    body: `Hello {first_name},

I'm reaching out from SportConn, a Nigerian sports technology platform connecting sports enthusiasts through interactive experiences and sports-related services.

We are developing our sponsored Predict & Win Challenge, designed to help brands engage football fans through match-related participation, promotional placements, and measurable campaign activity.

Given {company}'s focus on [relevant product, audience, or business objective], I believe there may be an opportunity to explore a small pilot together.

Would you be open to a 15-minute conversation next week? I can share a short campaign concept and our verified audience data beforehand.

Best regards,
{sender}
SportConn
www.sportconn.com`,
  },
  {
    key: "follow_up_idea",
    label: "Follow-up with an idea (Day 4)",
    subject: "A Predict & Win idea for {company}",
    body: `Hello {first_name},

Following up on my note last week. Here is one way {company} could take part in the Predict & Win Challenge:

[One or two lines on the specific activation — placement, prize, and what the brand gets.]

Would a 15-minute call next week be useful to see if this fits your plans?

Best regards,
{sender}
SportConn`,
  },
  {
    key: "meeting_or_referral",
    label: "Meeting or referral (Day 12)",
    subject: "Right person for brand partnerships at {company}?",
    body: `Hello {first_name},

I wanted to check whether a football fan engagement pilot fits {company}'s priorities this quarter.

If partnerships sit with someone else on your team, I'd be grateful if you could point me to the right person.

Thank you,
{sender}
SportConn`,
  },
  {
    key: "close_loop",
    label: "Final follow-up (Day 18)",
    subject: "Closing the loop",
    body: `Hello {first_name},

I haven't wanted to crowd your inbox, so this is my last note for now. If a sponsored fan engagement campaign becomes relevant for {company} later in the year, I'd be glad to pick this up again.

Best regards,
{sender}
SportConn`,
  },
  {
    key: "after_meeting",
    label: "After a meeting",
    subject: "SportConn × {company} — proposed next steps",
    body: `Hello {first_name},

Thank you for your time today.

Based on our conversation, the main opportunity appears to be [agreed business objective]. We will develop a proposal covering:

- Target audience and campaign concept
- Proposed placements and deliverables
- Campaign duration and implementation plan
- Investment and payment terms
- Reporting and success measures

I will share the proposal by [agreed date]. Please let me know if there are any internal requirements or additional stakeholders we should consider.

Best regards,
{sender}
SportConn`,
  },
];

export function fillTemplate(text: string, vars: { first_name: string; company: string; sender: string }): string {
  return text
    .replace(/\{first_name\}/g, vars.first_name)
    .replace(/\{company\}/g, vars.company)
    .replace(/\{sender\}/g, vars.sender);
}

/** Unfilled [placeholders] left in a draft. */
export function openPlaceholders(text: string): string[] {
  return Array.from(new Set(text.match(/\[[^\]\n]{2,120}\]/g) ?? []));
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Same parsing as the send-email function: a field may hold several addresses. */
export function addressesIn(value?: string | null): string[] {
  return (value ?? "").match(EMAIL_RE)?.map((a) => a.toLowerCase()) ?? [];
}
