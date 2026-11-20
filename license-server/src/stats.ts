//! Daily counts of what people do: downloads, Buy and Renew clicks, and keys sent. One KV record per day
//! (`count:YYYY-MM-DD` → `{ "download": 3, "buy": 1, … }`), read with `pnpm stats`. Nothing about who: no IPs, emails
//! or countries. Counting never gets in the way: a failed write is dropped, and two at the same instant may lose one.
import { today } from "./license.ts";

export type Event = "download" | "buy" | "renew" | "key_license" | "key_renewal";

export type DayCounts = Partial<Record<Event, number>>;

/** Adds one to today's count for `event`. Never throws. */
export async function count(kv: KVNamespace, event: Event, now = new Date()): Promise<void> {
  try {
    const key = `count:${today(now)}`;
    const day = (await kv.get<DayCounts>(key, "json")) ?? {};
    day[event] = (day[event] ?? 0) + 1;
    await kv.put(key, JSON.stringify(day));
  } catch {
    // A missed count isn't worth failing a download or a sale over.
  }
}
