//! Flamared's license server, a Cloudflare Worker. It does three things:
//!   GET  /buy             sends the buyer to the Stripe Payment Link for a license (with the launch code while it runs)
//!   GET  /renew           sends the buyer to the Payment Link for a renewal
//!   POST /stripe/webhook  on a paid sale, signs a license key and emails it to the buyer
//! Licenses are remembered in KV by email, so a renewal finds the buyer's current key without asking for it.
import { keyEmail, ownerAlert, renewalNotFound, resend, type Send } from "./email.ts";
import { coveredUntil, encode, type Holder, PUBLIC_KEY, renewedUntil, signingKey, today, verify } from "./license.ts";
import { type CheckoutSession, verifyEvent } from "./stripe.ts";

export interface Env {
  LICENSES: KVNamespace;
  // Secrets (wrangler secret put).
  LICENSE_SIGNING_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string;
  /** Where "a renewal needs a hand" alerts go: a secret so the address stays out of the public repo. */
  OWNER_EMAIL: string;
  // Settings (wrangler.jsonc vars).
  BUY_LINK: string;
  BUY_LINK_ID: string;
  RENEW_LINK: string;
  RENEW_LINK_ID: string;
  FROM_EMAIL: string;
  REPLY_TO?: string;
  /** A Stripe promotion code added to /buy while the launch price runs, until LAUNCH_ENDS (YYYY-MM-DD, last day). */
  LAUNCH_CODE?: string;
  LAUNCH_ENDS?: string;
}

/** A license on record: who it's for and the latest key sent. */
interface Stored {
  holder: Holder;
  key: string;
}

/** An order already handled: the key made for it and whether the email went out, so a retry never makes a second
 * key (a renewal made twice would add two years). */
interface Order {
  to: string;
  key: string | null;
  updatesUntil: string | null;
  renewal: boolean;
  emailed: boolean;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/buy") return Response.redirect(buyLink(env), 303);
    if (request.method === "GET" && pathname === "/renew") return Response.redirect(env.RENEW_LINK, 303);
    if (request.method === "POST" && pathname === "/stripe/webhook") {
      return webhook(request, env, { send: resend(env.RESEND_API_KEY, env.FROM_EMAIL, env.REPLY_TO) });
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/** The license Payment Link, with the launch code filled in while the launch price runs. */
export function buyLink(env: Env, now = new Date()): string {
  const launch = env.LAUNCH_CODE && env.LAUNCH_ENDS && today(now) <= env.LAUNCH_ENDS;
  return launch ? `${env.BUY_LINK}?prefilled_promo_code=${encodeURIComponent(env.LAUNCH_CODE!)}` : env.BUY_LINK;
}

/** What the webhook uses from outside; tests swap in their own. */
export interface Deps {
  send: Send;
  now?: Date;
  /** The key the app checks keys with; every key made is checked against it before it's sent. */
  publicKey?: Uint8Array;
}

export async function webhook(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await request.text();
  const event = await verifyEvent(body, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!event) return new Response("Bad signature", { status: 400 });
  const session = event.data.object;
  const paid =
    (event.type === "checkout.session.completed" && session.payment_status === "paid") ||
    event.type === "checkout.session.async_payment_succeeded";
  const renewal = session.payment_link === env.RENEW_LINK_ID;
  if (!paid || (!renewal && session.payment_link !== env.BUY_LINK_ID)) return new Response("Ignored");
  await fulfil(session, renewal, env, { now: new Date(), publicKey: PUBLIC_KEY, ...deps });
  return new Response("OK");
}

/** Makes and emails the key for a paid order, once; a retry resends the same key if the email didn't go out. */
async function fulfil(session: CheckoutSession, renewal: boolean, env: Env, deps: Required<Deps>): Promise<void> {
  const { send } = deps;
  const orderKey = `order:${session.id}`;
  const done = await env.LICENSES.get<Order>(orderKey, "json");
  if (done?.emailed) return;
  const id = session.payment_intent ?? session.id;
  const order = done ?? (await makeKey(session, renewal, env, id, deps));
  await env.LICENSES.put(orderKey, JSON.stringify(order));
  if (order.key && order.updatesUntil) {
    await send(keyEmail(order.to, order.key, order.updatesUntil, order.renewal, id));
  } else {
    const buyer = order.to;
    await send(renewalNotFound(buyer, id));
    await send(ownerAlert(env.OWNER_EMAIL, id, buyer, licenseEmail(session) ?? buyer));
  }
  await env.LICENSES.put(orderKey, JSON.stringify({ ...order, emailed: true }));
}

/** Signs the key for an order and records the license; for a renewal with no license on record, no key. */
async function makeKey(
  session: CheckoutSession,
  renewal: boolean,
  env: Env,
  id: string,
  deps: Required<Deps>,
): Promise<Order> {
  const day = today(deps.now);
  const to = session.customer_details?.email;
  if (!to) throw new Error(`Checkout ${session.id} has no email`);
  let holder: Holder;
  if (renewal) {
    const old = await env.LICENSES.get<Stored>(licenseKey(licenseEmail(session) ?? to), "json");
    if (!old) return { to, key: null, updatesUntil: null, renewal, emailed: false };
    holder = { ...old.holder, id, issued: day, updates_until: renewedUntil(old.holder, day) };
  } else {
    holder = { name: session.customer_details?.name?.trim() || to, email: to, id, issued: day };
  }
  const key = await encode(holder, await signingKey(env.LICENSE_SIGNING_KEY));
  if (!(await verify(key, deps.publicKey)))
    throw new Error("Made a key the app wouldn't accept: LICENSE_SIGNING_KEY doesn't match");
  await env.LICENSES.put(licenseKey(holder.email), JSON.stringify({ holder, key } satisfies Stored));
  return { to, key, updatesUntil: coveredUntil(holder), renewal, emailed: false };
}

/** The email a renewal buyer typed for their license, when it differs from the one they paid with. */
function licenseEmail(session: CheckoutSession): string | null {
  const value = session.custom_fields.find((field) => field.key === "license_email")?.text?.value?.trim();
  return value || null;
}

function licenseKey(email: string): string {
  return `license:${email.trim().toLowerCase()}`;
}
