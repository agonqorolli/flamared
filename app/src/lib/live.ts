// The open repo's data, kept current: loads it, reloads when the Rust side reports a change (Live), and remembers
// which files and edits are new since you last looked, so the screens can mark them.
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { lastRepo, loadRepos, loadSnapshot, rememberRepo } from "./api";
import { buildTimeline, editKey } from "./timeline";
import { whatChanged, type Waiting } from "./waiting";
import type { Snapshot } from "./types";
import { getItem, setItem } from "./store";

const inTauri = "__TAURI_INTERNALS__" in window;
const LIVE_KEY = "live";
const readLive = () => {
  try {
    return getItem(LIVE_KEY) !== "off";
  } catch {
    return true;
  }
};

export interface Opening {
  repoChanged: boolean;
}

export interface Fresh {
  paths: Set<string>; // changed files that are new or changed again since you last selected them
  edits: Set<string>; // agent edits that arrived since you last selected them (see editKey)
}
const NONE: Fresh = { paths: new Set(), edits: new Set() };

// What the screens show from a snapshot, as one string: two snapshots with the same signature look the same.
// An agent's session file is written constantly (every message), but most writes change nothing on screen.
function visible(s: Snapshot): string {
  return JSON.stringify([
    s.head,
    s.branch,
    s.diffs,
    s.timeline.commits.map((c) => c.sha),
    s.timeline.sessions.map((x) => [
      x.id,
      x.title,
      x.turns.map((t) => [t.prompt, t.events.filter((e) => e.k !== "run").length]),
    ]), // commands are not shown
  ]);
}

// What is new in `next` compared with `prev`: files whose change differs, edits that weren't there.
function newSince(prev: Snapshot, next: Snapshot): Fresh {
  const paths = new Set(Object.keys(next.diffs).filter((p) => prev.diffs[p] !== next.diffs[p]));
  const before = new Set(buildTimeline(prev).edits.map(editKey));
  const edits = new Set(
    buildTimeline(next)
      .edits.map(editKey)
      .filter((k) => !before.has(k)),
  );
  return { paths, edits };
}

