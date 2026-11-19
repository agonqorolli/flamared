import { hmacHex } from "../src/stripe.ts";
import type { Env } from "../src/index.ts";
import type { Email } from "../src/email.ts";

/** A fresh Ed25519 key pair: the base64 seed (as LICENSE_SIGNING_KEY holds it) and the raw public key. */
export async function testKeys(): Promise<{ seed: string; publicKey: Uint8Array }> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  const publicKey = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  return { seed: btoa(String.fromCharCode(...pkcs8.slice(-32))), publicKey };
}

/** An in-memory stand-in for the KV namespace (get, get as json, put). */
export function memoryKv(): KVNamespace & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key: string, type?: string) {
      const value = data.get(key) ?? null;
      return value !== null && type === "json" ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
  } as unknown as KVNamespace & { data: Map<string, string> };
}

export const WEBHOOK_SECRET = "whsec_test_secret";

export function testEnv(seed: string, kv = memoryKv()): Env & { LICENSES: ReturnType<typeof memoryKv> } {
  return {
    LICENSES: kv,
    LICENSE_SIGNING_KEY: seed,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    RESEND_API_KEY: "re_test",
    BUY_LINK: "https://buy.stripe.com/test_buy",
    BUY_LINK_ID: "plink_buy",
    RENEW_LINK: "https://buy.stripe.com/test_renew",
    RENEW_LINK_ID: "plink_renew",
    FROM_EMAIL: "Flamared <licenses@flamared.com>",
    OWNER_EMAIL: "owner@example.com",
  };
}

/** A signed webhook request for a Checkout Session event. */
export async function stripeRequest(
  session: Record<string, unknown>,
  type = "checkout.session.completed",
  secret = WEBHOOK_SECRET,
): Promise<Request> {
  const body = JSON.stringify({ id: `evt_${Math.random()}`, type, data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const signature = await hmacHex(secret, `${t}.${body}`);
  return new Request("https://example.com/stripe/webhook", {
    method: "POST",
    body,
    headers: { "Stripe-Signature": `t=${t},v1=${signature}` },
  });
}

export function session(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cs_test_1",
    payment_link: "plink_buy",
    payment_status: "paid",
    payment_intent: "pi_1",
    customer_details: { email: "ada@example.com", name: "Ada Lovelace" },
    custom_fields: [],
    ...overrides,
  };
}

/** A sender that records what it would have sent. */
export function outbox(): { sent: Email[]; send: (email: Email) => Promise<void> } {
  const sent: Email[] = [];
  return { sent, send: async (email) => void sent.push(email) };
}
