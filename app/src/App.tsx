import { useEffect, useMemo, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Header, type View } from "@/components/Header";
import { ChangesView } from "@/components/changes/ChangesView";
import { TimelineView } from "@/components/timeline/TimelineView";
import { MapView } from "@/components/map/MapView";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { SettingsProvider } from "@/lib/settings";
import { buildTimeline } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/brand";
import { useLiveRepo } from "@/lib/live";
import { pickRepoFolder } from "@/lib/api";
import { plural } from "@/lib/format";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";

export default function App() {
  const { repo, snap, loading, updating, error, live, setLive, pending, fresh, seen, open, viewBranch, refresh, liveAvailable } = useLiveRepo();
  const [view, setView] = useState<View>("changes");
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // ⌘R reloads now (also while paused); ⌘, opens settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "r") {
        e.preventDefault();
        refresh();
      } else if (e.metaKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refresh]);

  return (
    <SettingsProvider>
      <TooltipProvider delayDuration={200}>
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
            onSettings={() => setSettingsOpen(true)}
          />
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
          {snap && !snap.viewing.checked_out && (
            <Alert className="mx-4 mt-3 w-auto">
              <AlertDescription>
                Viewing <b className="font-medium text-foreground">{snap.viewing.branch}</b>, read-only: its {plural(snap.timeline.commits.length, "commit")} since it split
                off. Your checkout stays on {snap.branches.find((b) => b.current)?.name ?? "its branch"}.
              </AlertDescription>
              <AlertAction>
                <Button variant="outline" size="xs" onClick={() => viewBranch(null)}>
                  Back to {snap.branches.find((b) => b.current)?.name ?? "checkout"}
                </Button>
              </AlertAction>
            </Alert>
          )}
          {notice && (
            <Alert variant="destructive" className="mx-4 mt-3 w-auto">
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
                  fresh={fresh.edits}
                  onSeen={(k) => seen("edits", k)}
                />
              </div>
              <div className={cn("flex min-h-0 min-w-0 flex-1", view !== "map" && "hidden")}>
                <MapView snap={snap} timeline={timeline!} active={view === "map"} onOpenInChanges={jump("changes")} onShowInTimeline={jump("timeline")} />
              </div>
            </>
          )}
        </div>
      </TooltipProvider>
    </SettingsProvider>
  );
}
