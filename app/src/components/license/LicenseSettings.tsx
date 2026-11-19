import { APP_NAME } from "@/brand";
import { SectionHead } from "@/components/settings/SectionHead";
import { SettingRow, SettingsBody } from "@/components/settings/SettingRow";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { plural } from "@/lib/format";
import { longDate, shortDate, TRIAL_DAYS, updatesEnded, useLicense } from "@/lib/license";
import { KeyForm } from "./KeyForm";

// Settings → License: who it is licensed to and how long updates last, or the days left in the trial and where to
// enter a key.
export function LicenseSettings() {
  const { status, remove } = useLicense();
  return (
    <>
      <SectionHead
        title="License"
        text="One payment, with a year of updates. The key is checked on this Mac; nothing is sent anywhere."
      />
      <SettingsBody>
        {status.state === "licensed" || status.state === "not_covered" ? (
          <FieldGroup>
            <SettingRow
              label={<>Licensed to {status.holder.name}</>}
              description={
                <>
                  {status.holder.email} · order {status.holder.id} · since {status.holder.issued}
                </>
              }
            />
            <UpdatesRow updatesUntil={status.updates_until} />
            <FieldSeparator />
            <KeyForm purchase="renew" />
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
            <KeyForm purchase="buy" />
          </FieldGroup>
        )}
      </SettingsBody>
    </>
  );
}

// How long new versions are included, or that they no longer are and what that means for the version you have.
function UpdatesRow({ updatesUntil }: { updatesUntil: string }) {
  const until = longDate(updatesUntil);
  if (updatesEnded(updatesUntil)) {
    return (
      <SettingRow
        label={`Updates ended on ${until}`}
        description="This version keeps working. Renew for another year of new versions, then paste the new key below."
      />
    );
  }
  return (
    <SettingRow
      label={`Updates until ${until}`}
      description="New versions released until then are included. After that, the version you have keeps working; renewing adds a year."
    />
  );
}
