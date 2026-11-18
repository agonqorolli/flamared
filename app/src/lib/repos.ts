// The repos you opened: the last one (opened again at the next launch) and the recent ones, which stay in the
// repo picker even when no agent session points to them. Saved in the app's data folder (see store.ts).
import { getItem, getJson, removeItem, setItem, setJson } from "./store";

const LAST_REPO = "last-repo";
const RECENT_REPOS = "recent-repos";
const MAX_RECENT = 12;

export interface RecentRepo {
  path: string;
  at: string; // when it was last opened
}

export const lastRepo = () => getItem(LAST_REPO);
export const recentRepos = () => getJson<RecentRepo[]>(RECENT_REPOS, []);

// Empties the recent list (Settings → About); the open repo still opens at the next launch.
export const forgetRecentRepos = () => removeItem(RECENT_REPOS);

export function rememberRepo(path: string) {
  setItem(LAST_REPO, path);
  const others = recentRepos().filter((repo) => repo.path !== path);
  setJson(RECENT_REPOS, [{ path, at: new Date().toISOString() }, ...others].slice(0, MAX_RECENT));
}
