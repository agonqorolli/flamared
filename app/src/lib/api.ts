import { invoke } from "@tauri-apps/api/core";
import type { RepoRow, Snapshot } from "./types";

// Outside the Tauri window (a plain browser in development) the dev server hands out a saved snapshot.
const inTauri = "__TAURI_INTERNALS__" in window;
const saved = () => fetch("/__snapshot.json").then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : Promise.reject("No saved snapshot (set SNAPSHOT_FILE)")));

export const loadSnapshot = (repo: string, base = "HEAD") => (inTauri ? invoke<Snapshot>("snapshot", { repo, base }) : saved());
export const loadRepos = () => (inTauri ? invoke<RepoRow[]>("repos") : saved().then((s) => s.repos));

// The last repo opened; per-viewer convenience, so browser storage is fine (and may be unavailable).
const LAST_REPO = "last-repo";
export const lastRepo = () => {
  try {
    return localStorage.getItem(LAST_REPO);
  } catch {
    return null;
  }
};
export const rememberRepo = (path: string) => {
  try {
    localStorage.setItem(LAST_REPO, path);
  } catch {
    /* not saved: the app opens the most recent repo next time */
  }
};
