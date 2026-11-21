// What the Map screen works out from a snapshot: each changed file's numbers, and how each lens colors a file.
import { type FlagRuleId, flagsOn } from "@/lib/flags";
import type { Survival } from "@/lib/format";
import type { KeyId } from "@/lib/keys";
import type { Review, ReviewState } from "@/lib/review";
import { type CheckRun, ms, type Timeline } from "@/lib/timeline";
import type { FileInfo, Snapshot, TimelineEdit } from "@/lib/types";

export type Lens = "size" | "checks" | "review" | "flags";

// How a tile shows what happened to its file, over any lens's color: a new file gets a folded corner, a deleted one
// stripes; a modified file is plain.
export type TileMark = "new" | "deleted" | null;
export function tileMark(file: FileInfo): TileMark {
  if (file.status === "A" || file.status === "C") return "new";
  return file.status === "D" ? "deleted" : null;
}

// Your mark on a file (lib/review.ts): Looks good, Needs work, reset by a newer change, or not reviewed yet.
export type MarkState = ReviewState | "changed" | "none";

// After the agent's last edit of a file: tests ran and passed, only other checks (lint, types, build) passed, the
// latest check failed, or no checks ran. Lint alone says the code is well-formed, not that it works, and agents
// almost always lint at the end, so it doesn't count as tested.
export type CheckState = "tested" | "passed" | "failed" | "noChecks";

// Each check state's tile color, for the Tested lens and its legend.
export const CHECK_COLOR: Record<CheckState, string> = {
  tested: "var(--lens-tested)",
  passed: "var(--lens-passed)",
  failed: "var(--lens-failed)",
  noChecks: "var(--lens-no-checks)",
};

// One changed file as the map sees it.
export interface FileStats {
  file: FileInfo;
  edits: number; // agent edits of it
  survival: Record<Survival, number>; // how many of those edits are kept, partly kept, gone, undone
  flags: string[];
  group?: string;
  check: CheckState | null; // null: no agent edits, or not code (docs, config, assets: checks don't cover them)
  lastCheck: CheckRun | null; // what the state rests on: the passing test run when tested, else the latest check
  mark: MarkState;
  markWas: ReviewState | null; // for a reset mark: what it was
}

export interface MapStats {
  files: Record<string, FileStats>; // by path, in the order of the Changes list
  maxLines: number; // the most lines changed in one file, for the scale of the size lens
}

export function buildStats(
  snap: Snapshot,
  timeline: Timeline,
  review: Pick<Review, "stateOf" | "resetMarkOf">,
  flagsOff: FlagRuleId[], // rules turned off in Settings → Flags
): MapStats {
  const { logic, shared, wiring, loose, loose_tests: looseTests, support } = snap.story;
  const groups = [...logic, ...shared, ...wiring, ...loose.flatMap((folder) => folder.files)];
  const changed = [
    ...groups.flatMap((group) => [...group.files, ...group.tests]),
    ...looseTests,
    ...support.flatMap((kind) => kind.files),
  ];
  const files: Record<string, FileStats> = {};
  for (const file of changed) {
    files[file.path] = {
      file,
      edits: 0,
      survival: { kept: 0, partly: 0, gone: 0, undone: 0 },
      flags: flagsOn(snap.map.flags[file.path] || [], flagsOff),
      group: snap.map.groups[file.path],
      check: null,
      lastCheck: null,
      ...markOf(file, review),
    };
  }
  const lastEdit: Record<string, TimelineEdit> = {};
  for (const edit of timeline.edits) {
    const stats = files[edit.path];
    if (!stats) continue;
    stats.edits++;
    if (edit.survives) stats.survival[edit.survives]++;
    const last = lastEdit[edit.path];
    if (!last || ms(edit.at) > ms(last.at)) lastEdit[edit.path] = edit;
  }
  const notCode = new Set(support.flatMap((kind) => kind.files.map((file) => file.path)));
  for (const [path, edit] of Object.entries(lastEdit)) {
    if (notCode.has(path)) continue;
    const { state, run } = checkState(timeline.checksAfter.get(edit) ?? []);
    files[path].check = state;
    files[path].lastCheck = run;
  }
  const all = Object.values(files);
  return {
    files,
    maxLines: Math.max(1, ...all.map((stats) => stats.file.add + stats.file.rem)),
  };
}

