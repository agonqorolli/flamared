import { useCallback, useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Header, type View } from "@/components/Header";
import { ChangesView } from "@/components/changes/ChangesView";
import { APP_NAME } from "@/brand";
import { lastRepo, loadRepos, loadSnapshot, rememberRepo } from "@/lib/api";
import type { Snapshot } from "@/lib/types";

export default function App() {
  const [repo, setRepo] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("changes");

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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [repo, load]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col">
        <Header snap={snap} view={view} loading={loading} onView={setView} onOpenRepo={load} onRefresh={() => repo && load(repo)} />
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
        ) : view === "changes" ? (
          <ChangesView snap={snap} />
        ) : (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyTitle>{view === "timeline" ? "Timeline" : "Map"} comes next</EmptyTitle>
              <EmptyDescription>The data is already loaded; this screen is coming next.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </TooltipProvider>
  );
}
