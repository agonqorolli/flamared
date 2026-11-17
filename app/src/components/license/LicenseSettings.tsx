import { APP_NAME } from "@/brand";
import { SectionHead } from "@/components/settings/SectionHead";
import { SettingRow, SettingsBody } from "@/components/settings/SettingRow";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
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
      <SettingsBody>
        {status.state === "licensed" ? (
          <FieldGroup>
            <SettingRow
              label={<>Licensed to {status.holder.name}</>}
              description={
                <>
                  {status.holder.email} · order {status.holder.id} · since {status.holder.issued}
                </>
              }
            />
            <FieldSeparator />
            <SettingRow
              label="Moving to another Mac"
              description="Takes the key off this Mac. Enter it again on the new one; the key from your purchase email keeps working."
            >
              <Button variant="outline" size="sm" onClick={remove}>
                Remove from this Mac
              </Button>
            </SettingRow>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <SettingRow
              label={status.state === "trial" ? `Trial: ${plural(status.days_left, "day")} left` : "Trial ended"}
              description={
                status.state === "trial"
                  ? `Everything works during the ${TRIAL_DAYS}-day trial, until ${shortDate(status.ends)}. After that, ${APP_NAME} needs a license.`
                  : `The ${TRIAL_DAYS}-day trial ended on ${shortDate(status.ended)}.`
              }
            />
            <FieldSeparator />
            <KeyForm />
          </FieldGroup>
        )}
      </SettingsBody>
    </>
  );
}
