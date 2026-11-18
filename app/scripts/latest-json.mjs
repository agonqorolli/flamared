// Writes latest.json, the file the app's updater reads to learn the newest version, from a signed release build.
// Run after `pnpm tauri build --target <target>` (see the `releases` skill); upload latest.json and the
// .app.tar.gz to the GitHub release tagged v<version>.
//
//   node scripts/latest-json.mjs [target]      target: universal-apple-darwin (default) or aarch64-apple-darwin
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REPO = "agonqorolli/flamared"; // the endpoint in tauri.conf.json ("plugins.updater") points here too
const TARGET = process.argv[2] ?? "universal-apple-darwin";

// Which updater platforms a build serves: a universal build runs on both kinds of Mac.
const PLATFORMS = {
  "universal-apple-darwin": ["darwin-aarch64", "darwin-x86_64"],
  "aarch64-apple-darwin": ["darwin-aarch64"],
  "x86_64-apple-darwin": ["darwin-x86_64"],
};

const appDir = path.resolve(import.meta.dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(appDir, "src-tauri/tauri.conf.json"), "utf8"));
const bundleDir = path.join(appDir, "src-tauri/target", TARGET, "release/bundle/macos");

const archive = fs.existsSync(bundleDir) && fs.readdirSync(bundleDir).find((name) => name.endsWith(".app.tar.gz"));
if (!PLATFORMS[TARGET] || !archive) {
  console.error(`No signed build in ${bundleDir}. Build it first: pnpm tauri build --target ${TARGET}`);
  process.exit(1);
}

const signature = fs.readFileSync(path.join(bundleDir, `${archive}.sig`), "utf8").trim();
// GitHub turns spaces in an uploaded file's name into dots.
const url = `https://github.com/${REPO}/releases/download/v${version}/${archive.replaceAll(" ", ".")}`;
const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms: Object.fromEntries(PLATFORMS[TARGET].map((platform) => [platform, { signature, url }])),
};

const out = path.join(bundleDir, "latest.json");
fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${out}\nUpload it and "${archive}" to the release v${version} on github.com/${REPO}.`);
