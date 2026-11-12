// NeverBounce single-address check (API v4.2), shared by email-engine (/run)
// and mcp-server (record_contact_source). The answer is stored with
// sportconn.email_verify_record (migration 0011), which maps it to the CRM's
// verification statuses. Docs: https://developers.neverbounce.com/reference/single-check

export const NEVERBOUNCE_RESULTS = ["valid", "invalid", "disposable", "catchall", "unknown"] as const;
export type NeverBounceResult = (typeof NEVERBOUNCE_RESULTS)[number];

export type CheckOutcome =
  | { ok: true; result: NeverBounceResult }
  // fatal: the key is wrong / the account can't check — stop checking, nothing will work
  | { ok: false; error: string; fatal: boolean };

const ENDPOINT = "https://api.neverbounce.com/v4.2/single/check";

/** Request URL. URLSearchParams encodes "@" and "+" as NeverBounce asks. */
export function checkUrl(apiKey: string, email: string, timeoutSeconds = 15): string {
  const q = new URLSearchParams({ key: apiKey, email: email.trim(), timeout: String(timeoutSeconds) });
  return `${ENDPOINT}?${q}`;
}

/** Turn NeverBounce's HTTP status + JSON body into an outcome. Never echoes the key. */
export function interpretCheck(httpStatus: number, body: unknown): CheckOutcome {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const status = typeof b.status === "string" ? b.status : "";
  const message = typeof b.message === "string" ? b.message.slice(0, 200) : "";
  const result = typeof b.result === "string" ? b.result.toLowerCase() : "";

  if (httpStatus >= 200 && httpStatus < 300 && status === "success" &&
      (NEVERBOUNCE_RESULTS as readonly string[]).includes(result)) {
    return { ok: true, result: result as NeverBounceResult };
  }
  if (status === "auth_failure" || status === "bad_referrer" || httpStatus === 401 || httpStatus === 403) {
    return { ok: false, fatal: true, error: `NeverBounce refused the API key${message ? `: ${message}` : ""}` };
  }
  if (/credit/i.test(message)) {
    return { ok: false, fatal: true, error: `NeverBounce: ${message}` };
  }
  return {
    ok: false,
    fatal: false,
    error: `NeverBounce ${status || `HTTP ${httpStatus}`}${message ? `: ${message}` : ""}`,
  };
}

/** One check. Network errors and timeouts come back as a non-fatal outcome. */
export async function checkAddress(
  apiKey: string,
  email: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 25_000,
): Promise<CheckOutcome> {
  try {
    const res = await fetchFn(checkUrl(apiKey, email), { signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json().catch(() => ({}));
    return interpretCheck(res.status, body);
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return {
      ok: false,
      fatal: false,
      error: name === "TimeoutError" || name === "AbortError" ? "NeverBounce took too long to answer" : "Couldn't reach NeverBounce",
    };
  }
}
