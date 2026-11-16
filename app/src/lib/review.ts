// Review: approve or reject each changed file, kept per repo, branch and base.
// A mark stores a fingerprint of the file's change; when the agent changes the file again the fingerprint
// no longer matches, so the file is back to not reviewed.
// Saved in the app's data folder (see store.ts).
import { useCallback, useState } from "react";
import type { FileInfo, Snapshot } from "./types";
import { getItem, setItem } from "./store";

export type ReviewState = "approved" | "rejected";
type Marks = Record<string, { state: ReviewState; sig: string }>;

const keyOf = (s: Snapshot) => `review:${s.path}:${s.branch}:${s.base}`;
const fingerprint = (f: FileInfo, diff: string) => {
  const t = f.status + diff;
  let h = 0;
  for (let k = 0; k < t.length; k++) h = (h * 31 + t.charCodeAt(k)) | 0;
  return h.toString(36);
};
const read = (key: string): Marks => {
  try {
    return JSON.parse(getItem(key) || "{}");
  } catch {
    return {};
  }
};

export function useReview(snap: Snapshot) {
  const key = keyOf(snap);
  const [marks, setMarks] = useState<{ key: string; marks: Marks }>(() => ({ key, marks: read(key) }));
  const current = marks.key === key ? marks.marks : read(key);

  // The mark for a given version of the file's change (by default its latest).
  const stateOf = useCallback(
    (f: FileInfo, diff?: string): ReviewState | null => {
      const m = current[f.path];
      return m && m.sig === fingerprint(f, diff ?? snap.diffs[f.path] ?? "") ? m.state : null;
    },
    [current, snap],
  );

  // Setting the active state again clears it. `shown` is the diff you were looking at, when it is older than the
  // file's latest: the mark then holds for what you saw, and the newer change still shows as not reviewed.
  const toggle = useCallback(
    (f: FileInfo, state: ReviewState | null, shown?: string) => {
      const next = { ...current };
      if (!state || stateOf(f, shown) === state) delete next[f.path];
      else next[f.path] = { state, sig: fingerprint(f, shown ?? snap.diffs[f.path] ?? "") };
      try {
        setItem(key, JSON.stringify(next));
      } catch {
        /* kept for this session only */
      }
      setMarks({ key, marks: next });
    },
    [current, key, snap, stateOf],
  );

  return { stateOf, toggle };
}
