import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inTauri, showInFinder } from "@/lib/api";
import { plural } from "@/lib/format";
import { forgetRecentRepos, recentRepos } from "@/lib/repos";
import { clearAllMarks, savedMarks } from "@/lib/review";
import type { About } from "@/lib/types";
import { SettingRow } from "./SettingRow";

// Settings → About, what the app keeps on this Mac: where, the recent repos and the review marks, each to clear.
export function AboutData({ about }: { about: About | null }) {
  return (
    <>
      <DataFolderRow about={about} />
      <RecentReposRow />
      <ReviewMarksRow />
    </>
  );
}

// The app's data folder, to open in the Finder.
function DataFolderRow({ about }: { about: About | null }) {
  const where = inTauri ? about?.data_folder_shown : "Shown in the app, not in this preview.";
  return (
    <SettingRow
      label="Data folder"
      description={
        <>
          {where && <span className="block font-mono text-mini">{where}</span>}
          Settings, review marks, agent folders and the license. Nothing is kept anywhere else.
        </>
      }
    >
      {about && (
        <Button variant="outline" size="sm" onClick={() => showInFinder(about.data_folder)}>
          Show in Finder
        </Button>
      )}
    </SettingRow>
  );
}

// The repos you opened, which stay in the repo picker even when no agent session points to them.
function RecentReposRow() {
  const [count, setCount] = useState(() => recentRepos().length);
  const forget = () => {
    forgetRecentRepos();
    setCount(0);
  };
  return (
    <SettingRow
      label="Recent repositories"
      description={
        count
          ? `${plural(count, "repository", "repositories")} you opened stay in the repo picker, even without agent sessions.`
          : "None saved."
      }
    >
      <Button variant="outline" size="sm" onClick={forget} disabled={!count}>
        Forget
      </Button>
    </SettingRow>
  );
}

// Looks good / Needs work marks in every repo; clearing them asks once more first.
function ReviewMarksRow() {
  const [saved, setSaved] = useState(savedMarks);
  const [confirming, setConfirming] = useState(false);
  const clear = () => {
    clearAllMarks();
    setSaved(savedMarks());
    setConfirming(false);
  };
  return (
    <SettingRow
      label="Review marks"
      description={
        saved.files
          ? `Looks good and Needs work on ${plural(saved.files, "file")}, across ${plural(saved.branches, "branch", "branches")} in all repositories.`
          : "None saved."
      }
    >
      {confirming ? (
        <div className="flex shrink-0 gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={clear}>
            Clear all marks
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)} disabled={!saved.files}>
          Clear…
        </Button>
      )}
    </SettingRow>
  );
}
