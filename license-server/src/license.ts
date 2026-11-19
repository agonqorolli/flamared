//! License keys, made the same way as app/src-tauri/src/license.rs reads them: a JSON record (who bought it, when,
//! and on renewed keys the last day of updates) signed with Ed25519, as `base64url(record).base64url(signature)`.
//! The private signing key is the 32-byte seed in ~/.flamared-keys/license-signing.key, given to the Worker as the
//! base64 secret LICENSE_SIGNING_KEY.

/** Who a license belongs to: the signed record in a key. Same fields as `Holder` in license.rs. */
export interface Holder {
  name: string;
  email: string;
  /** The order number, to look a buyer up (the Stripe payment). */
  id: string;
  /** The day it was made, YYYY-MM-DD. */
  issued: string;
  /** The last day whose new versions it covers, YYYY-MM-DD. Left out: a year after `issued`. */
  updates_until?: string;
}

/** The public half of the signing key: must match `PUBLIC_KEY` in license.rs (a test checks). */
export const PUBLIC_KEY = new Uint8Array([
  58, 219, 44, 3, 145, 130, 22, 149, 55, 4, 183, 43, 147, 9, 240, 76, 228, 171, 9, 83, 80, 136, 112, 252, 46, 169, 119,
  197, 220, 248, 5, 145,
]);

/** The fixed start of a PKCS#8 Ed25519 private key; the 32-byte seed follows it. */
const PKCS8_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The signing key from its base64 seed (the LICENSE_SIGNING_KEY secret). */
export async function signingKey(seedBase64: string): Promise<CryptoKey> {
  const seed = Uint8Array.from(atob(seedBase64.trim()), (c) => c.charCodeAt(0));
  if (seed.length !== 32) throw new Error("LICENSE_SIGNING_KEY must be the 32-byte seed in base64");
  const pkcs8 = new Uint8Array([...PKCS8_PREFIX, ...seed]);
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
}

/** A key for `holder`, signed with `key`. Fields are written in license.rs's order; `updates_until` only when set. */
export async function encode(holder: Holder, key: CryptoKey): Promise<string> {
  const { name, email, id, issued, updates_until } = holder;
  const fields = updates_until ? { name, email, id, issued, updates_until } : { name, email, id, issued };
  const record = new TextEncoder().encode(JSON.stringify(fields));
  const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", key, record));
  return `${toBase64Url(record)}.${toBase64Url(signature)}`;
}

/** Who a key belongs to, or null if it isn't one we signed. Spaces and line breaks are ignored, as in the app. */
export async function verify(key: string, publicKey: Uint8Array = PUBLIC_KEY): Promise<Holder | null> {
  const [record, signature, extra] = key.replace(/\s/g, "").split(".");
  if (!record || !signature || extra !== undefined) return null;
  try {
    const bytes = fromBase64Url(record);
    const verifier = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("Ed25519", verifier, fromBase64Url(signature), bytes))) return null;
    return JSON.parse(new TextDecoder().decode(bytes)) as Holder;
  } catch {
    return null;
  }
}

/** The last day of updates: the one written in the key, or a year after it was made. */
export function coveredUntil(holder: Holder): string {
  return holder.updates_until ?? aYearAfter(holder.issued);
}

/** The last day of updates for a renewal made on `today`: a year on from where the old key's updates end, or from
 * today if they have already ended, so renewing early loses nothing. Same as `renewed_until` in license.rs. */
export function renewedUntil(old: Holder, today: string): string {
  const until = coveredUntil(old);
  return aYearAfter(until > today ? until : today);
}

/** The same day a year later (Feb 29 becomes Feb 28), YYYY-MM-DD. */
export function aYearAfter(day: string): string {
  const match = DAY.exec(day);
  if (!match) throw new Error(`Not a day: ${day}`);
  const [, year, month, date] = match;
  const leapDay = month === "02" && date === "29";
  return `${Number(year) + 1}-${month}-${leapDay ? "28" : date}`;
}

/** Today in UTC, YYYY-MM-DD. */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** "Nov 15, 2026", for emails. */
export function longDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
