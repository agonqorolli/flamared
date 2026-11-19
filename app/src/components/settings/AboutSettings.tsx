import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_NAME, RENEW_URL, REPO_URL } from "@/brand";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { aboutApp, inTauri, openInBrowser } from "@/lib/api";
import { longDate } from "@/lib/license";
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
  if (state.phase === "held") {
    return `Version ${state.version} came out after your updates ended on ${longDate(state.until)}. Renew to get it; this version keeps working.`;
  }
  if (state.phase === "failed") return `Couldn't check for updates: ${state.reason}`;
  return "Not checked yet.";
}

// Beside the version: Restart once an update is installed, Renew when one is held back, otherwise Check now.
function UpdateButton() {
  const { state, busy, checkNow, restart } = useUpdates();
  if (state.phase === "ready") {
    return (
      <Button size="sm" onClick={restart}>
        Restart
      </Button>
    );
  }
  if (state.phase === "held" && RENEW_URL) {
    return (
      <Button size="sm" onClick={() => openInBrowser(RENEW_URL)}>
        Renew updates
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={checkNow} disabled={!canUpdate || busy}>
      {busy && <Spinner data-icon="inline-start" />}
      Check now
    </Button>
  );
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
  const { version, state } = useUpdates();
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
            <UpdateButton />
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
