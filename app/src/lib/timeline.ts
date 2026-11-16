import { day } from "./format";
import type { Snapshot, TimelineEdit, TimelineEvent } from "./types";

export type TimelineRow =
  | { kind: "say"; text: string }
  | { kind: "run"; cmd: string; test: boolean; failed: boolean; passed: number | null }
  | { kind: "edit"; edit: TimelineEdit; index: number };

export type TimelineItem =
  | { kind: "day"; label: string }
  | { kind: "commit"; sha: string; subject: string; at: string }
  | {
      kind: "turn";
      key: string;
      at: string | null;
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

// Agent turns and commits, latest first, with a day label whenever the day changes.
// Inside a turn the latest event comes first too; the prompt (the oldest) closes the turn.
export function buildTimeline(snap: Snapshot): Timeline {
  type Raw = { at: string | null; turn?: Snapshot["timeline"]["sessions"][number]["turns"][number]; session?: Snapshot["timeline"]["sessions"][number]; commit?: Snapshot["timeline"]["commits"][number] };
  const raw: Raw[] = [];
  for (const s of snap.timeline.sessions) for (const t of s.turns) raw.push({ at: t.at, turn: t, session: s });
  for (const c of snap.timeline.commits) raw.push({ at: c.at, commit: c });
  raw.sort((a, b) => (b.at || "").localeCompare(a.at || ""));

  const items: TimelineItem[] = [];
  const edits: TimelineEdit[] = [];
  let lastDay = "";
  raw.forEach((it, n) => {
    const d = day(it.at);
    if (d !== lastDay) items.push({ kind: "day", label: d || "Unknown day" }), (lastDay = d);
    if (it.commit) return void items.push({ kind: "commit", sha: it.commit.sha, subject: it.commit.subject, at: it.commit.at });
    const t = it.turn!;
    const rows = [...t.events].reverse().map((e: TimelineEvent): TimelineRow => {
      if (e.k === "say") return { kind: "say", text: e.t };
      if (e.k === "run") return { kind: "run", cmd: e.cmd.split("\n")[0], test: e.test, failed: e.failed, passed: e.passed };
      return { kind: "edit", edit: e, index: edits.push(e) - 1 };
    });
    items.push({
      kind: "turn",
      key: `${it.session!.id}-${n}`,
      at: t.at,
      agent: it.session!.agent,
      title: it.session!.title,
      prompt: t.prompt,
      edits: t.events.filter((e) => e.k === "edit").length,
      rows,
    });
  });
  return { items, edits, paths: new Set(edits.map((e) => e.path)) };
}

// One recorded edit as a patch the diff component can read (its hunks only, with counts worked out).
export function editPatch(e: TimelineEdit): string | null {
  if (!e.hunks.length) return null;
  const a = e.new ? "/dev/null" : `a/${e.from ?? e.path}`;
  const b = e.del ? "/dev/null" : `b/${e.path}`;
  const hunks = e.hunks.map((h) => {
    const real = h.lines.filter((l) => !l.startsWith("\\")); // "\ No newline at end of file"
    const old = real.filter((l) => !l.startsWith("+")).length;
    const neu = real.filter((l) => !l.startsWith("-")).length;
    return `@@ -${h.o ?? 1},${old} +${h.n ?? 1},${neu} @@\n${h.lines.join("\n")}`;
  });
  return `diff --git a/${e.path} b/${e.path}\n--- ${a}\n+++ ${b}\n${hunks.join("\n")}\n`;
}

// The status letter of one edit: deleted, moved, created or changed the file.
export const editStatus = (e: TimelineEdit) => (e.del ? "D" : e.from ? "R" : e.new ? "A" : "M") as "D" | "R" | "A" | "M";
export const editStatusTip = (e: TimelineEdit) =>
  ({ A: "Created the file", D: "Deleted the file", R: `Moved from ${e.from}`, M: "Changed the file" })[editStatus(e)];
