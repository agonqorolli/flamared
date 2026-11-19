//! The emails the server sends, through Resend's API: the license key to a buyer, and a note to the owner when a
//! sale needs a hand (a renewal for an email with no license on record).
import { longDate } from "./license.ts";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Resend sends one email per idempotency key, so a retried webhook doesn't email twice. */
  idempotencyKey: string;
}

/** Sends an email; throws if Resend refuses it, so Stripe retries the webhook. */
export type Send = (email: Email) => Promise<void>;

export function resend(apiKey: string, from: string, replyTo: string | undefined): Send {
  return async (email) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        reply_to: replyTo || undefined,
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    if (!response.ok) throw new Error(`Resend refused the email (${response.status}): ${await response.text()}`);
  };
}

/** The key for a new license or a renewal. */
export function keyEmail(to: string, key: string, updatesUntil: string, renewal: boolean, order: string): Email {
  const until = longDate(updatesUntil);
  const intro = renewal
    ? `Thanks for renewing Flamared. Here is your new license key, with updates until ${until}. It replaces your old key.`
    : `Thanks for buying Flamared! Here is your license key. It includes updates until ${until}.`;
  const steps = renewal
    ? "Paste it into Flamared under Settings > License."
    : "Paste it into Flamared under Settings > License (or on the screen that shows when the trial ends). It works on all your Macs.";
  return {
    to,
    subject: renewal ? "Your renewed Flamared license key" : "Your Flamared license key",
    idempotencyKey: `key-${order}`,
    text: `${intro}\n\n${key}\n\n${steps}\n\nKeep this email: you'll need the key if you reinstall.\n`,
    html: `<p>${escape(intro)}</p>
<pre style="white-space: pre-wrap; word-break: break-all; font-family: ui-monospace, Menlo, monospace; font-size: 13px; padding: 12px; background: #f4f4f5; border-radius: 6px;">${escape(key)}</pre>
<p>${escape(steps)}</p>
<p>Keep this email: you'll need the key if you reinstall.</p>`,
  };
}

/** A renewal the server couldn't match to a license: the buyer is told it's coming, the owner is told to sort it. */
export function renewalNotFound(to: string, order: string): Email {
  const text =
    "Thanks for renewing Flamared. We couldn't find a license for this email, so we'll look up your purchase and send your renewed key within a day. If you bought Flamared with another email, reply with it.";
  return { to, subject: "Your Flamared renewal", idempotencyKey: `not-found-${order}`, text, html: `<p>${text}</p>` };
}

export function ownerAlert(to: string, order: string, buyer: string, looked: string): Email {
  const text = `A renewal was paid but no license is on record for ${looked}.\n\nBuyer: ${buyer}\nOrder: ${order}\n\nIssue the key by hand: cargo run --example license -- renew <their key> ${order}`;
  return {
    to,
    subject: `Flamared renewal needs a hand: ${buyer}`,
    idempotencyKey: `alert-${order}`,
    text,
    html: `<pre>${escape(text)}</pre>`,
  };
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
