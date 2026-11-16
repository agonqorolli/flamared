// What the app remembers between launches: settings, review marks, Live/Paused, recent repos.
// In the app it lives in state.json in the app's data folder (src-tauri/src/state.rs), read once at start so
// reads stay instant; in a plain browser (development preview) it falls back to localStorage.
import { invoke } from "@tauri-apps/api/core";

const inTauri = "__TAURI_INTERNALS__" in window;
let cache: Record<string, string> = {};

const fromLocalStorage = () => {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) out[k] = localStorage.getItem(k) ?? "";
    }
  } catch {
    /* storage blocked: start empty */
  }
  return out;
};

// Call once before the first render. The first time in the app, whatever the window had saved in its own
// storage is carried over into the file.
export async function initStore() {
  if (!inTauri) return void (cache = fromLocalStorage());
  try {
    cache = await invoke<Record<string, string>>("state_load");
  } catch {
    cache = {};
  }
  if (!Object.keys(cache).length) {
    const old = fromLocalStorage();
    for (const [k, v] of Object.entries(old)) setItem(k, v);
  }
}

export const getItem = (key: string): string | null => cache[key] ?? null;
export const keys = () => Object.keys(cache);

export function setItem(key: string, value: string) {
  cache[key] = value;
  if (inTauri) invoke("state_save", { key, value }).catch((e) => console.warn("Couldn't save", key, e));
  else
    try {
      localStorage.setItem(key, value);
    } catch {
      /* kept for this session only */
    }
}

export function removeItem(key: string) {
  delete cache[key];
  if (inTauri) invoke("state_save", { key, value: null }).catch(() => {});
  else
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to remove */
    }
}
