import { useCallback, useEffect, useMemo, useState } from "react";
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
import { lastRepo, loadRepos, loadSnapshot, rememberRepo } from "@/lib/api";
import type { Snapshot } from "@/lib/types";

export default function App() {
  const [repo, setRepo] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("changes");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A jump from one screen to a file in another; `n` makes a repeat jump to the same file count again.
  const [focus, setFocus] = useState<{ view: View; path: string; n: number } | null>(null);
  const timeline = useMemo(() => (snap ? buildTimeline(snap) : null), [snap]);
  const changed = useMemo(() => new Set(snap ? Object.keys(snap.diffs) : []), [snap]);
  const jump = (to: View) => (path: string) => {
    setView(to);
    setFocus((f) => ({ view: to, path, n: (f?.n ?? 0) + 1 }));
  };

  const load = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const s = await loadSnapshot(path);
      setSnap(s);
      setRepo(path);
      rememberRepo(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Open the last repo, or the one an agent worked in most recently.
  useEffect(() => {
    document.title = APP_NAME;
    (async () => {
      const last = lastRepo();
      if (last) return load(last);
      const repos = await loadRepos().catch(() => []);
      if (repos[0]) return load(repos[0].full);
      setLoading(false);
    })();
  }, [load]);

  // Data loads when the app opens or on refresh (no live updates).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "r" && repo) {
        e.preventDefault();
        load(repo);
      } else if (e.metaKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [repo, load]);

  return (
    <SettingsProvider>
      <TooltipProvider delayDuration={200}>
        <div className="flex h-full flex-col">
          <Header snap={snap} view={view} loading={loading} onView={setView} onOpenRepo={load} onRefresh={() => repo && load(repo)} onSettings={() => setSettingsOpen(true)} />
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
          {error ? (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyTitle>Couldn't read this repository</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              {repo && (
                <EmptyContent>
                  <Button variant="outline" onClick={() => load(repo)}>
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
                />
              </div>
              <div className={cn("flex min-h-0 min-w-0 flex-1", view !== "timeline" && "hidden")}>
                <TimelineView
                  timeline={timeline!}
                  active={view === "timeline"}
                  focus={focus?.view === "timeline" ? focus : null}
                  inChanges={(p) => changed.has(p)}
                  onShowInChanges={jump("changes")}
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
