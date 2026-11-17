// The Timeline screen's list, built from a snapshot: agent turns and commits in order, and every edit in them.
import { day } from "./format";
import { fileHeader, hunkHeader } from "./patch";
import type { Snapshot, TimelineCommit, TimelineEdit, TimelineEvent, TimelineSession, TimelineTurn } from "./types";

export type TimelineRow = { kind: "say"; text: string } | { kind: "edit"; edit: TimelineEdit; index: number };

export type TimelineItem =
  | { kind: "day"; label: string }
  | { kind: "commit"; sha: string; subject: string; at: string }
  | {
      kind: "turn";
      key: string;
      at: string | null; // when you sent the prompt
      latest: string | null; // the turn's last edit (or the prompt, without edits)
      agent: string;
      title: string;
      prompt: string;
      edits: number;
      rows: TimelineRow[];
    };

export interface Timeline {
  items: TimelineItem[];
  edits: TimelineEdit[]; // every edit, latest first: the order of the list, J/K and "Edit N of M"
  paths: Set<string>; // files with at least one agent edit
}

// A turn or a commit, with the time that places it in the list.
type Entry =
  | { at: number; kind: "turn"; session: TimelineSession; turn: TimelineTurn; index: number }
  | { at: number; kind: "commit"; commit: TimelineCommit };

// Milliseconds since 1970: times come in different forms (agents write UTC, git writes your local offset), so they
// are compared as times, never as text.
export const ms = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);

// Agent turns and commits, latest first, with a day label whenever the day changes. A turn sits where its latest
// activity is, so the turn an agent is working in now stays on top. Inside a turn the latest event comes first too.
export function buildTimeline(snap: Snapshot): Timeline {
  const entries: Entry[] = [];
  for (const session of snap.timeline.sessions) {
    session.turns.forEach((turn, index) => {
      const latest = Math.max(ms(turn.at), ...turn.events.map((event) => (event.k === "edit" ? ms(event.at) : 0)));
      entries.push({ at: latest, kind: "turn", session, turn, index });
    });
  }
  for (const commit of snap.timeline.commits) entries.push({ at: ms(commit.at), kind: "commit", commit });
  entries.sort((a, b) => b.at - a.at);

  const items: TimelineItem[] = [];
  const edits: TimelineEdit[] = [];
  let lastDay = "";
  for (const entry of entries) {
    const at = entry.at ? new Date(entry.at).toISOString() : null;
    const entryDay = day(at);
    if (entryDay !== lastDay) {
      items.push({ kind: "day", label: entryDay || "Unknown day" });
      lastDay = entryDay;
    }
    if (entry.kind === "commit") {
      const { sha, subject, at } = entry.commit;
      items.push({ kind: "commit", sha, subject, at });
      continue;
    }
    const { session, turn } = entry;
    // Edits and the agent's messages; the commands it ran (tests, lookups) are left out of the list.
    const rows = [...turn.events].reverse().flatMap((event: TimelineEvent): TimelineRow[] => {
      if (event.k === "say") return [{ kind: "say", text: event.t }];
      if (event.k === "run") return [];
      return [{ kind: "edit", edit: event, index: edits.push(event) - 1 }];
    });
    items.push({
      kind: "turn",
      key: `${session.id}-${entry.index}`,
      at: turn.at,
      latest: at,
      agent: session.agent,
      title: session.title,
      prompt: turn.prompt,
      edits: turn.events.filter((event) => event.k === "edit").length,
      rows,
    });
  }
  return { items, edits, paths: new Set(edits.map((edit) => edit.path)) };
}

// One recorded edit as a patch the diff component can read (its hunks only, with counts worked out).
export function editPatch(edit: TimelineEdit): string | null {
  if (!edit.hunks.length) return null;
  const hunks = edit.hunks.map(
    (hunk) => `${hunkHeader(hunk.o ?? 1, hunk.n ?? 1, hunk.lines)}\n${hunk.lines.join("\n")}`,
  );
  return `${fileHeader(edit.path, { added: edit.new, deleted: edit.del, from: edit.from })}${hunks.join("\n")}\n`;
}

// The status letter of one edit: deleted, moved, created or changed the file.
export function editStatus(edit: TimelineEdit): "D" | "R" | "A" | "M" {
  if (edit.del) return "D";
  if (edit.from) return "R";
  return edit.new ? "A" : "M";
}

export function editStatusTip(edit: TimelineEdit) {
  if (edit.inferred) return "Write found in the agent's command; no diff recorded";
  const tips = { A: "Created the file", D: "Deleted the file", R: `Moved from ${edit.from}`, M: "Changed the file" };
  return tips[editStatus(edit)];
}

// A stable name for one edit across reloads (the list position changes as new edits arrive).
export const editKey = (edit: TimelineEdit) => `${edit.step}|${edit.at}|${edit.path}`;
