import { ExternalLinkIcon } from "lucide-react";
import { APP_NAME, REPO_URL } from "@/brand";
import { Button } from "@/components/ui/button";
import { openInBrowser } from "@/lib/api";
import { longDate, useLicense } from "@/lib/license";
import { LockScreen } from "./LockScreen";

// Shown in place of the app when this version came out after the license's updates ended (installed by hand; the
// updater doesn't install such a version): renew and paste the new key, or go back to a version the key covers.
export function UpdatesEnded() {
  const { status } = useLicense();
  if (status.state !== "not_covered") return null;
  const until = longDate(status.updates_until);
  return (
    <LockScreen
      title="Your updates ended before this version"
      purchase="renew"
      text={
        <>
          This version of {APP_NAME} came out on {longDate(status.released)}, after your updates ended on {until}. Renew
          for another year and paste the new key, or install a version from before {until}.
        </>
      }
    >
      <div>
        <Button variant="outline" size="sm" onClick={() => openInBrowser(`${REPO_URL}/releases`)}>
          Earlier versions
          <ExternalLinkIcon data-icon="inline-end" />
        </Button>
      </div>
    </LockScreen>
  );
}