function markOf(file: FileInfo, review: Pick<Review, "stateOf" | "resetMarkOf">) {
  const state = review.stateOf(file);
  if (state) return { mark: state, markWas: null };
  const was = review.resetMarkOf(file);
  return was ? { mark: "changed" as const, markWas: was } : { mark: "none" as const, markWas: null };
}

// A file's state from the checks after its last edit (latest first), and the check it rests on. Tests count when
// any test run after the edit passed, even if a lint run came last.
function checkState(after: CheckRun[]): { state: CheckState; run: CheckRun | null } {
  const [latest] = after;
  if (!latest) return { state: "noChecks", run: null };
  if (latest.failed) return { state: "failed", run: latest };
  const tests = after.find((run) => run.checks.includes("test") && !run.failed);
  return tests ? { state: "tested", run: tests } : { state: "passed", run: latest };
}

// The share of a file's agent edits that are still in it (a partly kept edit counts half); null when it has none
// to judge by.
export function keptShare(survival: Record<Survival, number>): number | null {
  const edits = survival.kept + survival.partly + survival.gone + survival.undone;
  return edits ? (survival.kept + survival.partly / 2) / edits : null;
}

// How a changed file connects to the selected one: the selected file imports it, it imports the selected file, or
// it is only in the same group.
export type Relation = "usedBy" | "uses" | "group";

// The changed files connected to the selected file at `path`, and how. Imports win over sharing a group.
export function relatedFiles(stats: MapStats, path: string): Map<string, Relation> {
  const { file, group } = stats.files[path];
  const related = new Map<string, Relation>();
  for (const other of Object.values(stats.files)) {
    if (group && other.group === group && other.file.path !== path) related.set(other.file.path, "group");
  }
  for (const used of file.links_out) related.set(used, "usedBy");
  for (const user of file.links_in) related.set(user, "uses");
  return related;
}

// Tile colors come from the --lens-* tokens in index.css (each theme has its own). The size scale mixes the lens's
// low and high color by how much the file changed (`share`, 0 to 1).
const sizeColor = (share: number) =>
  `color-mix(in srgb, var(--lens-size-high) ${Math.round(share * 100)}%, var(--lens-size-low))`;

interface LensInfo {
  label: string;
  key: KeyId;
  color: (file: FileStats, stats: MapStats) => string;
  // The files this lens asks you to look at, counted on its button; `of` says what they are ("2 not tested").
  needsLook: (file: FileStats) => boolean;
  of: string;
}

// In the order of the buttons: what changed, whether the agent verified it, your review, then the rules' warnings.
export const LENSES: Record<Lens, LensInfo> = {
  size: {
    label: "Change size",
    key: "lensSize",
    // On a log scale: one huge file shouldn't leave every other one pale.
    color: ({ file }, stats) => sizeColor(Math.log1p(file.add + file.rem) / Math.log1p(stats.maxLines)),
    needsLook: () => true,
    of: "changed",
  },
  checks: {
    label: "Tested",
    key: "lensChecks",
    color: ({ check }) => (check ? CHECK_COLOR[check] : "var(--lens-none)"),
    needsLook: ({ check }) => !!check && check !== "tested",
    of: "without passing tests after the agent's last edit",
  },
  review: {
    label: "Reviewed",
    key: "lensReview",
    color: ({ mark }) => (mark === "none" ? "var(--lens-none)" : `var(--lens-${mark})`),
    needsLook: ({ mark }) => mark === "none" || mark === "changed",
    of: "to review",
  },
  flags: {
    label: "Flags",
    key: "lensFlags",
    color: ({ flags }) => (flags.length ? "var(--lens-flag)" : "var(--lens-none)"),
    needsLook: ({ flags }) => flags.length > 0,
    of: "flagged",
  },
};
