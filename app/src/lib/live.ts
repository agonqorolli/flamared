// The open repo's data, kept current: loads it, reloads when the Rust side reports a change (Live), and remembers
// which files and edits are new since you last looked, so the screens can mark them.
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { lastRepo, loadRepos, loadSnapshot, rememberRepo } from "./api";
import { buildTimeline, editKey } from "./timeline";
import type { Snapshot } from "./types";

const inTauri = "__TAURI_INTERNALS__" in window;
const LIVE_KEY = "live";
const readLive = () => {
  try {
    return localStorage.getItem(LIVE_KEY) !== "off";
  } catch {
    return true;
  }
};

export interface Fresh {
  paths: Set<string>; // changed files that are new or changed again since you last selected them
  edits: Set<string>; // agent edits that arrived since you last selected them (see editKey)
}
const NONE: Fresh = { paths: new Set(), edits: new Set() };

// What is new in `next` compared with `prev`: files whose change differs, edits that weren't there.
function newSince(prev: Snapshot, next: Snapshot): Fresh {
  const paths = new Set(Object.keys(next.diffs).filter((p) => prev.diffs[p] !== next.diffs[p]));
  const before = new Set(buildTimeline(prev).edits.map(editKey));
  const edits = new Set(buildTimeline(next).edits.map(editKey).filter((k) => !before.has(k)));
  return { paths, edits };
}

export function useLiveRepo() {
  const [repo, setRepo] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true); // opening a repo or a manual refresh: the refresh button spins
  const [updating, setUpdating] = useState(false); // a reload after a change: only the Live dot shows it
  const [error, setError] = useState<string | null>(null);
  const [live, setLiveState] = useState(readLive);
  const [pending, setPending] = useState(false); // changes arrived while paused
  const [fresh, setFresh] = useState<Fresh>(NONE);
  const current = useRef<{ repo: string | null; snap: Snapshot | null }>({ repo: null, snap: null });
  const busy = useRef(false);
  const again = useRef(false);

  // Fetch the repo's data. A reload of the same repo adds what is new to `fresh`; another repo starts over.
  const pull = useCallback(async (path: string, quiet: boolean) => {
    if (busy.current) return void (again.current = true); // one reload at a time; one more after it if needed
    busy.current = true;
    (quiet ? setUpdating : setLoading)(true);
    if (!quiet) setError(null);
    try {
      const s = await loadSnapshot(path);
      const prev = current.current;
      if (prev.repo === path && prev.snap) {
        const n = newSince(prev.snap, s);
        setFresh((f) => ({ paths: new Set([...f.paths, ...n.paths]), edits: new Set([...f.edits, ...n.edits]) }));
      } else {
        setFresh(NONE);
        if (inTauri) invoke("watch", { repo: path }).catch((e) => console.warn("Live updates unavailable:", e));
      }
      current.current = { repo: path, snap: s };
      setSnap(s);
      setRepo(path);
      rememberRepo(path);
    } catch (e) {
      if (!quiet) setError(String(e)); // a failed reload keeps what is on screen
    } finally {
      busy.current = false;
      (quiet ? setUpdating : setLoading)(false);
      if (again.current) {
        again.current = false;
        pull(path, true);
      }
    }
  }, []);

  const open = useCallback((path: string) => pull(path, false), [pull]);
  const refresh = useCallback(() => {
    const r = current.current.repo;
    if (r) pull(r, false), setPending(false);
  }, [pull]);

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

  // Change reports from the watcher: reload now when Live, or note that changes are waiting.
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => {
    if (!inTauri) return;
    const off = listen<string>("repo-changed", () => {
      const r = current.current.repo;
      if (!r) return;
      if (liveRef.current) pull(r, true);
      else setPending(true);
    });
    off.catch((e) => console.warn("Live updates unavailable:", e));
    return () => void off.then((f) => f()).catch(() => {});
  }, [pull]);

  const setLive = useCallback(
    (on: boolean) => {
      setLiveState(on);
      try {
        localStorage.setItem(LIVE_KEY, on ? "on" : "off");
      } catch {
        /* remembered for this session only */
      }
      if (on && pending) {
        setPending(false);
        const r = current.current.repo;
        if (r) pull(r, true);
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

  return { repo, snap, loading, updating, error, live, setLive, pending, fresh, seen, open, refresh, liveAvailable: inTauri };
}
