// The open repo's data, kept current: loads it, reloads when the Rust side reports a change (Live), and remembers
// which files and edits are new since you last looked, so the screens can mark them.
import { useCallback, useEffect, useRef, useState } from "react";
import { inTauri, loadRepos, loadSnapshot, onRepoChanged, watchRepo } from "./api";
import { lastRepo, rememberRepo } from "./repos";
import { getItem, setItem } from "./store";
import { buildTimeline, editKey } from "./timeline";
import type { Snapshot } from "./types";
import { type Waiting, whatChanged } from "./waiting";

const LIVE_KEY = "live";
const readLive = () => getItem(LIVE_KEY) !== "off";

// A repo or branch is being opened; the screens dim until it is there.
export interface Opening {
  repoChanged: boolean;
  label: string; // what is opening: the repo's folder name, or the branch
}

export interface Fresh {
  paths: Set<string>; // changed files that are new or changed again since you last selected them
  edits: Set<string>; // agent edits that arrived since you last selected them (see editKey)
}
const NOTHING_FRESH: Fresh = { paths: new Set(), edits: new Set() };

// What is on screen: the repo, the branch being viewed (null: the checked-out one) and its data.
interface Shown {
  repo: string | null;
  branch: string | null;
  snap: Snapshot | null;
}

// What the screens show from a snapshot, as one string: two snapshots with the same signature look the same.
// An agent's session file is written constantly (every message), but most writes change nothing on screen.
function visible(snap: Snapshot): string {
  const sessions = snap.timeline.sessions.map((session) => {
    // Commands are not shown, so they don't count.
    const turns = session.turns.map((turn) => [turn.prompt, turn.events.filter((event) => event.k !== "run").length]);
    return [session.id, session.title, turns];
  });
  const commits = snap.timeline.commits.map((commit) => commit.sha);
  return JSON.stringify([snap.head, snap.branch, snap.diffs, commits, sessions]);
}

// What is new in `next` compared with `prev`: files whose change differs, edits that weren't there.
function newSince(prev: Snapshot, next: Snapshot): Fresh {
  const paths = new Set(Object.keys(next.diffs).filter((path) => prev.diffs[path] !== next.diffs[path]));
  const before = new Set(buildTimeline(prev).edits.map(editKey));
  const edits = new Set(
    buildTimeline(next)
      .edits.map(editKey)
      .filter((key) => !before.has(key)),
  );
  return { paths, edits };
}

// A folder's name, for messages: the last part of its path.
const folderName = (path: string) => path.split("/").filter(Boolean).pop() || path;

