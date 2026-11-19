import { describe, expect, it } from "vitest";
import worker, { buyLink, webhook } from "../src/index.ts";
import { verify } from "../src/license.ts";
import { outbox, session, stripeRequest, testEnv, testKeys } from "./helpers.ts";

const now = new Date("2026-11-19T12:00:00Z");

/** The license key in a sent email's text. */
function keyIn(text: string): string {
  return text.split("\n\n")[1];
}

describe("buying", () => {
  it("emails a key for the buyer and remembers the license", async () => {
    const { seed, publicKey } = await testKeys();
    const env = testEnv(seed);
    const box = outbox();
    const response = await webhook(await stripeRequest(session()), env, { send: box.send, now, publicKey });
    expect(response.status).toBe(200);
    expect(box.sent).toHaveLength(1);
    expect(box.sent[0].to).toBe("ada@example.com");
    expect(box.sent[0].subject).toBe("Your Flamared license key");
    expect(box.sent[0].text).toContain("updates until Nov 19, 2027");
    const holder = await verify(keyIn(box.sent[0].text), publicKey);
    expect(holder).toEqual({ name: "Ada Lovelace", email: "ada@example.com", id: "pi_1", issued: "2026-11-19" });
    expect(env.LICENSES.data.has("license:ada@example.com")).toBe(true);
  });

  it("uses the email as the name when Checkout has none", async () => {
    const { seed, publicKey } = await testKeys();
    const box = outbox();
    const paid = session({ customer_details: { email: "bob@example.com", name: null } });
    await webhook(await stripeRequest(paid), testEnv(seed), { send: box.send, now, publicKey });
    expect((await verify(keyIn(box.sent[0].text), publicKey))?.name).toBe("bob@example.com");
  });

  it("sends once when Stripe retries, and resends the same key if the email failed", async () => {
    const { seed, publicKey } = await testKeys();
    const env = testEnv(seed);
    const failing = {
      send: async () => {
        throw new Error("Resend is down");
      },
      now,
      publicKey,
    };
    await expect(webhook(await stripeRequest(session()), env, failing)).rejects.toThrow("Resend is down");
    const box = outbox();
    await webhook(await stripeRequest(session()), env, { send: box.send, now, publicKey });
    await webhook(await stripeRequest(session()), env, { send: box.send, now, publicKey });
    expect(box.sent).toHaveLength(1);
    const stored = JSON.parse(env.LICENSES.data.get("license:ada@example.com")!);
    expect(keyIn(box.sent[0].text)).toBe(stored.key);
  });

  it("ignores unpaid sessions, other links, other events and bad signatures", async () => {
    const { seed, publicKey } = await testKeys();
    const env = testEnv(seed);
    const box = outbox();
    const deps = { send: box.send, now, publicKey };
    await webhook(await stripeRequest(session({ payment_status: "unpaid" })), env, deps);
    await webhook(await stripeRequest(session({ payment_link: "plink_other" })), env, deps);
    await webhook(await stripeRequest(session(), "checkout.session.expired"), env, deps);
    const forged = await stripeRequest(session(), "checkout.session.completed", "whsec_wrong");
    expect((await webhook(forged, env, deps)).status).toBe(400);
    expect(box.sent).toHaveLength(0);
    expect(env.LICENSES.data.size).toBe(0);
  });

  it("fulfils a delayed payment when it succeeds", async () => {
    const { seed, publicKey } = await testKeys();
    const box = outbox();
    const delayed = await stripeRequest(
      session({ payment_status: "paid" }),
      "checkout.session.async_payment_succeeded",
    );
    await webhook(delayed, testEnv(seed), { send: box.send, now, publicKey });
    expect(box.sent).toHaveLength(1);
  });
});

