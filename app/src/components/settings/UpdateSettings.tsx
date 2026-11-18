import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/lib/settings";
import { canUpdate, type UpdateState, useUpdates } from "@/lib/updates";
import { SectionHead } from "./SectionHead";
import { SettingRow, SettingsBody } from "./SettingRow";

// The line under the version: where the last check got to.
function describe(state: UpdateState) {
  if (!canUpdate) return "Updates are checked in the app, not in this preview.";
  if (state.phase === "checking") return "Checking for a new version…";
  if (state.phase === "downloading") return `Downloading version ${state.version}…`;
  if (state.phase === "ready") return `Version ${state.version} is installed. Restart to use it.`;
  if (state.phase === "current") return "This is the newest version.";
  if (state.phase === "failed") return `Couldn't check for updates: ${state.reason}`;
  return "Not checked yet.";
}

// Settings → Updates: this version, a check now (or the restart once one is installed), and checking on start.
export function UpdateSettings() {
  const { settings, setUpdates } = useSettings();
  const { version, state, busy, checkNow, restart } = useUpdates();
  return (
    <>
      <SectionHead
        title="Updates"
        text="A check asks GitHub for the newest version number. Your code and sessions never leave this Mac."
      />
      <SettingsBody>
        <FieldGroup>
          <SettingRow label={version ? `Version ${version}` : "Version"} description={describe(state)}>
            {state.phase === "ready" ? (
              <Button size="sm" onClick={restart}>
                Restart
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={checkNow} disabled={!canUpdate || busy}>
                {busy && <Spinner data-icon="inline-start" />}
                Check now
              </Button>
            )}
          </SettingRow>
          <FieldSeparator />
          <SettingRow
            label="Check on start"
            description="Look for a new version each time the app opens and install it in the background. It's used from the next restart."
            htmlFor="updates-on-start"
          >
            <Switch
              id="updates-on-start"
              checked={settings.updates.checkOnStart}
              onCheckedChange={(checkOnStart) => setUpdates({ checkOnStart })}
            />
          </SettingRow>
        </FieldGroup>
      </SettingsBody>
    </>
  );
}
