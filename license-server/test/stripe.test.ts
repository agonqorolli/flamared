import { describe, expect, it } from "vitest";
import { hmacHex, verifyEvent } from "../src/stripe.ts";

const secret = "whsec_test_secret";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });

async function header(t: number, payload = body, key = secret): Promise<string> {
  return `t=${t},v1=${await hmacHex(key, `${t}.${payload}`)}`;
}

describe("webhook signatures", () => {
  const now = 1_800_000_000;

  it("accepts a recent event signed with the secret", async () => {
    expect((await verifyEvent(body, await header(now - 10), secret, now))?.id).toBe("evt_1");
  });

  it("accepts any matching v1 signature when Stripe sends several", async () => {
    const good = await header(now);
    const both = `t=${now},v1=${"0".repeat(64)},${good.split(",")[1]}`;
    expect(await verifyEvent(body, both, secret, now)).not.toBeNull();
  });

  it("refuses a changed body, another secret, an old event and a missing header", async () => {
    expect(await verifyEvent(body.replace("evt_1", "evt_2"), await header(now), secret, now)).toBeNull();
    expect(await verifyEvent(body, await header(now, body, "whsec_other"), secret, now)).toBeNull();
    expect(await verifyEvent(body, await header(now - 301), secret, now)).toBeNull();
    expect(await verifyEvent(body, null, secret, now)).toBeNull();
    expect(await verifyEvent(body, "t=abc,v1=def", secret, now)).toBeNull();
  });
});
