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
   - `npx wrangler secret put OWNER_EMAIL` (step 5)
   - `STRIPE_WEBHOOK_SECRET`: the `whsec_…` of the webhook endpoint below.
3. `pnpm deploy` (it serves `flamared.com/buy`, `/renew` and `/stripe/webhook`; the rest of the site is untouched),
   then add a Stripe webhook endpoint at `https://flamared.com/stripe/webhook` for
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
4. In Resend, verify the sending domain (`FROM_EMAIL` is `licenses@flamared.com`).
5. `npx wrangler secret put OWNER_EMAIL` (where renewal alerts go). `REPLY_TO` in `wrangler.jsonc` is
   `support@flamared.com`, which Cloudflare Email Routing forwards to the owner's inbox.

Local testing: put the three secrets in `.dev.vars`, run `pnpm dev`, and in another terminal
`stripe listen --forward-to localhost:8787/stripe/webhook` (it prints the `whsec_…` to use locally).

## Stripe objects

The server runs on the live account (`acct_1UddL2Ilhs75Smin`, CLI profile `live`: `stripe … --live --project-name
live`). The sandbox (`acct_1UcQamILE4tP9GN9`, CLI profile `default`) has the same objects for testing.

| What | Live | Sandbox |
| --- | --- | --- |
| Product "Flamared license", $59 tax included, tax code `txcd_10202003` | `prod_VezN9DjESOhtRe` | `prod_VexcXyb43ewKsh` |
| Product "Flamared renewal", $29 tax included | `prod_VezNgW101BSD7O` | `prod_VexceAJcAMHmnP` |
| Buy link (promotion codes allowed) | `plink_1UdfOfIlhs75Sminf5bTFzIt` | `plink_1Uddh4ILE4tP9GN9Rlg2PEaW` |
| Renew link (optional "License email" field) | `plink_1UdfOrIlhs75SminRoynFB8d` | `plink_1Uddh5ILE4tP9GN9bW0EeYKa` |
| Coupon "Launch price", $20 off the license only | `LAUNCH-20` | `LAUNCH-20` |
| Webhook endpoint, `https://flamared.com/stripe/webhook` | `we_1UdfPLIlhs75SminSfnT4cK7` | `we_1UdenNILE4tP9GN9lnoXcph6` (disabled) |

Prices are `tax_behavior: inclusive`: buyers pay exactly $59 / $29 and Managed Payments takes the VAT or sales tax out of
it. Left unset, Managed Payments adds tax on top (a Belgian renewal came to $35.09). A price's tax behavior can be set
only once, so set it when creating the price.

To test against the sandbox again: point the link vars in `wrangler.jsonc` at the sandbox links, re-enable the sandbox
webhook and put its secret in `STRIPE_WEBHOOK_SECRET` (the Worker checks one secret at a time), or run `pnpm dev` with
`stripe listen`.

## Launch price

$39 until the end of 2026: the live promotion code `LAUNCH` (`promo_1UdfSuIlhs75SminZYH2c3Vh`, coupon `LAUNCH-20`)
expires at 2027-01-01 00:00 UTC, and `LAUNCH_ENDS` is `2026-12-31`, so `/buy` stops adding it at the same moment.
After that `/buy` sends buyers to the $59 page with nothing else to change. For another sale, make a new promotion code
with its own end, set `LAUNCH_CODE` and `LAUNCH_ENDS`, and deploy.
