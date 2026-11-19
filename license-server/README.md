# Flamared license server

A Cloudflare Worker that sells licenses through Stripe Payment Links (Managed Payments: Stripe is the merchant of
record) and emails each buyer a signed license key through Resend.

- `GET /buy` → the license Payment Link ($59; with the launch code filled in while `LAUNCH_ENDS` hasn't passed)
- `GET /renew` → the renewal Payment Link ($29, the same whether updates ended or not)
- `POST /stripe/webhook` → on `checkout.session.completed` (paid) or `checkout.session.async_payment_succeeded`:
  signs a key the way `app/src-tauri/examples/license.rs` does and emails it. Licenses are kept in KV by email, so a
  renewal finds the current key by the checkout email (or the "License email" field on the renewal page) and adds a
  year from where updates end, or from today if they ended. Each order is handled once; a retry resends the same key.
  A renewal with no license on record emails the buyer that it's coming and emails `OWNER_EMAIL` to issue it by hand.

The Worker holds no Stripe API key: it only checks webhook signatures.

## Commands

```bash
pnpm install
pnpm test && pnpm typecheck      # after every change
pnpm format
pnpm dev                         # local, on :8787 (secrets from .dev.vars)
pnpm deploy
```

## Setup (once per Stripe mode)

1. `npx wrangler login`, then `npx wrangler kv namespace create LICENSES` and put the id in `wrangler.jsonc`.
2. Secrets, typed into wrangler (never into the repo or chat):
   - `base64 -i ~/.flamared-keys/license-signing.key | npx wrangler secret put LICENSE_SIGNING_KEY`
   - `npx wrangler secret put RESEND_API_KEY` (a Resend key with sending access only)
   - `STRIPE_WEBHOOK_SECRET`: the `whsec_…` of the webhook endpoint below.
3. `pnpm deploy` (it serves `flamared.com/buy`, `/renew` and `/stripe/webhook`; the rest of the site is untouched),
   then add a Stripe webhook endpoint at `https://flamared.com/stripe/webhook` for
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
4. In Resend, verify the sending domain (`FROM_EMAIL` is `licenses@flamared.com`).
5. Fill `OWNER_EMAIL` and `REPLY_TO` in `wrangler.jsonc`.

Local testing: put the three secrets in `.dev.vars`, run `pnpm dev`, and in another terminal
`stripe listen --forward-to localhost:8787/stripe/webhook` (it prints the `whsec_…` to use locally).

## Stripe objects (sandbox)

| What | Id |
| --- | --- |
| Product "Flamared license", $59, tax code `txcd_10202003` | `prod_VexcXyb43ewKsh` |
| Product "Flamared renewal", $29 | `prod_VexceAJcAMHmnP` |
| Buy link (promotion codes allowed) | `plink_1Uddh4ILE4tP9GN9Rlg2PEaW` |
| Renew link (optional "License email" field) | `plink_1Uddh5ILE4tP9GN9bW0EeYKa` |
| Coupon "Launch price", $20 off the license only | `LAUNCH-20` |
| Webhook endpoint, `https://flamared.com/stripe/webhook` | `we_1UdenNILE4tP9GN9lnoXcph6` |

Going live: create the same products, links and coupon in live mode, and switch the link vars in `wrangler.jsonc`.

## Launch price

Make a promotion code `LAUNCH` for coupon `LAUNCH-20` that expires at the end of the launch month, then set
`LAUNCH_CODE` and `LAUNCH_ENDS` (its last day) in `wrangler.jsonc` and deploy. `/buy` adds the code until that day.
