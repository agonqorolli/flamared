import rust from "../../app/src-tauri/src/license.rs?raw";
import { describe, expect, it } from "vitest";
import { aYearAfter, coveredUntil, encode, PUBLIC_KEY, renewedUntil, signingKey, verify } from "../src/license.ts";
import { testKeys } from "./helpers.ts";

const holder = { name: "Ada Lovelace", email: "ada@example.com", id: "pi_1", issued: "2026-11-19" };

describe("keys", () => {
  it("uses the same public key as the app", () => {
    const block = /const PUBLIC_KEY: \[u8; 32\] = \[([^\]]+)\]/.exec(rust)![1];
    expect([...PUBLIC_KEY]).toEqual(
      block
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map(Number),
    );
  });

  it("signs a key its public key accepts, with the record in the app's field order", async () => {
    const { seed, publicKey } = await testKeys();
    const key = await encode(holder, await signingKey(seed));
    expect(await verify(key, publicKey)).toEqual(holder);
    const record = atob(key.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"));
    expect(record).toBe('{"name":"Ada Lovelace","email":"ada@example.com","id":"pi_1","issued":"2026-11-19"}');
  });

  it("writes updates_until last, only when set", async () => {
    const { seed, publicKey } = await testKeys();
    const renewed = { ...holder, updates_until: "2028-11-19" };
    const key = await encode(renewed, await signingKey(seed));
    expect(await verify(key, publicKey)).toEqual(renewed);
    expect(atob(key.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).toMatch(/"updates_until":"2028-11-19"}$/);
  });

  it("refuses forged, foreign and junk keys, and ignores line breaks", async () => {
    const mine = await testKeys();
    const theirs = await testKeys();
    const key = await encode(holder, await signingKey(mine.seed));
    const [, signature] = key.split(".");
    const forged = `${btoa(JSON.stringify({ ...holder, name: "Mallory" })).replace(/=+$/, "")}.${signature}`;
    expect(await verify(forged, mine.publicKey)).toBeNull();
    expect(await verify(key, theirs.publicKey)).toBeNull();
    expect(await verify("not a key", mine.publicKey)).toBeNull();
    expect(await verify(`${key}.extra`, mine.publicKey)).toBeNull();
    const wrapped = key.replace(/(.{60})/g, "$1\n  ");
    expect(await verify(wrapped, mine.publicKey)).toEqual(holder);
  });

  it("refuses a signing key that isn't a 32-byte seed", async () => {
    await expect(signingKey(btoa("short"))).rejects.toThrow(/32-byte/);
  });
});

describe("a year of updates", () => {
  it("defaults to a year after the key was made", () => {
    expect(coveredUntil(holder)).toBe("2027-11-19");
    expect(coveredUntil({ ...holder, updates_until: "2027-01-01" })).toBe("2027-01-01");
  });

  it("turns Feb 29 into Feb 28", () => {
    expect(aYearAfter("2028-02-29")).toBe("2029-02-28");
    expect(aYearAfter("2027-12-31")).toBe("2028-12-31");
  });

  it("renews from where updates end when early, from today when late", () => {
    expect(renewedUntil(holder, "2027-06-01")).toBe("2028-11-19");
    expect(renewedUntil(holder, "2027-11-19")).toBe("2028-11-19");
    expect(renewedUntil(holder, "2028-03-10")).toBe("2029-03-10");
  });
});
