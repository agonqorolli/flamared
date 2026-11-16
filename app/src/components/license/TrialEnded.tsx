import { APP_NAME, BUY_URL } from "@/brand";
import { TRIAL_DAYS } from "@/lib/license";
import { KeyForm } from "./KeyForm";

// Shown in place of the app once the trial is over: a thank-you, where to buy, and where to paste a key.
export function TrialEnded() {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-background p-6">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border bg-card p-7">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-faint">{APP_NAME}</div>
          <h1 className="text-lg font-semibold">Your trial has ended</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Thanks for trying {APP_NAME} for {TRIAL_DAYS} days. To keep using it, {BUY_URL ? "buy a license" : "enter a license key"}: one payment, no
            subscription.
          </p>
        </div>
        <KeyForm autoFocus />
        <p className="border-t pt-4 text-xs leading-snug text-faint">The key is checked on this Mac. Your code and agent sessions never leave it.</p>
      </div>
    </div>
  );
}
