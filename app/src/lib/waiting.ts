// What a reload would change on screen, in words: shown next to "Paused" so you can tell what is waiting.
import { plural } from "./format";
import { buildTimeline, editKey } from "./timeline";
import type { Snapshot } from "./types";

export interface Waiting {
  label: string; // the one thing that matters most, for the header
  details: string[]; // everything, for the tooltip
}

// How `next` differs from `prev`, counted.
interface Difference {
  switched: string | null; // the branch switched to
  commits: number; // new commits in the list
  moved: boolean; // HEAD moved without a new commit in the list
  added: number; // files that weren't changed before
  changed: number; // files changed again
  gone: number; // files no longer changed: committed, reverted or deleted untracked
  edits: number; // new agent edits
  talk: boolean; // new agent messages without edits
}

function difference(prev: Snapshot, next: Snapshot): Difference {
  const before = new Set(Object.keys(prev.diffs));
  const after = Object.keys(next.diffs);
  const knownCommits = new Set(prev.timeline.commits.map((commit) => commit.sha));
  const commits = next.timeline.commits.filter((commit) => !knownCommits.has(commit.sha)).length;
  const switched = prev.branch !== next.branch ? next.branch : null;
  const knownEdits = new Set(buildTimeline(prev).edits.map(editKey));
  const edits = buildTimeline(next).edits.filter((edit) => !knownEdits.has(editKey(edit))).length;
  // Messages are counted over all sessions; commands aren't shown, so they don't count.
  const messages = (snap: Snapshot) =>
    snap.timeline.sessions
      .flatMap((session) => session.turns)
      .reduce((count, turn) => count + turn.events.filter((event) => event.k === "say").length, 0);
  return {
    switched,
    commits,
    // With the usual base (HEAD itself) this is how a commit shows up; it can also be an amend, pull or reset, which
    // the snapshot can't tell apart.
    moved: !switched && !commits && prev.head !== next.head,
    added: after.filter((path) => !before.has(path)).length,
    changed: after.filter((path) => before.has(path) && prev.diffs[path] !== next.diffs[path]).length,
    gone: [...before].filter((path) => !(path in next.diffs)).length,
    edits,
    talk: !edits && messages(next) > messages(prev),
  };
}

// The one thing that matters most, most important first.
function headline({ switched, commits, moved, added, changed, gone, edits }: Difference): string {
  const files = added + changed;
  if (switched) return `switched to ${switched}`;
  if ((commits || moved) && gone) return `${plural(gone, "file")} committed`;
  if (commits) return plural(commits, "new commit");
  if (moved) return "new commit";
  if (files) return `${plural(files, "file")} changed`;
  if (gone) return `${plural(gone, "file")} no longer changed`;
  if (edits) return plural(edits, "new agent edit");
  return "new agent activity";
}

export function whatChanged(prev: Snapshot, next: Snapshot): Waiting | null {
  const diff = difference(prev, next);
  const { switched, commits, moved, added, changed, gone, edits, talk } = diff;
  const details: string[] = [];
  if (switched) details.push(`Switched to ${switched}`);
  if (commits) details.push(plural(commits, "new commit"));
  if (moved) details.push(`HEAD moved to ${next.head}: a new commit, or an amend, pull or reset`);
  if (added) details.push(plural(added, "new changed file"));
  if (changed) details.push(`${plural(changed, "file")} changed again`);
  if (gone) details.push(`${plural(gone, "file")} no longer changed${commits || moved ? " (committed)" : ""}`);
  if (edits) details.push(plural(edits, "new agent edit"));
  if (talk) details.push("New agent messages");
  if (!details.length) return null;
  return { label: headline(diff), details };
}
