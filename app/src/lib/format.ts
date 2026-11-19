import type { Status } from "./types";

// A path's file name, and the folder it is in ("" at the top).
export const base = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const dir = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

// "1 file", "3 files"; `words` for a word that doesn't just take an s ("branches").
export const plural = (count: number, word: string, words = `${word}s`) => `${count} ${count === 1 ? word : words}`;

export const STATUS: Record<Status, string> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  T: "type changed",
  U: "merge conflict",
  C: "copied",
};

export const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 10080) return `${Math.round(m / 1440)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
};

// What each section of the Changes list means: shown by the ⓘ next to its label.
export const TIPS = {
  logic: {
    title: "Files that work together",
    text: "Changed files that use each other, found by following the imports between them, so each group is likely one piece of work. Tests join the file they test, matched by name.",
  },
  shared: {
    title: "Used by many",
    text: "Changed files used by 3 or more other changed files, like a theme or helpers. Kept apart so they don’t glue unrelated groups together. A change here can affect everything that uses it.",
  },
  wiring: {
    title: "Ties things together",
    text: "Changed files that use 4 or more other changed files, like an index or a root file that registers everything. Kept apart for the same reason.",
  },
  loose: {
    title: "Not part of a group",
    text: "Code files that aren’t grouped with any other changed file, listed by their folder. They may still use a shared building block or a wiring file.",
  },
  tests: {
    title: "Tests without their source",
    text: "Test files whose matching source file didn’t change, and that use no other changed file.",
  },
  support: {
    title: "Not code",
    text: "Docs, config, data, assets and other non-code files, grouped by kind. New files not added to git yet are included.",
  },
  leftOut: {
    title: "Left out by your patterns",
    text: "Changed files that match a pattern in Settings → Files. They are still part of the change, counted at the top and checked for flags, but kept out of the groups, the Timeline and the Map. Folded so you don’t step through them; open the card to see one.",
  },
} as const;
export type TipKey = keyof typeof TIPS;

export const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
export const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }) : "";

// Is an edit still in the final file? Gray has one meaning (no longer shows); only the tooltip tells the two
// reasons apart.
export const SURVIVAL = {
  kept: { label: "in final", tip: "All lines from this edit are still in the file" },
  partly: { label: "partly rewritten", tip: "Some lines from this edit were changed again later" },
  gone: { label: "no longer in file", tip: "No longer in the file: later edits replaced all of its lines" },
  undone: { label: "no longer in file", tip: "No longer in the file: the lines it removed are back" },
} as const;
export type Survival = keyof typeof SURVIVAL;
