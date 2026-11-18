import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_NAME, REPO_URL } from "@/brand";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { aboutApp, inTauri, openInBrowser } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import type { About } from "@/lib/types";
import { canUpdate, type UpdateState, useUpdates } from "@/lib/updates";
import { AboutData } from "./AboutData";
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

// A new GitHub issue with headings to fill in and, under them, the version and macOS it happened on. Nothing is
// sent until it is posted on GitHub.
function problemReportUrl(version: string | null, system: string | null) {
  const app = version ? `${APP_NAME} ${version}` : APP_NAME;
  const body = [
    "**What happened?**",
    "",
    "",
    "**What did you expect?**",
    "",
    "",
    "---",
    [app, system].filter(Boolean).join(" · "),
  ];
  return `${REPO_URL}/issues/new?body=${encodeURIComponent(body.join("\n"))}`;
}

// Settings → About: this version and its updates, release notes and problem reports, and what the app keeps on this
// Mac.
export function AboutSettings() {
  const { settings, setUpdates } = useSettings();
  const { version, state, busy, checkNow, restart } = useUpdates();
  const [about, setAbout] = useState<About | null>(null);
  useEffect(() => {
    if (inTauri) aboutApp().then(setAbout, (e) => console.warn("Couldn't read the app's details:", e));
  }, []);
  return (
    <>
      <SectionHead
        title="About"
        text="A check for updates asks GitHub for the newest version number. Your code and sessions never leave this Mac."
      />
      <SettingsBody>
        <FieldGroup>
          <SettingRow label={version ? `${APP_NAME} ${version}` : APP_NAME} description={describe(state)}>
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
          <SettingRow label="What's new" description="What changed in each version, on GitHub.">
            <Button variant="outline" size="sm" onClick={() => openInBrowser(`${REPO_URL}/releases`)}>
              Release notes
              <ExternalLinkIcon data-icon="inline-end" />
            </Button>
          </SettingRow>
          <SettingRow
            label="Report a problem"
            description="Opens a new issue on GitHub with this version and your macOS filled in. Nothing is sent until you post it."
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => openInBrowser(problemReportUrl(version, about?.system ?? null))}
            >
              Report a problem
              <ExternalLinkIcon data-icon="inline-end" />
            </Button>
          </SettingRow>
          <FieldSeparator />
          <AboutData about={about} />
        </FieldGroup>
      </SettingsBody>
    </>
  );
}