export function useLiveRepo() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true); // opening a repo or a manual refresh: the refresh button spins
  const [opening, setOpening] = useState<Opening | null>(null);
  const [updating, setUpdating] = useState(false); // a reload after a change: only the Live dot shows it
  const [error, setError] = useState<string | null>(null);
  const [live, setLiveState] = useState(readLive);
  const [pending, setPending] = useState<Waiting | null>(null); // what a reload would change, while paused
  const [fresh, setFresh] = useState<Fresh>(NOTHING_FRESH);
  const shown = useRef<Shown>({ repo: null, branch: null, snap: null });
  const generation = useRef(0); // counts loads, so the result of one that was overtaken can be dropped
  const busy = useRef(false); // a load is in flight
  const foreground = useRef(false); // ... and you asked for it (it wasn't a quiet reload)
  const failed = useRef<{ path: string; branch: string | null } | null>(null); // what Retry loads again
  const reloadQueued = useRef(false); // a change was reported while a load was in flight

  // Fetch the repo's data. A reload of the same repo adds what is new to `fresh`; another repo starts over.
  const pull = useCallback(async (path: string, branch: string | null, quiet: boolean) => {
    // Coalesce automatic updates. A selection starts immediately and supersedes older results.
    if (quiet && busy.current) {
      reloadQueued.current = true;
      return;
    }
    const id = ++generation.current;
    busy.current = true;
    foreground.current = !quiet;
    setUpdating(quiet);
    setLoading(!quiet);
    const before = shown.current;
    const repoChanged = before.repo !== path;
    const switching = repoChanged || before.branch !== branch;
    const checkedOut = before.snap?.branches.find((row) => row.current)?.name;
    const label = repoChanged ? folderName(path) : branch || checkedOut || "working folder";
    if (!quiet) {
      failed.current = null;
      setError(null);
      setPending(null);
      setOpening(switching ? { repoChanged, label } : null);
    }
    try {
      const next = await loadSnapshot(path, branch);
      if (id !== generation.current) return;
      const now = shown.current;
      const same = now.repo === path && now.branch === branch;
      if (quiet && same && now.snap && visible(now.snap) === visible(next)) return; // nothing new to show
      if (same && now.snap) {
        const added = newSince(now.snap, next);
        setFresh((old) => ({
          paths: new Set([...old.paths, ...added.paths]),
          edits: new Set([...old.edits, ...added.edits]),
        }));
      } else {
        setFresh(NOTHING_FRESH);
        // Watch the folder the data came from (a branch checked out in a worktree is read from there).
        if (inTauri) watchRepo(next.path).catch((e) => console.warn("Live updates unavailable:", e));
      }
      shown.current = { repo: path, branch, snap: next };
      setSnap(next);
      rememberRepo(path);
    } catch (e) {
      if (id === generation.current && !quiet) {
        failed.current = { path, branch };
        setError(`${switching ? `Couldn't open ${label}` : "Couldn't reload"}. ${String(e)}`);
      }
    } finally {
      if (id === generation.current) {
        busy.current = false;
        foreground.current = false;
        setLoading(false);
        setUpdating(false);
        setOpening(null);
        if (reloadQueued.current) {
          reloadQueued.current = false;
          const { repo, branch } = shown.current;
          if (repo) void pull(repo, branch, true);
        }
      }
    }
  }, []);

  const open = useCallback((path: string) => pull(path, null, false), [pull]);
  // Show another branch of the open repo (read-only), or the checked-out one again with null.
  const viewBranch = useCallback(
    (branch: string | null) => {
      const { repo } = shown.current;
      if (repo) pull(repo, branch, false);
    },
    [pull],
  );
  const refresh = useCallback(() => {
    const { repo, branch } = shown.current;
    if (repo && !foreground.current) pull(repo, branch, false);
  }, [pull]);
  const retry = useCallback(() => {
    const target = failed.current;
    if (target) void pull(target.path, target.branch, false);
  }, [pull]);
  const dismissError = useCallback(() => setError(null), []);

  // Open the last repo, or the one an agent worked in most recently.
  useEffect(() => {
    async function openFirst() {
      const last = lastRepo();
      if (last) {
        await open(last);
        return;
      }
      const repos = await loadRepos().catch(() => []);
      if (repos[0]) {
        await open(repos[0].full);
        return;
      }
      setLoading(false);
    }
    void openFirst();
  }, [open]);

  // While paused, a change report only counts when a reload would show something different: checked in the
  // background, one check at a time, without touching the screen.
  const checking = useRef(false);
  const checkQueued = useRef(false);
  const check = useCallback(async (path: string) => {
    if (checking.current) {
      checkQueued.current = true;
      return;
    }
    checking.current = true;
    const id = generation.current;
    const branch = shown.current.branch;
    try {
      const next = await loadSnapshot(path, branch);
      const now = shown.current;
      const stillShown = !busy.current && id === generation.current && now.repo === path && now.branch === branch;
      if (stillShown && now.snap && visible(now.snap) !== visible(next)) setPending(whatChanged(now.snap, next));
    } catch {
      /* the next change report checks again */
    } finally {
      checking.current = false;
      if (checkQueued.current) {
        checkQueued.current = false;
        if (shown.current.repo && !busy.current) check(shown.current.repo);
      }
    }
  }, []);

  // Change reports from the watcher: reload now when Live, or check whether changes are waiting.
  const liveNow = useRef(live);
  liveNow.current = live;
  useEffect(() => {
    if (!inTauri) return;
    const listening = onRepoChanged(() => {
      const { repo, branch } = shown.current;
      if (!repo) return;
      if (liveNow.current) pull(repo, branch, true);
      else check(repo);
    });
    listening.catch((e) => console.warn("Live updates unavailable:", e));
    return () => {
      listening.then((stop) => stop()).catch(() => {});
    };
  }, [pull, check]);

  const setLive = useCallback(
    (on: boolean) => {
      setLiveState(on);
      setItem(LIVE_KEY, on ? "on" : "off");
      if (on && pending) {
        setPending(null);
        const { repo, branch } = shown.current;
        if (repo) pull(repo, branch, true);
      }
    },
    [pending, pull],
  );

  // Selecting a marked file or edit means you've seen it.
  const seen = useCallback((kind: keyof Fresh, key: string) => {
    setFresh((old) => {
      if (!old[kind].has(key)) return old;
      const rest = new Set(old[kind]);
      rest.delete(key);
      return { ...old, [kind]: rest };
    });
  }, []);

  return {
    snap,
    loading,
    opening,
    updating,
    error,
    retry,
    dismissError,
    live,
    setLive,
    pending,
    fresh,
    seen,
    open,
    viewBranch,
    refresh,
    liveAvailable: inTauri,
  };
}
