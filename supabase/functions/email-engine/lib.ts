// Pure helpers for the email-engine function (no I/O, no env) — unit-tested in lib_test.ts.

export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** `"Jude Okafor at SportConn" <address from emailFrom>`; falls back to emailFrom. */
export function fromFor(emailFrom: string, senderName: string | null | undefined): string {
  const address = emailFrom.match(/<([^>]+)>/)?.[1] ?? emailFrom.trim();
  const name = (senderName ?? "").replace(/["<>\\\r\n]/g, "").trim();
  return name ? `"${name} at SportConn" <${address}>` : emailFrom;
}

/**
 * Plain-text body + an opt-out line written the way a person would, pointing
 * at the CRM's confirm page. (No "--" divider or marketing wording: Gmail
 * reads those as bulk mail.)
 */
export function withFooter(body: string, appUrl: string, token: string): string {
  return `${body.trimEnd()}\n\nIf this isn't relevant, just reply "no thanks" or use this link and I won't contact you again: ${appUrl}/unsubscribe?t=${token}`;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Svix webhook signature (used by Resend): base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)),
 * header "v1,<sig> v1,<sig2>"; timestamps older/newer than `toleranceSeconds` are refused.
 */
export async function verifySvix(
  secret: string,
  id: string,
  timestamp: string,
  payload: string,
  signatureHeader: string,
  nowSeconds = Date.now() / 1000,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!secret || !id || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  let keyBytes: Uint8Array;
  try {
    keyBytes = b64ToBytes(secret.replace(/^whsec_/, ""));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  const expected = bytesToB64(mac);
  return signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1] ?? "")
    .some((sig) => sig.length > 0 && safeEqual(sig, expected));
}
