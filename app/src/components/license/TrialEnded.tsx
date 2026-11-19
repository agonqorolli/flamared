import { APP_NAME, BUY_URL } from "@/brand";
import { TRIAL_DAYS } from "@/lib/license";
import { LockScreen } from "./LockScreen";

// Shown in place of the app once the trial is over: a thank-you, where to buy, and where to paste a key.
export function TrialEnded() {
  return (
    <LockScreen
      title="Your trial has ended"
      purchase="buy"
      text={
        <>
          Thanks for trying {APP_NAME} for {TRIAL_DAYS} days. To keep using it,{" "}
          {BUY_URL ? "buy a license" : "enter a license key"}: one payment, with a year of updates.
        </>
      }
    />
  );
}
