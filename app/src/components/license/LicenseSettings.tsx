import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { SectionHead } from "@/components/settings/SectionHead";
import { APP_NAME } from "@/brand";
import { plural } from "@/lib/format";
import { shortDate, TRIAL_DAYS, useLicense } from "@/lib/license";
import { KeyForm } from "./KeyForm";

// Settings → License: who it is licensed to, or the days left in the trial and where to enter a key.
export function LicenseSettings() {
  const { status, remove } = useLicense();
  return (
    <>
      <SectionHead
        title="License"
        text="One payment, no subscription. The key is checked on this Mac; nothing is sent anywhere."
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {status.state === "licensed" ? (
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel>Licensed to {status.holder.name}</FieldLabel>
                <FieldDescription>
                  {status.holder.email} · order {status.holder.id} · since {status.holder.issued}
                </FieldDescription>
              </FieldContent>
            </Field>
            <FieldSeparator />
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel>Moving to another Mac</FieldLabel>
                <FieldDescription>
                  Takes the key off this Mac. Enter it again on the new one; the key from your purchase email keeps
                  working.
                </FieldDescription>
              </FieldContent>
              <Button variant="outline" size="sm" onClick={remove}>
                Remove from this Mac
              </Button>
            </Field>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel>
                  {status.state === "trial" ? `Trial: ${plural(status.days_left, "day")} left` : "Trial ended"}
                </FieldLabel>
                <FieldDescription>
                  {status.state === "trial"
                    ? `Everything works during the ${TRIAL_DAYS}-day trial, until ${shortDate(status.ends)}. After that, ${APP_NAME} needs a license.`
                    : `The ${TRIAL_DAYS}-day trial ended on ${shortDate(status.ended)}.`}
                </FieldDescription>
              </FieldContent>
            </Field>
            <FieldSeparator />
            <KeyForm />
          </FieldGroup>
        )}
      </div>
    </>
  );
}
