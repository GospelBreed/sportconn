// deno test supabase/functions/email-engine/lib_test.ts
import { fromFor, safeEqual, verifySvix, withFooter } from "./lib.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// Svix's published test vector.
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TS = "1614265330";
const PAYLOAD = '{"test": 2432232314}';
const SIG = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";

Deno.test("svix: valid signature", async () => {
  assert(await verifySvix(SECRET, ID, TS, PAYLOAD, SIG, Number(TS)), "known vector should verify");
});

Deno.test("svix: one of several signatures matches", async () => {
  assert(await verifySvix(SECRET, ID, TS, PAYLOAD, `v1,AAAA ${SIG}`, Number(TS)), "second signature should match");
});

Deno.test("svix: tampered payload, wrong id, stale timestamp, bad secret", async () => {
  assert(!(await verifySvix(SECRET, ID, TS, '{"test": 1}', SIG, Number(TS))), "tampered payload");
  assert(!(await verifySvix(SECRET, "msg_other", TS, PAYLOAD, SIG, Number(TS))), "wrong id");
  assert(!(await verifySvix(SECRET, ID, TS, PAYLOAD, SIG, Number(TS) + 3600)), "stale timestamp");
  assert(!(await verifySvix("whsec_" + btoa("other-secret"), ID, TS, PAYLOAD, SIG, Number(TS))), "other secret");
  assert(!(await verifySvix("whsec_###", ID, TS, PAYLOAD, SIG, Number(TS))), "malformed secret");
  assert(!(await verifySvix(SECRET, ID, TS, PAYLOAD, "", Number(TS))), "no signature");
});

Deno.test("fromFor: sender name, fallback, header injection", () => {
  const from = "SportConn Partnerships <partnerships@contact.sportconn.com>";
  assert(fromFor(from, "Jude Okafor") === `"Jude Okafor at SportConn" <partnerships@contact.sportconn.com>`, "named sender");
  assert(fromFor(from, null) === from, "fallback");
  assert(!/[\r\n<>"]/.test(fromFor(from, 'Evil" <x@y.com>\r\nBcc: z').slice(1, -40)), "injection stripped");
});

Deno.test("withFooter: personal opt-out line with the link, at the end", () => {
  const out = withFooter("Hello Ada,\n\nThanks.\n\n", "https://crm.example.com", "tok-123");
  assert(out.startsWith(`Hello Ada,\n\nThanks.\n\nIf this isn't relevant, just reply "no thanks"`), "body kept, trailing space trimmed");
  assert(!out.includes("\n--\n"), "no signature divider");
  assert(out.endsWith("https://crm.example.com/unsubscribe?t=tok-123"), "link at the end");
});

Deno.test("safeEqual", () => {
  assert(safeEqual("abc", "abc") && !safeEqual("abc", "abd") && !safeEqual("abc", "abcd"), "comparisons");
});
