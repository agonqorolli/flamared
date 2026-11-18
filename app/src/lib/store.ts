// What the app remembers between launches: settings, review marks, Live/Paused, recent repos.
// In the app it lives in state.json in the app's data folder (src-tauri/src/state.rs), read once at start so
// reads stay instant; in a plain browser (development preview) it falls back to localStorage.
import { inTauri, loadState, saveState } from "./api";

let cache: Record<string, string> = {};

function fromLocalStorage() {
  const saved: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) saved[key] = localStorage.getItem(key) ?? "";
    }
  } catch {
    /* storage blocked: start empty */
  }
  return saved;
}

// Call once before the first render. The first time in the app, whatever the window had saved in its own
// storage is carried over into the file.
export async function initStore() {
  if (!inTauri) {
    cache = fromLocalStorage();
    return;
  }
  try {
    cache = await loadState();
  } catch {
    cache = {};
  }
  if (!Object.keys(cache).length) {
    for (const [key, value] of Object.entries(fromLocalStorage())) setItem(key, value);
  }
}

export const getItem = (key: string): string | null => cache[key] ?? null;

// Every saved key, for clearing a kind of value at once (all review marks).
export const savedKeys = () => Object.keys(cache);

export function setItem(key: string, value: string) {
  cache[key] = value;
  if (inTauri) {
    saveState(key, value).catch((e) => console.warn("Couldn't save", key, e));
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* kept for this session only */
  }
}

export function removeItem(key: string) {
  delete cache[key];
  if (inTauri) {
    saveState(key, null).catch(() => {});
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}

// A value saved as JSON; `fallback` when nothing is saved or what is saved can't be read.
export function getJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export const setJson = (key: string, value: unknown) => setItem(key, JSON.stringify(value));
