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
  next: { key: "k" },
  prev: { key: "j" },
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
      { ids: ["prev", "next"], does: "Previous / next file" },
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
      { ids: ["prev", "next"], does: "Previous / next edit" },
      { ids: ["agent"], does: "Show or hide the agent's messages" },
      { ids: ["toChanges", "toMap"], does: "Show the file in Changes / Map" },
      { ids: ["splitDiff"], does: "Diff side by side or in one column" },
    ],
  },
  {
    scope: "Map",
    rows: [
      {
        ids: ["lensSize", "lensRework", "lensFinal", "lensFlags"],
        does: "Color by Change size / Rework / Still in final / Flags",
      },
      { ids: ["toChanges", "toTimeline"], does: "Show the selected file in Changes / Timeline" },
      { ids: ["back"], does: "Back to the overview, then out of a zoomed folder" },
    ],
  },
];

// "⌘ 1", "J", "Esc": the parts of a key as shown.
export function keyParts(id: KeyId): string[] {
  const key: Key = KEYS[id];
  const name = key.label ?? (key.key.length === 1 ? key.key.toUpperCase() : key.key);
  return key.mod ? ["⌘", name] : [name];
}
// For a button's hover text: "Show in Map (M)".
export const hint = (id: KeyId) => keyParts(id).join("");

// Is this the shortcut? Plain keys don't count while typing in a field or with a dialog or menu open, so they
// never get in the way; ⌘ keys always do.
export function is(event: KeyboardEvent, id: KeyId): boolean {
  const key: Key = KEYS[id];
  if (key.mod) return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === key.key;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  const pressed = key.key.length === 1 ? event.key.toLowerCase() : event.key; // a letter counts in either case
  if (pressed !== key.key) return false;
  return !isBusy(event);
}

// Typing in a field, or a dialog, menu or list is open.
function isBusy(event: KeyboardEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("input, textarea, select, [contenteditable=true], [cmdk-root]")) return true;
  const open = "[role=dialog][data-state=open], [role=menu][data-state=open], [role=listbox][data-state=open]";
  return !!document.querySelector(open);
}

type Actions = Partial<Record<KeyId, (() => void) | false | "" | null | undefined>>;

// Listen for a screen's shortcuts while `on`: { next: () => …, toMap: hasFile && (() => …) }. A falsy action
// leaves that key alone. Registered fresh each render, so the actions always see current state.
export function useKeys(on: boolean, actions: Actions) {
  useEffect(() => {
    if (!on) return;
    const onKeyDown = (event: KeyboardEvent) => {
      for (const [id, run] of Object.entries(actions) as [KeyId, Actions[KeyId]][]) {
        if (run && is(event, id)) {
          event.preventDefault();
          run();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}

// How long ⌘ is held before the key badges show.
const HINT_DELAY_MS = 250;

// Hold ⌘ to see each button's key next to it. Shown after a short hold, so ⌘R and the other ⌘ shortcuts don't flash
// them; gone on release, on any other key, or when the window loses focus.
export function useKeyHints() {
  useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      clearTimeout(timer);
      root.toggleAttribute("data-key-hints", false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Meta") {
        hide();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => root.toggleAttribute("data-key-hints", true), HINT_DELAY_MS);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Meta" || !event.metaKey) hide();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", hide);
    window.addEventListener("mousedown", hide);
    return () => {
      hide();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", hide);
      window.removeEventListener("mousedown", hide);
    };
  }, []);
}
