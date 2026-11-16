// Every keyboard shortcut in one place: the screens check keys with `is(e, id)` and Settings → Keyboard lists them
// from here, so the two never disagree.
import { useEffect } from "react";

export type Scope = "Everywhere" | "Changes" | "Timeline" | "Map";

interface Key {
  key: string; // KeyboardEvent.key, lowercase for letters
  mod?: boolean; // ⌘ on a Mac
  label?: string; // how to show it, when not the key itself
}

export const KEYS = {
  goChanges: { key: "1", mod: true },
  goTimeline: { key: "2", mod: true },
  goMap: { key: "3", mod: true },
  reload: { key: "r", mod: true },
  openFolder: { key: "o", mod: true },
  live: { key: "l" },
  splitDiff: { key: "s" },
  settings: { key: ",", mod: true },
  shortcuts: { key: "?" },
  next: { key: "j" },
  prev: { key: "k" },
  looksGood: { key: "g" },
  needsWork: { key: "w" },
  agent: { key: "a" },
  toChanges: { key: "c" },
  toTimeline: { key: "t" },
  toMap: { key: "m" },
  lensSize: { key: "1" },
  lensRework: { key: "2" },
  lensFinal: { key: "3" },
  lensFlags: { key: "4" },
  back: { key: "Escape", label: "Esc" },
} satisfies Record<string, Key>;
export type KeyId = keyof typeof KEYS;

// What Settings → Keyboard shows, by screen. A row can list several keys ("J / K").
export const SHORTCUT_ROWS: { scope: Scope; rows: { ids: KeyId[]; does: string; note?: string }[] }[] = [
  {
    scope: "Everywhere",
    rows: [
      { ids: ["goChanges", "goTimeline", "goMap"], does: "Go to Changes / Timeline / Map" },
      { ids: ["reload"], does: "Reload now", note: "also while paused" },
      { ids: ["live"], does: "Switch between Live and Paused", note: "desktop app" },
      { ids: ["openFolder"], does: "Open a folder", note: "desktop app" },
      { ids: ["settings"], does: "Settings" },
      { ids: ["shortcuts"], does: "This list of shortcuts" },
    ],
  },
  {
    scope: "Changes",
    rows: [
      { ids: ["next", "prev"], does: "Next / previous file" },
      { ids: ["looksGood"], does: "Mark Looks good", note: "then opens the next unchecked file" },
      { ids: ["needsWork"], does: "Mark Needs work", note: "then opens the next unchecked file" },
      { ids: ["agent"], does: "Show or hide the agent's messages" },
      { ids: ["toTimeline", "toMap"], does: "Show the file in Timeline / Map" },
      { ids: ["splitDiff"], does: "Diff side by side or in one column" },
    ],
  },
  {
    scope: "Timeline",
    rows: [
      { ids: ["next", "prev"], does: "Next / previous edit" },
      { ids: ["agent"], does: "Show or hide the agent's messages" },
      { ids: ["toChanges", "toMap"], does: "Show the file in Changes / Map" },
      { ids: ["splitDiff"], does: "Diff side by side or in one column" },
    ],
  },
  {
    scope: "Map",
    rows: [
      { ids: ["lensSize", "lensRework", "lensFinal", "lensFlags"], does: "Color by Change size / Rework / Still in final / Flags" },
      { ids: ["toChanges", "toTimeline"], does: "Show the selected file in Changes / Timeline" },
      { ids: ["back"], does: "Back to the overview, then out of a zoomed folder" },
    ],
  },
];

// "⌘ 1", "J", "Esc": the parts of a key as shown.
export const keyParts = (id: KeyId): string[] => {
  const k: Key = KEYS[id];
  const name = k.label ?? (k.key.length === 1 ? k.key.toUpperCase() : k.key);
  return k.mod ? ["⌘", name] : [name];
};
// For a button's hover text: "Show in Map (M)".
export const hint = (id: KeyId) => keyParts(id).join("");

// Is this the shortcut? Plain keys don't count while typing in a field or with a dialog or menu open, so they
// never get in the way; ⌘ keys always do.
export function is(e: KeyboardEvent, id: KeyId): boolean {
  const k: Key = KEYS[id];
  if (k.mod) return (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === k.key;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (k.key.length === 1 ? e.key.toLowerCase() !== k.key : e.key !== k.key) return false;
  return !busy(e);
}

function busy(e: KeyboardEvent) {
  const t = e.target instanceof Element ? e.target : null;
  if (t?.closest("input, textarea, select, [contenteditable=true], [cmdk-root]")) return true;
  return !!document.querySelector("[role=dialog][data-state=open], [role=menu][data-state=open], [role=listbox][data-state=open]");
}

type Actions = Partial<Record<KeyId, (() => void) | false | "" | null | undefined>>;

// Listen for a screen's shortcuts while `on`: { next: () => …, toMap: hasFile && (() => …) }. A falsy action
// leaves that key alone. Registered fresh each render, so the actions always see current state.
export function useKeys(on: boolean, actions: Actions) {
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      for (const [id, run] of Object.entries(actions) as [KeyId, Actions[KeyId]][]) {
        if (run && is(e, id)) {
          e.preventDefault();
          run();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

// Hold ⌘ to see each button's key next to it. Shown after a short hold, so ⌘R and the other ⌘ shortcuts don't flash
// them; gone on release, on any other key, or when the window loses focus.
export function useKeyHints() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (on: boolean) => {
      clearTimeout(timer);
      document.documentElement.toggleAttribute("data-key-hints", on);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key !== "Meta") return show(false);
      clearTimeout(timer);
      timer = setTimeout(() => document.documentElement.toggleAttribute("data-key-hints", true), 250);
    };
    const up = (e: KeyboardEvent) => (e.key === "Meta" || !e.metaKey) && show(false);
    const off = () => show(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", off);
    window.addEventListener("mousedown", off);
    return () => {
      off();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", off);
      window.removeEventListener("mousedown", off);
    };
  }, []);
}
