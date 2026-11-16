import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { RepoRow, RepoStatus, Snapshot } from "./types";
import { getItem, setItem } from "./store";

// Outside the Tauri window (a plain browser in development) the dev server hands out a saved snapshot.
const inTauri = "__TAURI_INTERNALS__" in window;
const saved = () => fetch("/__snapshot.json").then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : Promise.reject("No saved snapshot (set SNAPSHOT_FILE)")));

// `branch`: another branch to view read-only; none for the checked-out one.
export const loadSnapshot = (repo: string, branch: string | null = null) => (inTauri ? invoke<Snapshot>("snapshot", { repo, branch }) : saved());
export const loadRepos = () => (inTauri ? invoke<RepoRow[]>("repos") : saved().then((s) => s.repos));
export const canPickFolder = inTauri;
// Read when a picker opens; the browser preview has no git, so nothing comes back there.
export const loadRepoStatus = (repos: string[]) => (inTauri ? invoke<RepoStatus[]>("repo_status", { repos }) : Promise.resolve([]));
export const loadBranchFiles = (repo: string) => (inTauri ? invoke<Record<string, number>>("branch_files", { repo }) : Promise.resolve({}));

// The native folder picker; resolves to the picked folder's repo (its top folder), null when cancelled, or throws
// a plain-language reason when the folder isn't in a git repo.
export async function pickRepoFolder(): Promise<string | null> {
  const folder = await openDialog({ directory: true, multiple: false, title: "Open a repository" });
  if (!folder || Array.isArray(folder)) return null;
  return invoke<string>("repo_root", { path: folder });
}

// The last repo opened, and the repos opened recently (they stay in the repo picker even with no agent sessions).
const LAST_REPO = "last-repo";
const RECENT = "recent-repos";
export const lastRepo = () => getItem(LAST_REPO);
export const recentRepos = (): { path: string; at: string }[] => {
  try {
    return JSON.parse(getItem(RECENT) || "[]");
  } catch {
    return [];
  }
};
export const rememberRepo = (path: string) => {
  setItem(LAST_REPO, path);
  const rest = recentRepos().filter((r) => r.path !== path);
  setItem(RECENT, JSON.stringify([{ path, at: new Date().toISOString() }, ...rest].slice(0, 12)));
};
