// Prints the daily counts the server keeps (src/stats.ts): downloads, Buy and Renew clicks, keys sent, per day and in
// total, from the live KV store. Run with `pnpm stats` after `npx wrangler login`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COLUMNS = [
  ["download", "Downloads"],
  ["buy", "Buy clicks"],
  ["renew", "Renew clicks"],
  ["key_license", "Licenses sold"],
  ["key_renewal", "Renewals sold"],
];

const wrangler = (...args) =>
  execFileSync("npx", ["wrangler", ...args, "--binding", "LICENSES", "--remote"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

const keys = JSON.parse(wrangler("kv", "key", "list", "--prefix", "count:")).map((k) => k.name);
if (keys.length === 0) {
  console.log("Nothing counted yet.");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "flamared-stats-"));
try {
  const file = join(dir, "keys.json");
  writeFileSync(file, JSON.stringify(keys));
  const got = JSON.parse(wrangler("kv", "bulk", "get", file));
  const days = keys.sort().map((key) => {
    const raw = got[key];
    const counts = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
    return [key.slice("count:".length), counts];
  });
  const totals = {};
  const rows = days.map(([date, counts]) => {
    for (const [name] of COLUMNS) totals[name] = (totals[name] ?? 0) + (counts[name] ?? 0);
    return [date, ...COLUMNS.map(([name]) => String(counts[name] ?? 0))];
  });
  rows.push(["Total", ...COLUMNS.map(([name]) => String(totals[name]))]);
  const header = ["Day", ...COLUMNS.map(([, label]) => label)];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  console.log(line(header));
  for (const row of rows) console.log(line(row));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
