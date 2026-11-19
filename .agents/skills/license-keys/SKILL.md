---
name: license-keys
description: The offline license, its year of updates and the 14-day trial — issuing or renewing a license key for a buyer, checking a key, where the signing key lives and why it must be backed up, how the trial is counted, and how to test each state. Use when someone asks to make, check or explain a license key, or changes license/trial code (src-tauri/src/license.rs, src/lib/license.tsx, components/license/).
---

# License keys and trial

One-time purchase with a year of updates, offline: no account, no server call. A license key is a small JSON record (name, email, order, date, and on renewed keys the last day of updates) signed with Ed25519, as `base64url(record).base64url(signature)` (~210 characters). The app holds only the public key (`PUBLIC_KEY` in `app/src-tauri/src/license.rs`), so it can check keys but nobody can make one without the private key. Spaces and line breaks (email wrapping) are ignored.

## Issue a key for a buyer

```bash
cd app/src-tauri && cargo run -q --example license -- issue "Buyer Name" buyer@example.com [order] [--until YYYY-MM-DD]
cd app/src-tauri && cargo run -q --example license -- renew <their current key> [order]
```

The order defaults to a timestamp. `issue` gives a year of updates from today (`--until` sets the last day by hand); `renew` makes a new key for the same buyer with a year more: from where their updates end if renewing early, from today if they already ended. Both print the last day of updates under the key. The tool refuses to print a key the app wouldn't accept. Check any key with `-- check <key>`. Paste a key into chat only if it is a test key.

## The signing key

- `~/.flamared-keys/license-signing.key` (32 raw bytes, mode 600), outside the repo — never commit, print or paste it.
- **Back it up** (password manager): `base64 -i ~/.flamared-keys/license-signing.key | pbcopy`. Restore with `echo '…' | base64 -d > ~/.flamared-keys/license-signing.key && chmod 600 …`.
- Lost: no new keys until a release ships a new public key (old keys keep working only in old builds). Leaked: anyone can make keys.
- `new-keypair` creates it once and refuses to overwrite.

## A year of updates

- A key covers versions **made** on or before its last day of updates: `updates_until` in the record, or a year after `issued` when it is left out (every first-purchase key; the field is skipped when empty so the record's bytes stay as before). Dates are YYYY-MM-DD and compared as text. `Holder::covered_until`, `covers`, `renewed_until` in `license.rs`.
- Each build knows the day it was made: `build.rs` stamps `FLAMARED_RELEASED` (UTC) into `license::RELEASED`. Cargo re-runs it when `tauri.conf.json` changes, which every version bump does. `FLAMARED_RELEASED=2030-01-01 pnpm tauri dev` builds a version "from the future" to test the state below.
- A saved key that doesn't cover this build gives the status `not_covered` (holder, `updates_until`, `released`): `UpdatesEnded` replaces the app with a renewed-key field, Renew updates (once `RENEW_URL` is set) and Earlier versions (the GitHub releases). Activating such a key is refused with the dates in the message. The version people already have keeps working: only one installed by hand can land here, because…
- …the updater doesn't install it: `installUpdate` reads the release's date (`pub_date` in latest.json) and skips one the key doesn't cover (`coversRelease` in `lib/license.tsx`); Settings → About then says which version is out and that updates ended, with Renew updates. The trial installs every update.
- Settings → License shows "Updates until <day>" or "Updates ended on <day>", and a key field for the renewed key.

## Trial

- 14 days from the first launch, in `license.json` in the app's data folder (`~/Library/Application Support/com.flamared/`), separate from `state.json`.
- Counted from the latest time ever seen, so turning the clock back gains nothing. Deleting the file or reinstalling starts a new trial — accepted.
- Checked at launch and hourly. States: `licensed` (holder), `trial` (days left, end), `ended`.

## In the window

- Trial: "N days left in trial" in the header → Settings → License (days left, end date, key field).
- Ended: `TrialEnded` replaces the whole app (the app isn't even mounted), with the key field.
- Licensed: "Licensed to <name>", how long updates last, a field for a renewed key, and "Remove from this Mac" (back to trial/ended; the key keeps working elsewhere).
- Updates ended before this version: `UpdatesEnded` replaces the whole app (see above). It and `TrialEnded` share `LockScreen`.
- Buy buttons appear only once `BUY_URL` in `app/src/brand.ts` is set, Renew buttons once `RENEW_URL` is (no seller chosen yet; Paddle recommended).

## Testing

- Rust: `cargo test --lib` covers keys (valid, wrapped, forged name, other signer, junk), trial counting (days, ending, clock rollback, bad stored key), the updates window (default year, leap day, last day, renewing early and late, the refusal message) and that keys from before `updates_until` still read.
- Browser preview: `?license=ended`, `?license=licensed`, `?license=lapsed` (updates ended), `?license=renew` (this version not covered), `?license=3` (days left); the key `test` activates there.
- Desktop app: issue a key with the command above and paste it; to see "ended", edit `trial_started` in `license.json` to >14 days ago and relaunch. To see "not covered", issue a key with `--until` in the past, or run with `FLAMARED_RELEASED` after its last day. Don't print real keys in chat; capture them in a shell variable and pass them on (`K=$(… issue … | head -1); … check "$K"`).
