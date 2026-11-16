---
name: license-keys
description: The offline license and 14-day trial — issuing a license key for a buyer, checking a key, where the signing key lives and why it must be backed up, how the trial is counted, and how to test each state. Use when someone asks to make, check or explain a license key, or changes license/trial code (src-tauri/src/license.rs, src/lib/license.tsx, components/license/).
---

# License keys and trial

One-time purchase, offline: no account, no server call. A license key is a small JSON record (name, email, order, date) signed with Ed25519, as `base64url(record).base64url(signature)` (~210 characters). The app holds only the public key (`PUBLIC_KEY` in `app/src-tauri/src/license.rs`), so it can check keys but nobody can make one without the private key. Spaces and line breaks (email wrapping) are ignored.

## Issue a key for a buyer

```bash
cd app/src-tauri && cargo run -q --example license -- issue "Buyer Name" buyer@example.com [order]
```

The order defaults to a timestamp. The tool refuses to print a key the app wouldn't accept. Check any key with `-- check <key>`. Paste a key into chat only if it is a test key.

## The signing key

- `~/.flamared-keys/license-signing.key` (32 raw bytes, mode 600), outside the repo — never commit, print or paste it.
- **Back it up** (password manager): `base64 -i ~/.flamared-keys/license-signing.key | pbcopy`. Restore with `echo '…' | base64 -d > ~/.flamared-keys/license-signing.key && chmod 600 …`.
- Lost: no new keys until a release ships a new public key (old keys keep working only in old builds). Leaked: anyone can make keys.
- `new-keypair` creates it once and refuses to overwrite.

## Trial

- 14 days from the first launch, in `license.json` in the app's data folder (`~/Library/Application Support/com.flamared/`), separate from `state.json`.
- Counted from the latest time ever seen, so turning the clock back gains nothing. Deleting the file or reinstalling starts a new trial — accepted.
- Checked at launch and hourly. States: `licensed` (holder), `trial` (days left, end), `ended`.

## In the window

- Trial: "N days left in trial" in the header → Settings → License (days left, end date, key field).
- Ended: `TrialEnded` replaces the whole app (the app isn't even mounted), with the key field.
- Licensed: "Licensed to <name>", and "Remove from this Mac" (back to trial/ended; the key keeps working elsewhere).
- Buy buttons appear only once `BUY_URL` in `app/src/brand.ts` is set (no seller chosen yet; Paddle or Lemon Squeezy).

## Testing

- Rust: `cargo test --lib` covers keys (valid, wrapped, forged name, other signer, junk) and trial counting (days, ending, clock rollback, bad stored key).
- Browser preview: `?license=ended`, `?license=licensed`, `?license=3` (days left); the key `test` activates there.
- Desktop app: issue a key with the command above and paste it; to see "ended", edit `trial_started` in `license.json` to >14 days ago and relaunch.
