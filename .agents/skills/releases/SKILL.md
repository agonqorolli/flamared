---
name: releases
description: Shipping a new version of the app — the version number, the signed macOS build, latest.json and the GitHub release the built-in updater reads, the update signing key and why it must be backed up, and how the in-app update check works (lib/updates.tsx, Settings → About). Use when bumping the version, building or publishing a release, or changing update code or the updater config in tauri.conf.json.
---

# Releases and updates

The app updates itself from the **GitHub releases of `agonqorolli/flamared`**: it reads
`https://github.com/agonqorolli/flamared/releases/latest/download/latest.json` (`plugins.updater.endpoints` in
`tauri.conf.json`). That only works once the repo is **public**; while it is private every check fails quietly.

## The update signing key

- Private: `~/.flamared-keys/updater-signing.key` (no password). Public: `updater-signing.key.pub`, copied into
  `plugins.updater.pubkey` in `tauri.conf.json`.
- Every update must be signed with it. **Lose it and installed copies can never update again**: people would have to
  download a new build by hand. Back it up with the license signing key, somewhere off this Mac.
- Never print, paste or commit it. Pass it to the build by path, as below.

## Shipping a version

1. **Version** in three places, the same everywhere: `app/src-tauri/tauri.conf.json` (the one the app and updater
   read), `app/src-tauri/Cargo.toml`, `app/package.json`. First public release: `1.0.0`; fixes bump the last part,
   features the middle one.
2. **Build**, signed, for both kinds of Mac (once: `rustup target add x86_64-apple-darwin`):
   ```bash
   cd app && TAURI_SIGNING_PRIVATE_KEY="$HOME/.flamared-keys/updater-signing.key" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" pnpm tauri build --target universal-apple-darwin
   ```
   `bundle.createUpdaterArtifacts` makes it write `<App>.app.tar.gz` and its `.sig` next to the `.app`; without the
   key in the environment the build stops at that step.
   The build is stamped with the day it was made (`build.rs`), and a license covers versions made while its updates
   last (see the `license-keys` skill): bumping the version is what makes the stamp fresh, so never ship a build
   without it.
3. **latest.json**: `cd app && node scripts/latest-json.mjs` (pass `aarch64-apple-darwin` for an Apple-silicon-only
   build). It reads the version and the signature and writes `latest.json` in the bundle's `macos/` folder.
4. **Release** on GitHub tagged `v<version>`, with the `.app.tar.gz`, `latest.json` and the `.dmg` people download:
   ```bash
   gh release create v1.0.0 "src-tauri/target/universal-apple-darwin/release/bundle/macos/"{"Flamared.app.tar.gz",latest.json} src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
   ```
   The updater follows `releases/latest`, so a draft or pre-release reaches nobody until it is published as latest.

Renaming the app or the repo: change the endpoint in `tauri.conf.json`, `REPO` in `scripts/latest-json.mjs` and
`REPO_URL` in `app/src/brand.ts` together (GitHub redirects a renamed repo, but don't rely on it).

## The app icon

One source, `app/src-tauri/icons/app-icon.svg` (1024×1024, the macOS rounded-square grid). After changing it, rebuild every size with `cd app && pnpm tauri icon src-tauri/icons/app-icon.svg`, then delete the `android/`, `ios/` and `64x64.png` it also writes (not used). Check it in a built app: `pnpm tauri build --debug --bundles app -c '{"bundle":{"createUpdaterArtifacts":false}}'` (no signing key needed).

## In the app

- `lib/updates.tsx` (`UpdatesProvider`, `useUpdates`): checks once on start when **Settings → About → Check on
  start** is on (the default, `settings.updates.checkOnStart`), or on **Check now**; a newer version is downloaded and
  installed in the background, and runs from the next start.
- `components/header/UpdateNote.tsx`: "Restart to update" in the header once one is installed.
  `components/settings/AboutSettings.tsx`: the version, where the last check got to, Check now / Restart, the switch,
  Release notes (`REPO_URL/releases`) and Report a problem (a new GitHub issue with the app and macOS version in its
  body; macOS comes from `about.rs`, since the web view reports an old fixed version).
- The plugin calls are in `lib/api.ts` (`installUpdate`, `restartApp`, `appVersion`); permissions `updater:default`
  and `process:allow-restart` in `capabilities/default.json`.
- A version released after the license's updates ended (by `pub_date`) is not downloaded: the state is `held`, and
  About says so with Renew updates. Write latest.json on release day, since `pub_date` is when the script runs.
- A check sends nothing but the request for `latest.json`: no code, sessions or license data. Keep it that way; the
  Settings line says so.

## Testing an update

Build version N and install it in /Applications, bump to N+1, build, write `latest.json`, and serve that folder
locally with the endpoint temporarily pointed at it (`http://127.0.0.1:…/latest.json` and the archive URL in
`latest.json` changed to match; plain http needs `"dangerousInsecureTransportProtocol": true` under
`plugins.updater`). Open N, check in Settings → About, restart. Put the endpoint back before committing.
