// Patches in the form the diff component reads. Ours are kept as hunks only, so the lines naming the file are added
// here, and each hunk header's line counts are worked out from the lines under it.

// How many of a hunk's lines belong to the old file and to the new one.
function lineCounts(lines: string[]) {
  const real = lines.filter((line) => !line.startsWith("\\")); // not "\ No newline at end of file"
  return {
    old: real.filter((line) => !line.startsWith("+")).length,
    new: real.filter((line) => !line.startsWith("-")).length,
  };
}

// "@@ -12,3 +12,5 @@" for the hunk whose lines are given; `context` is what git writes after the second "@@".
export function hunkHeader(oldStart: number | string, newStart: number | string, lines: string[], context = "") {
  const counts = lineCounts(lines);
  return `@@ -${oldStart},${counts.old} +${newStart},${counts.new} @@${context}`;
}

interface FileChange {
  added?: boolean; // no old file
  deleted?: boolean; // no new file
  from?: string | null; // the path it was moved from
}

// The lines that say which file a patch is about.
export function fileHeader(path: string, { added, deleted, from }: FileChange) {
  const oldFile = added ? "/dev/null" : `a/${from ?? path}`;
  const newFile = deleted ? "/dev/null" : `b/${path}`;
  return `diff --git a/${path} b/${path}\n--- ${oldFile}\n+++ ${newFile}\n`;
}
