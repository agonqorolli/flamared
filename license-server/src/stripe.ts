//! Checking that a webhook really came from Stripe: the `Stripe-Signature` header carries a timestamp and an
//! HMAC-SHA256 of `timestamp.body` made with the endpoint's signing secret (whsec_…). No Stripe API key is needed.

/** How old a signed event may be, in seconds, before it's refused (Stripe's own default). */
const TOLERANCE = 300;

/** The parts of a Checkout Session the server reads. */
export interface CheckoutSession {
  id: string;
  payment_link: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  payment_intent: string | null;
  customer_details: { email: string | null; name: string | null } | null;
  custom_fields: { key: string; text?: { value: string | null } | null }[];
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: CheckoutSession };
}

/** The event in `body` if `header` is a valid, recent signature of it with `secret`, otherwise null. */
export async function verifyEvent(
  body: string,
  header: string | null,
  secret: string,
  now = Date.now() / 1000,
): Promise<StripeEvent | null> {
  if (!header) return null;
  const parts = header.split(",").map((part) => part.split("=", 2) as [string, string]);
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(timestamp) || signatures.length === 0 || Math.abs(now - timestamp) > TOLERANCE) return null;
  const expected = await hmacHex(secret, `${timestamp}.${body}`);
  if (!signatures.some((signature) => sameText(signature, expected))) return null;
  return JSON.parse(body) as StripeEvent;
}

/** HMAC-SHA256 of `message` with `secret`, in hex. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares without stopping at the first difference, so timing doesn't hint at the right signature. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
