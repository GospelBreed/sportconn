import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  businessDaysStart, estimateSendTime, isGenericInbox, lagosIsoDow, lagosMidnight, mapQueueError, stripQuoted, toLagosIso,
} from "./email.ts";

const S = { daily_send_limit: 80, send_days: [1, 2, 3, 4, 5], send_hour_start: 9, send_hour_end: 17, sending_paused: false };

Deno.test("generic inboxes", () => {
  assertEquals(isGenericInbox("Info@Kuda.com"), true);
  assertEquals(isGenericInbox("support@x.ng"), true);
  assertEquals(isGenericInbox("partnerships@x.ng"), false);
  assertEquals(isGenericInbox("ada@x.ng"), false);
});

Deno.test("error codes", () => {
  assertEquals(mapQueueError("suppressed"), "do_not_email");
  assertEquals(mapQueueError("address_not_on_lead"), "recipient_mismatch");
  assertEquals(mapQueueError("already_queued"), "duplicate");
  assertEquals(mapQueueError("recently_contacted"), "person_spacing");
  assertEquals(mapQueueError("too_long"), "invalid_input");
  assertEquals(mapQueueError("something_new"), "something_new");
});

Deno.test("reply text without quoted history", () => {
  const t = "Thanks Olajide – can we talk next week?\n\nAda\n\nOn Tue, 12 Nov 2026 at 09:15, Olajide <x@y.com> wrote:\n> Hello Ada,\n> ...";
  assertEquals(stripQuoted(t), "Thanks Olajide – can we talk next week?\n\nAda");
  assertEquals(stripQuoted("Yes please\r\n> quoted"), "Yes please");
  assertEquals(stripQuoted("Sure\n-----Original Message-----\nFrom: a"), "Sure");
  assertEquals(stripQuoted(null), "");
});

Deno.test("Lagos dates", () => {
  // 2026-11-11 23:30 UTC = 2026-11-12 00:30 Lagos (Thursday)
  const d = new Date("2026-11-11T23:30:00Z");
  assertEquals(lagosMidnight(d).toISOString(), "2026-11-11T23:00:00.000Z");
  assertEquals(lagosIsoDow(d), 4);
  assertEquals(toLagosIso(new Date("2026-11-12T08:15:00Z")), "2026-11-12T09:15:00+01:00");
  // Monday: last 5 business days start the previous Tuesday
  assertEquals(toLagosIso(businessDaysStart(new Date("2026-11-16T10:00:00Z"), 5)), "2026-11-10T00:00:00+01:00");
});

Deno.test("send-time estimate", () => {
  const wedMorning = new Date("2026-11-11T06:00:00Z"); // 07:00 Lagos, Wednesday
  assertEquals(estimateSendTime(wedMorning, S, 0, 1), "2026-11-11T09:00:00+01:00");
  const wedNoon = new Date("2026-11-11T11:00:00Z");     // 12:00 Lagos
  assertEquals(estimateSendTime(wedNoon, S, 10, 5), "2026-11-11T12:00:00+01:00");
  // today full → next business day
  assertEquals(estimateSendTime(wedNoon, S, 80, 1), "2026-11-12T09:00:00+01:00");
  // Friday evening → Monday
  const friEvening = new Date("2026-11-13T17:00:00Z");  // 18:00 Lagos
  assertEquals(estimateSendTime(friEvening, S, 0, 1), "2026-11-16T09:00:00+01:00");
  // position beyond one day's capacity rolls on
  assertEquals(estimateSendTime(wedMorning, S, 0, 81), "2026-11-12T09:00:00+01:00");
  assertEquals(estimateSendTime(wedMorning, { ...S, sending_paused: true }, 0, 1), null);
});