describe("renewing", () => {
  async function bought() {
    const { seed, publicKey } = await testKeys();
    const env = testEnv(seed);
    await webhook(await stripeRequest(session()), env, { send: outbox().send, now, publicKey });
    return { env, publicKey };
  }

  const renewal = (overrides: Record<string, unknown> = {}) =>
    session({ id: "cs_test_2", payment_intent: "pi_2", payment_link: "plink_renew", ...overrides });

  it("finds the license by the checkout email and adds a year from where updates end", async () => {
    const { env, publicKey } = await bought();
    const box = outbox();
    const early = new Date("2027-06-01T12:00:00Z");
    await webhook(await stripeRequest(renewal()), env, { send: box.send, now: early, publicKey });
    expect(box.sent[0].subject).toBe("Your renewed Flamared license key");
    const holder = await verify(keyIn(box.sent[0].text), publicKey);
    expect(holder).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      id: "pi_2",
      issued: "2027-06-01",
      updates_until: "2028-11-19",
    });
  });

  it("renews from today once updates have ended, at the same price", async () => {
    const { env, publicKey } = await bought();
    const box = outbox();
    const late = new Date("2028-03-10T12:00:00Z");
    await webhook(await stripeRequest(renewal()), env, { send: box.send, now: late, publicKey });
    expect((await verify(keyIn(box.sent[0].text), publicKey))?.updates_until).toBe("2029-03-10");
  });

  it("uses the license email typed at checkout, ignoring case", async () => {
    const { env, publicKey } = await bought();
    const box = outbox();
    const other = renewal({
      customer_details: { email: "ada@work.example", name: "Ada L" },
      custom_fields: [{ key: "license_email", text: { value: " ADA@example.com " } }],
    });
    await webhook(await stripeRequest(other), env, { send: box.send, now, publicKey });
    expect(box.sent[0].to).toBe("ada@work.example");
    expect((await verify(keyIn(box.sent[0].text), publicKey))?.email).toBe("ada@example.com");
  });

  it("never renews twice for one order", async () => {
    const { env, publicKey } = await bought();
    const box = outbox();
    await webhook(await stripeRequest(renewal()), env, { send: box.send, now, publicKey });
    await webhook(await stripeRequest(renewal()), env, { send: box.send, now, publicKey });
    expect(box.sent).toHaveLength(1);
    expect(JSON.parse(env.LICENSES.data.get("license:ada@example.com")!).holder.updates_until).toBe("2028-11-19");
  });

  it("tells the buyer and the owner when no license is on record", async () => {
    const { seed, publicKey } = await testKeys();
    const box = outbox();
    await webhook(await stripeRequest(renewal()), testEnv(seed), { send: box.send, now, publicKey });
    expect(box.sent.map((email) => email.to)).toEqual(["ada@example.com", "owner@example.com"]);
    expect(box.sent[1].text).toContain("pi_2");
  });
});

describe("links", () => {
  it("adds the launch code to /buy through its last day", async () => {
    const env = { ...testEnv("x"), LAUNCH_CODE: "LAUNCH", LAUNCH_ENDS: "2026-12-19" };
    expect(buyLink(env, new Date("2026-12-19T23:00:00Z"))).toBe(
      "https://buy.stripe.com/test_buy?prefilled_promo_code=LAUNCH",
    );
    expect(buyLink(env, new Date("2026-12-20T00:00:00Z"))).toBe("https://buy.stripe.com/test_buy");
    expect(buyLink(testEnv("x"), now)).toBe("https://buy.stripe.com/test_buy");
  });

  it("redirects /buy and /renew, and 404s anything else", async () => {
    const env = testEnv("x");
    const buy = await worker.fetch(new Request("https://example.com/buy"), env);
    expect(buy.status).toBe(303);
    expect(buy.headers.get("Location")).toBe("https://buy.stripe.com/test_buy");
    const renew = await worker.fetch(new Request("https://example.com/renew"), env);
    expect(renew.headers.get("Location")).toBe("https://buy.stripe.com/test_renew");
    expect((await worker.fetch(new Request("https://example.com/"), env)).status).toBe(404);
  });
});
