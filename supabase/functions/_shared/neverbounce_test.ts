import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkAddress, checkUrl, interpretCheck } from "./neverbounce.ts";

Deno.test("request URL encodes the address", () => {
  const u = new URL(checkUrl("k123", " ada+sponsors@kuda.com "));
  assertEquals(u.origin + u.pathname, "https://api.neverbounce.com/v4.2/single/check");
  assertEquals(u.searchParams.get("email"), "ada+sponsors@kuda.com");
  assertEquals(u.searchParams.get("key"), "k123");
  assertEquals(u.searchParams.get("timeout"), "15");
  assertStringIncludes(checkUrl("k", "a+b@x.ng"), "a%2Bb%40x.ng");
});

Deno.test("answers", () => {
  for (const r of ["valid", "invalid", "disposable", "catchall", "unknown"] as const) {
    assertEquals(interpretCheck(200, { status: "success", result: r, flags: [] }), { ok: true, result: r });
  }
  assertEquals(interpretCheck(200, { status: "success", result: "Valid" }), { ok: true, result: "valid" });
});

Deno.test("failures", () => {
  const auth = interpretCheck(200, { status: "auth_failure", message: "Invalid API key" });
  assertEquals(auth.ok, false);
  assertEquals(!auth.ok && auth.fatal, true);
  const credits = interpretCheck(200, { status: "general_failure", message: "Insufficient credits" });
  assertEquals(!credits.ok && credits.fatal, true);
  const busy = interpretCheck(200, { status: "temp_unavail", message: "Try again" });
  assertEquals(!busy.ok && busy.fatal, false);
  assertEquals(!busy.ok && busy.error, "NeverBounce temp_unavail: Try again");
  const http = interpretCheck(503, {});
  assertEquals(!http.ok && http.fatal, false);
  // unknown result word is not trusted
  assertEquals(interpretCheck(200, { status: "success", result: "maybe" }).ok, false);
});

Deno.test("network trouble is a temporary failure, and the key never appears in errors", async () => {
  const boom = (() => Promise.reject(new TypeError("dns"))) as unknown as typeof fetch;
  const out = await checkAddress("secret-key", "a@b.ng", boom);
  assertEquals(out, { ok: false, fatal: false, error: "Couldn't reach NeverBounce" });

  const ok = ((_u: string) => Promise.resolve(new Response(JSON.stringify({ status: "success", result: "catchall" })))) as unknown as typeof fetch;
  assertEquals(await checkAddress("secret-key", "a@b.ng", ok), { ok: true, result: "catchall" });

  const denied = (() => Promise.resolve(new Response(JSON.stringify({ status: "auth_failure", message: "bad key" })))) as unknown as typeof fetch;
  const d = await checkAddress("secret-key", "a@b.ng", denied);
  assertEquals(!d.ok && d.error.includes("secret-key"), false);
});
