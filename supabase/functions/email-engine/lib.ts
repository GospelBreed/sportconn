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

/** Reply-To for a queue email: a per-message capture address, else the approver. */
export function replyAddress(replyDomain: string, replyToken: string | null | undefined, senderEmail: string | null | undefined): string | undefined {
  if (replyDomain && replyToken) return `reply+${replyToken}@${replyDomain}`;
  return senderEmail ?? undefined;
}

/** Crude but safe HTML → text for replies that arrive without a text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The copy of a reply forwarded to the approver / owner. */
export function forwardText(r: { from: string; company: string; text: string; leadUrl: string }): string {
  return [
    `${r.from}${r.company ? ` (${r.company})` : ""} replied to a SportConn email.`,
    `Reply to this message to answer them directly. It's saved on the lead: ${r.leadUrl}`,
    "",
    "----------",
    r.text.slice(0, 15000),
  ].join("\n");
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
