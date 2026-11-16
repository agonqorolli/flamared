// Review: approve or reject each changed file, kept per repo, branch and base.
// A mark stores a fingerprint of the file's change; when the agent changes the file again the fingerprint
// no longer matches, so the file is back to not reviewed.
// For now in the webview's storage; it moves to the app's data folder with the license work.
import { useCallback, useState } from "react";
import type { FileInfo, Snapshot } from "./types";

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
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
};

export function useReview(snap: Snapshot) {
  const key = keyOf(snap);
  const [marks, setMarks] = useState<{ key: string; marks: Marks }>(() => ({ key, marks: read(key) }));
  const current = marks.key === key ? marks.marks : read(key);

  const stateOf = useCallback(
    (f: FileInfo): ReviewState | null => {
      const m = current[f.path];
      return m && m.sig === fingerprint(f, snap.diffs[f.path] || "") ? m.state : null;
    },
    [current, snap],
  );

  // Setting the active state again clears it.
  const toggle = useCallback(
    (f: FileInfo, state: ReviewState | null) => {
      const next = { ...current };
      if (!state || stateOf(f) === state) delete next[f.path];
      else next[f.path] = { state, sig: fingerprint(f, snap.diffs[f.path] || "") };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* kept for this session only */
      }
      setMarks({ key, marks: next });
    },
    [current, key, snap, stateOf],
  );

  return { stateOf, toggle };
}
