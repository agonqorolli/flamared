import { describe, expect, it } from "vitest";
import worker, { webhook } from "../src/index.ts";
import { count } from "../src/stats.ts";
import { memoryKv, outbox, session, stripeRequest, testEnv, testKeys } from "./helpers.ts";

const day = (env: { LICENSES: ReturnType<typeof memoryKv> }, date: string) =>
  JSON.parse(env.LICENSES.data.get(`count:${date}`) ?? "{}");

describe("counting", () => {
  it("adds up events per day", async () => {
    const kv = memoryKv();
    const now = new Date("2026-11-20T10:00:00Z");
    await count(kv, "download", now);
    await count(kv, "download", now);
    await count(kv, "buy", now);
    await count(kv, "download", new Date("2026-11-21T10:00:00Z"));
    expect(JSON.parse(kv.data.get("count:2026-11-20")!)).toEqual({ download: 2, buy: 1 });
    expect(JSON.parse(kv.data.get("count:2026-11-21")!)).toEqual({ download: 1 });
  });

  it("never throws when KV fails", async () => {
    const broken = {
      get: async () => {
        throw new Error("KV is down");
      },
    } as unknown as KVNamespace;
    await expect(count(broken, "download")).resolves.toBeUndefined();
  });

  it("counts /download, /buy and /renew, and redirects /download to the newest DMG", async () => {
    const env = testEnv("x");
    const download = await worker.fetch(new Request("https://example.com/download"), env);
    expect(download.status).toBe(303);
    expect(download.headers.get("Location")).toBe("https://github.com/example/releases/latest/download/Flamared.dmg");
    await worker.fetch(new Request("https://example.com/buy"), env);
    await worker.fetch(new Request("https://example.com/renew"), env);
    // Without an ExecutionContext the counts aren't awaited; let them land.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(day(env, new Date().toISOString().slice(0, 10))).toEqual({ download: 1, buy: 1, renew: 1 });
  });

  it("counts a key once it's emailed, by kind, and not again on a retry", async () => {
    const { seed, publicKey } = await testKeys();
    const env = testEnv(seed);
    const now = new Date("2026-11-20T12:00:00Z");
    const deps = { send: outbox().send, now, publicKey };
    await webhook(await stripeRequest(session()), env, deps);
    await webhook(await stripeRequest(session()), env, deps);
    const renewal = session({ id: "cs_test_2", payment_intent: "pi_2", payment_link: "plink_renew" });
    await webhook(await stripeRequest(renewal), env, deps);
    expect(day(env, "2026-11-20")).toEqual({ key_license: 1, key_renewal: 1 });
  });

  it("doesn't count a key whose email failed", async () => {
    const { seed, publicKey } = await testKeys();
    const env = testEnv(seed);
    const failing = {
      send: async () => {
        throw new Error("Resend is down");
      },
      now: new Date("2026-11-20T12:00:00Z"),
      publicKey,
    };
    await expect(webhook(await stripeRequest(session()), env, failing)).rejects.toThrow();
    expect(day(env, "2026-11-20")).toEqual({});
  });
});
