// Pure helpers for the connector's email actions (queue_email,
// list_email_events). No I/O here, so they're covered by email_test.ts.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same list as sportconn.is_generic_inbox (migration 0010).
const GENERIC_INBOXES = ["info", "hello", "admin", "contact", "support"];
export function isGenericInbox(email: string): boolean {
  return GENERIC_INBOXES.includes(email.trim().toLowerCase().split("@")[0]);
}

// The CRM's draft errors (engine_create_draft) → the connector's codes.
const QUEUE_ERRORS: Record<string, string> = {
  suppressed: "do_not_email",
  address_not_on_lead: "recipient_mismatch",
  already_queued: "duplicate",
  already_followed_up: "duplicate",
  recently_contacted: "person_spacing",
  follow_up_too_soon: "person_spacing",
  lead_closed: "lead_closed",
  replied: "replied",
  max_followups: "sequence_limit",
  follow_up_not_due: "sequence_order",
  follow_up_mismatch: "recipient_mismatch",
  follow_up_of_not_found: "invalid_input",
  lead_not_found: "invalid_input",
  missing_lead_id: "invalid_input",
  invalid_request: "invalid_input",
  invalid_run_id: "invalid_input",
  invalid_confidence: "invalid_input",
  missing_content: "invalid_input",
  too_long: "invalid_input",
  unfilled_placeholders: "invalid_input",
  needs_research: "invalid_input",
};
export function mapQueueError(code: string): string {
  return QUEUE_ERRORS[code] ?? code;
}

// A reply's own words: drop quoted lines and everything from the quoted header on.
export function stripQuoted(text: string | null | undefined): string {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^On .{4,200}wrote:$/i.test(t) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(t) ||
        (/^From:\s.+/i.test(t) && out.some((l) => l.trim()))) break;
    if (t.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

// ---- Lagos time (UTC+1 all year, no daylight saving) ----------------------
const LAGOS_MS = 3600_000;
const DAY_MS = 86_400_000;

/** UTC instant of Lagos midnight for the Lagos day containing `d`, shifted by `days`. */
export function lagosMidnight(d: Date, days = 0): Date {
  const local = d.getTime() + LAGOS_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - LAGOS_MS + days * DAY_MS);
}
/** ISO weekday 1 (Mon) … 7 (Sun) of the Lagos day containing `d`. */
export function lagosIsoDow(d: Date): number {
  const dow = new Date(d.getTime() + LAGOS_MS).getUTCDay();
  return dow === 0 ? 7 : dow;
}
export function toLagosIso(d: Date): string {
  return new Date(d.getTime() + LAGOS_MS).toISOString().replace(/\.\d{3}Z$/, "+01:00");
}
/** Start (Lagos midnight) of the n-th most recent business day, today counted as the first. */
export function businessDaysStart(now: Date, n: number, sendDays: number[] = [1, 2, 3, 4, 5]): Date {
  let found = 0;
  for (let i = 0; i < 60; i++) {
    const day = lagosMidnight(now, -i);
    if (sendDays.includes(lagosIsoDow(day))) found++;
    if (found >= n) return day;
  }
  return lagosMidnight(now, -60);
}

export interface SendSettings {
  daily_send_limit: number;
  send_days: number[];
  send_hour_start: number;
  send_hour_end: number;
  sending_paused: boolean;
}

/**
 * Rough time an approved email at `position` in the queue (1 = next) goes out,
 * given today's sends. Ignores the per-company limit; null if sending is
 * paused or the limit is 0.
 */
export function estimateSendTime(now: Date, s: SendSettings, sentToday: number, position: number): string | null {
  if (s.sending_paused || s.daily_send_limit <= 0) return null;
  let remaining = Math.max(1, position);
  for (let i = 0; i < 60; i++) {
    const midnight = lagosMidnight(now, i);
    if (!s.send_days.includes(lagosIsoDow(midnight))) continue;
    const open = new Date(midnight.getTime() + s.send_hour_start * 3600_000);
    const close = new Date(midnight.getTime() + s.send_hour_end * 3600_000);
    let capacity = s.daily_send_limit;
    let slot = open;
    if (i === 0) {
      if (now >= close) continue;
      capacity = Math.max(0, s.daily_send_limit - sentToday);
      if (now > open) slot = now;
    }
    if (remaining <= capacity) return toLagosIso(slot);
    remaining -= capacity;
  }
  return null;
}
