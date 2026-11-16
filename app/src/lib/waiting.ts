// What a reload would change on screen, in words: shown next to "Paused" so you can tell what is waiting.
import { plural } from "./format";
import { buildTimeline, editKey } from "./timeline";
import type { Snapshot } from "./types";

export interface Waiting {
  label: string; // the one thing that matters most, for the header
  details: string[]; // everything, for the tooltip
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function whatChanged(prev: Snapshot, next: Snapshot): Waiting | null {
  const before = new Set(Object.keys(prev.diffs));
  const after = Object.keys(next.diffs);
  const added = after.filter((p) => !before.has(p)).length;
  const changed = after.filter((p) => before.has(p) && prev.diffs[p] !== next.diffs[p]).length;
  const gone = [...before].filter((p) => !(p in next.diffs)).length; // committed, reverted or deleted untracked
  const known = new Set(prev.timeline.commits.map((c) => c.sha));
  const commits = next.timeline.commits.filter((c) => !known.has(c.sha)).length;
  const switched = prev.branch !== next.branch ? next.branch : null;
  const oldEdits = new Set(buildTimeline(prev).edits.map(editKey));
  const edits = buildTimeline(next).edits.filter((e) => !oldEdits.has(editKey(e))).length;
  const events = (s: Snapshot) => s.timeline.sessions.reduce((a, x) => a + x.turns.reduce((b, t) => b + t.events.length, 0), 0);
  const talk = !edits && events(next) > events(prev); // messages or commands without edits
  // HEAD moved without a new commit in the list: with the usual base (HEAD itself) that is how a commit shows up;
  // it can also be an amend, pull or reset, which the snapshot can't tell apart.
  const moved = !switched && !commits && prev.head !== next.head;

  const details: string[] = [];
  if (switched) details.push(`Switched to ${switched}`);
  if (commits) details.push(`${n(commits, "new commit")}`);
  if (moved) details.push(`HEAD moved to ${next.head}: a new commit, or an amend, pull or reset`);
  if (added) details.push(`${n(added, "new changed file")}`);
  if (changed) details.push(`${n(changed, "file")} changed again`);
  if (gone) details.push(`${n(gone, "file")} no longer changed${commits || moved ? " (committed)" : ""}`);
  if (edits) details.push(`${plural(edits, "new agent edit")}`);
  if (talk) details.push("New agent messages or commands");
  if (!details.length) return null;

  const files = added + changed;
  const label = switched
    ? `switched to ${switched}`
    : (commits || moved) && gone
      ? `${n(gone, "file")} committed`
      : commits
        ? n(commits, "new commit")
        : moved
          ? "new commit"
          : files
            ? `${n(files, "file")} changed`
            : gone
              ? `${n(gone, "file")} no longer changed`
              : edits
                ? plural(edits, "new agent edit")
                : "new agent activity";
  return { label, details };
}