export function useLiveRepo() {
  const [repo, setRepo] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true); // opening a repo or a manual refresh: the refresh button spins
  const [opening, setOpening] = useState<Opening | null>(null);
  const [updating, setUpdating] = useState(false); // a reload after a change: only the Live dot shows it
  const [error, setError] = useState<string | null>(null);
  const [live, setLiveState] = useState(readLive);
  const [pending, setPending] = useState<Waiting | null>(null); // what a reload would change, while paused
  const [fresh, setFresh] = useState<Fresh>(NONE);
  const current = useRef<{ repo: string | null; branch: string | null; snap: Snapshot | null }>({
    repo: null,
    branch: null,
    snap: null,
  });
  const generation = useRef(0);
  const busy = useRef(false);
  const foreground = useRef(false);
  const failed = useRef<{ path: string; branch: string | null } | null>(null);
  const again = useRef(false);

  // Fetch the repo's data. A reload of the same repo adds what is new to `fresh`; another repo starts over.
  const pull = useCallback(async (path: string, branch: string | null, quiet: boolean) => {
    // Coalesce automatic updates. A selection starts immediately and supersedes older results.
    if (quiet && busy.current) return void (again.current = true);
    const id = ++generation.current;
    busy.current = true;
    foreground.current = !quiet;
    setUpdating(quiet);
    setLoading(!quiet);
    const prev = current.current;
    const switching = prev.repo !== path || prev.branch !== branch;
    const label =
      prev.repo !== path
        ? path.split("/").filter(Boolean).pop() || path
        : branch || prev.snap?.branches.find((b) => b.current)?.name || "working folder";
    if (!quiet) {
      failed.current = null;
      setError(null);
      setPending(null);
      setOpening(switching ? { repoChanged: prev.repo !== path } : null);
    }
    try {
      const s = await loadSnapshot(path, branch);
      if (id !== generation.current) return;
      const prev = current.current;
      const same = prev.repo === path && prev.branch === branch;
      if (quiet && same && prev.snap && visible(prev.snap) === visible(s)) return; // nothing new to show
      if (same && prev.snap) {
        const n = newSince(prev.snap, s);
        setFresh((f) => ({ paths: new Set([...f.paths, ...n.paths]), edits: new Set([...f.edits, ...n.edits]) }));
      } else {
        setFresh(NONE);
        // Watch the folder the data came from (a branch checked out in a worktree is read from there).
        if (inTauri) invoke("watch", { repo: s.path }).catch((e) => console.warn("Live updates unavailable:", e));
      }
      current.current = { repo: path, branch, snap: s };
      setSnap(s);
      setRepo(path);
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
        if (again.current) {
          again.current = false;
          const shown = current.current;
          if (shown.repo) void pull(shown.repo, shown.branch, true);
        }
      }
    }
  }, []);

  const open = useCallback(
    (path: string) => {
      return pull(path, null, false);
    },
    [pull],
  );
  // Show another branch of the open repo (read-only), or the checked-out one again with null.
  const viewBranch = useCallback(
    (branch: string | null) => {
      const r = current.current.repo;
      if (!r) return;
      pull(r, branch, false);
    },
    [pull],
  );
  const refresh = useCallback(() => {
    const shown = current.current;
    if (shown.repo && !foreground.current) pull(shown.repo, shown.branch, false);
  }, [pull]);
  const retry = useCallback(() => {
    const target = failed.current;
    if (target) void pull(target.path, target.branch, false);
  }, [pull]);
  const dismissError = useCallback(() => setError(null), []);

  // Open the last repo, or the one an agent worked in most recently.
  useEffect(() => {
    (async () => {
      const last = lastRepo();
      if (last) return open(last);
      const repos = await loadRepos().catch(() => []);
      if (repos[0]) return open(repos[0].full);
      setLoading(false);
    })();
  }, [open]);

  // While paused, a change report only counts when a reload would show something different: checked in the
  // background, one check at a time, without touching the screen.
  const checking = useRef(false);
  const checkAgain = useRef(false);
  const check = useCallback(async (path: string) => {
    if (checking.current) return void (checkAgain.current = true);
    checking.current = true;
    const id = generation.current;
    const branch = current.current.branch;
    try {
      const s = await loadSnapshot(path, branch);
      const shown = current.current.snap;
      if (
        !busy.current &&
        id === generation.current &&
        current.current.repo === path &&
        current.current.branch === branch &&
        shown &&
        visible(shown) !== visible(s)
      )
        setPending(whatChanged(shown, s));
    } catch {
      /* the next change report checks again */
    } finally {
      checking.current = false;
      if (checkAgain.current) {
        checkAgain.current = false;
        if (current.current.repo && !busy.current) check(current.current.repo);
      }
    }
  }, []);

  // Change reports from the watcher: reload now when Live, or check whether changes are waiting.
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => {
    if (!inTauri) return;
    const off = listen<string>("repo-changed", () => {
      const r = current.current.repo;
      if (!r) return;
      if (liveRef.current) pull(r, current.current.branch, true);
      else check(r);
    });
    off.catch((e) => console.warn("Live updates unavailable:", e));
    return () => void off.then((f) => f()).catch(() => {});
  }, [pull, check]);

  const setLive = useCallback(
    (on: boolean) => {
      setLiveState(on);
      try {
        setItem(LIVE_KEY, on ? "on" : "off");
      } catch {
        /* remembered for this session only */
      }
      if (on && pending) {
        setPending(null);
        const r = current.current.repo;
        if (r) pull(r, current.current.branch, true);
      }
    },
    [pending, pull],
  );

  // Selecting a marked file or edit means you've seen it.
  const seen = useCallback((kind: keyof Fresh, key: string) => {
    setFresh((f) => {
      if (!f[kind].has(key)) return f;
      const next = new Set(f[kind]);
      next.delete(key);
      return { ...f, [kind]: next };
    });
  }, []);

  return {
    repo,
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
