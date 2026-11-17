// Marks on each changed file, "Looks good" (saved as approved) or "Needs work" (rejected), kept per repo, branch
// and base. A mark stores a fingerprint of the file's change; when the agent changes the file again the
// fingerprint no longer matches, so the file is back to not checked.
// Saved in the app's data folder (see store.ts).
import { useCallback, useState } from "react";
import { getJson, setJson } from "./store";
import type { FileInfo, Snapshot } from "./types";

export type ReviewState = "approved" | "rejected";
// path -> the mark, and the fingerprint of the change it was made on
type Marks = Record<string, { state: ReviewState; sig: string }>;

const storageKey = (snap: Snapshot) => `review:${snap.path}:${snap.branch}:${snap.base}`;
const readMarks = (key: string) => getJson<Marks>(key, {});

// A short hash of a file's status and diff: different whenever the file's change is.
function fingerprint(file: FileInfo, diff: string) {
  const text = file.status + diff;
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return hash.toString(36);
}

export function useReview(snap: Snapshot) {
  const key = storageKey(snap);
  const [saved, setSaved] = useState<{ key: string; marks: Marks }>(() => ({ key, marks: readMarks(key) }));
  // Another repo or branch has its own marks.
  const marks = saved.key === key ? saved.marks : readMarks(key);

  // The mark for a given version of the file's change (by default its latest).
  const stateOf = useCallback(
    (file: FileInfo, diff?: string): ReviewState | null => {
      const mark = marks[file.path];
      return mark && mark.sig === fingerprint(file, diff ?? snap.diffs[file.path] ?? "") ? mark.state : null;
    },
    [marks, snap],
  );

  // Setting the active state again clears it. `shown` is the diff you were looking at, when it is older than the
  // file's latest: the mark then holds for what you saw, and the newer change still shows as not checked.
  const toggle = useCallback(
    (file: FileInfo, state: ReviewState | null, shown?: string) => {
      const next = { ...marks };
      if (!state || stateOf(file, shown) === state) delete next[file.path];
      else next[file.path] = { state, sig: fingerprint(file, shown ?? snap.diffs[file.path] ?? "") };
      setJson(key, next);
      setSaved({ key, marks: next });
    },
    [marks, key, snap, stateOf],
  );

  return { stateOf, toggle };
}
