// What the Map screen works out from a snapshot: each changed file's numbers, and how each lens colors a file.
import type { Survival } from "@/lib/format";
import type { KeyId } from "@/lib/keys";
import type { Timeline } from "@/lib/timeline";
import type { FileInfo, Snapshot } from "@/lib/types";

export type Lens = "size" | "rework" | "final" | "flags";

// One changed file as the map sees it.
export interface FileStats {
  file: FileInfo;
  edits: number; // agent edits of it
  survival: Record<Survival, number>; // how many of those edits are kept, partly kept, gone, undone
  flags: string[];
  group?: string;
}

export interface MapStats {
  files: Record<string, FileStats>; // by path, in the order of the Changes list
  maxLines: number; // the most lines changed in one file, for the scale of the size lens
  maxEdits: number; // the most agent edits of one file, for the scale of the rework lens
}

export function buildStats(snap: Snapshot, timeline: Timeline): MapStats {
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
      flags: snap.map.flags[file.path] || [],
      group: snap.map.groups[file.path],
    };
  }
  for (const edit of timeline.edits) {
    const stats = files[edit.path];
    if (!stats) continue;
    stats.edits++;
    if (edit.survives) stats.survival[edit.survives]++;
  }
  const all = Object.values(files);
  return {
    files,
    maxLines: Math.max(1, ...all.map((stats) => stats.file.add + stats.file.rem)),
    maxEdits: Math.max(1, ...all.map((stats) => stats.edits)),
  };
}

// The share of a file's agent edits that are still in it (a partly kept edit counts half); null when it has none
// to judge by.
export function keptShare(survival: Record<Survival, number>): number | null {
  const edits = survival.kept + survival.partly + survival.gone + survival.undone;
  return edits ? (survival.kept + survival.partly / 2) / edits : null;
}

// Tile colors come from the --lens-* tokens in index.css (each theme has its own). The two scales mix a lens's low
// and high color by how much the file has of it (`share`, 0 to 1).
const onScale = (lens: "size" | "rework", share: number) =>
  `color-mix(in srgb, var(--lens-${lens}-high) ${Math.round(share * 100)}%, var(--lens-${lens}-low))`;

function finalColor(share: number | null) {
  if (share == null) return "var(--lens-none)";
  if (share >= 0.8) return "var(--lens-kept)";
  return share >= 0.4 ? "var(--lens-partly)" : "var(--lens-gone)";
}

interface LensInfo {
  label: string;
  key: KeyId;
  color: (file: FileStats, stats: MapStats) => string;
}

export const LENSES: Record<Lens, LensInfo> = {
  size: {
    label: "Change size",
    key: "lensSize",
    // On a log scale: one huge file shouldn't leave every other one pale.
    color: ({ file }, stats) => onScale("size", Math.log1p(file.add + file.rem) / Math.log1p(stats.maxLines)),
  },
  rework: {
    label: "Rework",
    key: "lensRework",
    color: ({ edits }, stats) => (edits ? onScale("rework", edits / stats.maxEdits) : "var(--lens-none)"),
  },
  final: {
    label: "Still in final",
    key: "lensFinal",
    color: ({ survival }) => finalColor(keptShare(survival)),
  },
  flags: {
    label: "Flags",
    key: "lensFlags",
    color: ({ flags }) => (flags.length ? "var(--lens-flag)" : "var(--lens-none)"),
  },
};
