import type { Status } from "./types";

export const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
export const dir = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

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
  logic: [
    "Files that work together",
    "Changed files that use each other, found by following the imports between them, so each group is likely one piece of work. Tests join the file they test, matched by name.",
  ],
  shared: [
    "Used by many",
    "Changed files used by 3 or more other changed files, like a theme or helpers. Kept apart so they don’t glue unrelated groups together. A change here can affect everything that uses it.",
  ],
  wiring: [
    "Ties things together",
    "Changed files that use 4 or more other changed files, like an index or a root file that registers everything. Kept apart for the same reason.",
  ],
  loose: [
    "Not connected",
    "Code files that neither use nor are used by any other changed file, grouped by their folder.",
  ],
  tests: [
    "Tests without their source",
    "Test files whose matching source file didn’t change, and that use no other changed file.",
  ],
  support: [
    "Not code",
    "Docs, config, data, assets and other non-code files, grouped by kind. New files not added to git yet are included.",
  ],
} as const;
export type TipKey = keyof typeof TIPS;

export const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
export const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }) : "";

// Is an edit still in the final file? Gray has one meaning (no longer shows); only the tooltip tells the two reasons apart.
export const SURVIVAL = {
  kept: ["in final", "All lines from this edit are still in the file"],
  partly: ["partly rewritten", "Some lines from this edit were changed again later"],
  gone: ["no longer in file", "No longer in the file: later edits replaced all of its lines"],
  undone: ["no longer in file", "No longer in the file: the lines it removed are back"],
} as const;
export type Survival = keyof typeof SURVIVAL;
