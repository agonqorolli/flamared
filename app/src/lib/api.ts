// Everything the window asks of the Rust side, one function per command. This is the only file that imports
// @tauri-apps or knows a command's name; the Rust end of each is in src-tauri/src (commands.rs, watch.rs, state.rs,
// license.rs, agents.rs).
//
// Outside the Tauri window (a plain browser in development) there is no Rust side. The dev server hands out one
// saved snapshot instead, and the modules with a stand-in of their own (store.ts, license.tsx) check `inTauri`.
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type { AgentFolder, AgentId, BranchFiles, LicenseStatus, RepoRow, RepoStatus, Snapshot } from "./types";

export const inTauri = "__TAURI_INTERNALS__" in window;

async function savedSnapshot(): Promise<Snapshot> {
  const response = await fetch("/__snapshot.json");
  if (!response.ok) throw "No saved snapshot (set SNAPSHOT_FILE)";
  return response.json();
}

// --- A repo's data (commands.rs)

// `branch`: another branch to view read-only; none for the checked-out one.
export const loadSnapshot = (repo: string, branch: string | null = null) =>
  inTauri ? invoke<Snapshot>("snapshot", { repo, branch }) : savedSnapshot();

export const loadRepos = () => (inTauri ? invoke<RepoRow[]>("repos") : savedSnapshot().then((snap) => snap.repos));

// Read when a picker opens; the browser preview has no git, so nothing comes back there.
export const loadRepoStatus = (repos: string[]) =>
  inTauri ? invoke<RepoStatus[]>("repo_status", { repos }) : Promise.resolve([]);
export const loadBranchFiles = (repo: string) =>
  inTauri ? invoke<Record<string, BranchFiles>>("branch_files", { repo }) : Promise.resolve({});

export const canPickFolder = inTauri;

// The native folder picker; resolves to the picked folder's repo (its top folder), null when cancelled, or throws
// a plain-language reason when the folder isn't in a git repo.
export async function pickRepoFolder(): Promise<string | null> {
  const folder = await openDialog({ directory: true, multiple: false, title: "Open a repository" });
  if (!folder || Array.isArray(folder)) return null;
  return invoke<string>("repo_root", { path: folder });
}

// --- Live updates (watch.rs). Only in the app.

// Watch a repo's folder and the agents' session folders, replacing any earlier watch.
export const watchRepo = (repo: string) => invoke<void>("watch", { repo });
// Called after each burst of changes that matters; resolves to a function that stops listening.
export const onRepoChanged = (handler: () => void) => listen<string>("repo-changed", handler);

// --- Saved state (state.rs). Only in the app.

export const loadState = () => invoke<Record<string, string>>("state_load");
// `null` removes the value.
export const saveState = (key: string, value: string | null) => invoke<void>("state_save", { key, value });

// --- Where the agents' sessions are read from (agents.rs). Only in the app.

export const agentFolders = () => invoke<AgentFolder[]>("agent_folders");

// Asks for the agent's folder with the native picker; resolves to every agent's folder after the change, null when
// cancelled, or throws a plain-language reason when the folder holds none of that agent's sessions.
export async function pickAgentFolder(agent: AgentId, name: string): Promise<AgentFolder[] | null> {
  const folder = await openDialog({ directory: true, multiple: false, title: `Where ${name} keeps its sessions` });
  if (!folder || Array.isArray(folder)) return null;
  return invoke<AgentFolder[]>("agent_folder_set", { agent, path: folder });
}

// Back to the agent's own default folder.
export const resetAgentFolder = (agent: AgentId) => invoke<AgentFolder[]>("agent_folder_set", { agent, path: null });

// Called after an agent's folder changed; resolves to a function that stops listening.
export const onAgentsChanged = (handler: () => void) => listen("agents-changed", handler);

// --- License (license.rs). Only in the app.

export const licenseStatus = () => invoke<LicenseStatus>("license_status");
export const activateLicense = (key: string) => invoke<LicenseStatus>("license_activate", { key });
export const removeLicense = () => invoke<LicenseStatus>("license_remove");

// --- Updates (tauri-plugin-updater; where to look is in tauri.conf.json). Only in the app.

export const appVersion = () => getVersion();

// Looks for a newer version and, when there is one, downloads and installs it, calling `onFound` with its version
// before the download starts. Resolves to that version, or null when this is the newest. The installed version
// runs from the next start (`restartApp`).
export async function installUpdate(onFound: (version: string) => void): Promise<string | null> {
  const update = await check();
  if (!update) return null;
  onFound(update.version);
  await update.downloadAndInstall();
  return update.version;
}

export const restartApp = () => relaunch();

// --- The window and the system

// The window buttons' look; `null` leaves it to macOS.
export const setWindowTheme = (theme: "light" | "dark" | null) => getCurrentWindow().setTheme(theme);

// Shows a file or folder in the Finder, selected.
export const showInFinder = (path: string) => revealItemInDir(path);

// Opens a web page in the default browser (in the browser preview, a new tab).
export const openInBrowser = (url: string) => openUrl(url).catch(() => window.open(url, "_blank"));
