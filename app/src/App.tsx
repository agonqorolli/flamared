import { useEffect, useMemo, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Header, type View } from "@/components/Header";
import { ChangesView } from "@/components/changes/ChangesView";
import { TimelineView } from "@/components/timeline/TimelineView";
import { MapView } from "@/components/map/MapView";
import { SettingsDialog, type Section } from "@/components/settings/SettingsDialog";
import { TrialEnded } from "@/components/license/TrialEnded";
import { LicenseProvider, useLicense, type LicenseStatus } from "@/lib/license";
import { SettingsProvider } from "@/lib/settings";
import { buildTimeline } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/brand";
import { useLiveRepo } from "@/lib/live";
import { canPickFolder, pickRepoFolder } from "@/lib/api";
import { useKeyHints, useKeys } from "@/lib/keys";
import { useSettings } from "@/lib/settings";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";

// The license decides what the window shows: the app, or the trial-ended screen (the app isn't even started then).
export default function App({ license }: { license: LicenseStatus }) {
  return (
    <SettingsProvider>
      <LicenseProvider initial={license}>
        <TooltipProvider delayDuration={200}>
          <Gate />
        </TooltipProvider>
      </LicenseProvider>
    </SettingsProvider>
  );
}

function Gate() {
  return useLicense().status.state === "ended" ? <TrialEnded /> : <Workspace />;
}

function Workspace() {
  const { repo, snap, loading, updating, error, live, setLive, pending, fresh, seen, open, viewBranch, refresh, liveAvailable } = useLiveRepo();
  const [view, setView] = useState<View>("changes");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsAt, setSettingsAt] = useState<Section | undefined>();
  const openSettings = (at?: Section) => (setSettingsAt(at), setSettingsOpen(true));
  const [notice, setNotice] = useState<string | null>(null); // a short problem that doesn't replace the screen
  const openFolder = async () => {
    try {
      const root = await pickRepoFolder();
      if (root) setNotice(null), open(root);
    } catch (e) {
      setNotice(String(e));
    }
  };
  // A jump from one screen to a file in another; `n` makes a repeat jump to the same file count again.
  const [focus, setFocus] = useState<{ view: View; path: string; n: number } | null>(null);
  const timeline = useMemo(() => (snap ? buildTimeline(snap) : null), [snap]);
  const changed = useMemo(() => new Set(snap ? Object.keys(snap.diffs) : []), [snap]);
  const jump = (to: View) => (path: string) => {
    setView(to);
    setFocus((f) => ({ view: to, path, n: (f?.n ?? 0) + 1 }));
  };

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  // Shortcuts that work on every screen (lib/keys.ts lists them all; each screen handles its own).
  const { settings, setDiff } = useSettings();
  useKeyHints();
  useKeys(true, {
    goChanges: () => setView("changes"),
    goTimeline: () => setView("timeline"),
    goMap: () => setView("map"),
    reload: refresh,
    settings: () => openSettings(),
    shortcuts: () => openSettings("keyboard"),
    openFolder: canPickFolder && openFolder,
    live: liveAvailable && (() => setLive(!live)),
    splitDiff: view !== "map" && (() => setDiff({ layout: settings.diff.layout === "split" ? "unified" : "split" })),
  });

  return (
    <div className="flex h-full flex-col">
      <Header
        snap={snap}
        view={view}
        loading={loading}
        live={liveAvailable ? { on: live, updating, pending, set: setLive } : null}
        onView={setView}
        onOpenRepo={open}
        onOpenFolder={openFolder}
        onViewBranch={viewBranch}
        onRefresh={refresh}
        onSettings={openSettings}
      />
      <SettingsDialog open={settingsOpen} start={settingsAt} onOpenChange={setSettingsOpen} />
      {notice && (
        <Alert variant="destructive" className="mx-3 mt-3 w-auto">
          <AlertDescription>{notice}</AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="xs" onClick={() => setNotice(null)}>
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      )}
      {error ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>Couldn't read this repository</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          {repo && (
            <EmptyContent>
              <Button variant="outline" onClick={() => open(repo)}>
                Try again
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : !snap ? (
        <Empty className="flex-1">
          {loading ? (
            <Spinner />
          ) : (
            <EmptyHeader>
              <EmptyTitle>No repository yet</EmptyTitle>
              <EmptyDescription>No coding agent session was found on this machine. Opening any folder comes with the folder picker.</EmptyDescription>
            </EmptyHeader>
          )}
        </Empty>
      ) : !snap.viewing.checked_out && changed.size === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>No changes on {snap.viewing.branch}</EmptyTitle>
            <EmptyDescription>This branch has no file changes to show.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // All three screens stay mounted so each keeps its place; only the shown one listens to keys.
        <>
          <div className={cn("flex min-h-0 min-w-0 flex-1", view !== "changes" && "hidden")}>
            <ChangesView
              snap={snap}
              active={view === "changes"}
              focus={focus?.view === "changes" ? focus : null}
              inTimeline={(p) => !!timeline?.paths.has(p)}
              onShowInTimeline={jump("timeline")}
              onShowInMap={jump("map")}
              fresh={fresh.paths}
              onSeen={(p) => seen("paths", p)}
            />
          </div>
          <div className={cn("flex min-h-0 min-w-0 flex-1", view !== "timeline" && "hidden")}>
            <TimelineView
              snap={snap}
              timeline={timeline!}
              active={view === "timeline"}
              focus={focus?.view === "timeline" ? focus : null}
              inChanges={(p) => changed.has(p)}
              onShowInChanges={jump("changes")}
              onShowInMap={jump("map")}
              fresh={fresh.edits}
              onSeen={(k) => seen("edits", k)}
            />
          </div>
          <div className={cn("flex min-h-0 min-w-0 flex-1", view !== "map" && "hidden")}>
            <MapView
              snap={snap}
              timeline={timeline!}
              active={view === "map"}
              focus={focus?.view === "map" ? focus : null}
              onOpenInChanges={jump("changes")}
              onShowInTimeline={jump("timeline")}
            />
          </div>
        </>
      )}
    </div>
  );
}
