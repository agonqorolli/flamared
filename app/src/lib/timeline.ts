import { day } from "./format";
import type { Snapshot, TimelineEdit, TimelineEvent } from "./types";

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

// Milliseconds since 1970: times come in different forms (agents write UTC, git writes your local offset), so they
// are compared as times, never as text.
export const ms = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);

// Agent turns and commits, latest first, with a day label whenever the day changes. A turn sits where its latest
// activity is, so the turn an agent is working in now stays on top. Inside a turn the latest event comes first too.
export function buildTimeline(snap: Snapshot): Timeline {
  type Session = Snapshot["timeline"]["sessions"][number];
  type Raw = {
    at: number;
    turn?: Session["turns"][number];
    ti?: number;
    session?: Session;
    commit?: Snapshot["timeline"]["commits"][number];
  };
  const raw: Raw[] = [];
  for (const s of snap.timeline.sessions)
    s.turns.forEach((t, ti) => {
      const latest = Math.max(ms(t.at), ...t.events.map((e) => (e.k === "edit" ? ms(e.at) : 0)));
      raw.push({ at: latest, turn: t, ti, session: s });
    });
  for (const c of snap.timeline.commits) raw.push({ at: ms(c.at), commit: c });
  raw.sort((a, b) => b.at - a.at);

  const items: TimelineItem[] = [];
  const edits: TimelineEdit[] = [];
  let lastDay = "";
  for (const it of raw) {
    const d = it.at ? day(new Date(it.at).toISOString()) : "";
    if (d !== lastDay) {
      items.push({ kind: "day", label: d || "Unknown day" });
      lastDay = d;
    }
    if (it.commit) {
      items.push({ kind: "commit", sha: it.commit.sha, subject: it.commit.subject, at: it.commit.at });
      continue;
    }
    const t = it.turn!;
    // Edits and the agent's messages; the commands it ran (tests, lookups) are left out of the list.
    const rows = [...t.events].reverse().flatMap((e: TimelineEvent): TimelineRow[] => {
      if (e.k === "say") return [{ kind: "say", text: e.t }];
      if (e.k === "run") return [];
      return [{ kind: "edit", edit: e, index: edits.push(e) - 1 }];
    });
    items.push({
      kind: "turn",
      key: `${it.session!.id}-${it.ti}`,
      at: t.at,
      latest: it.at ? new Date(it.at).toISOString() : null,
      agent: it.session!.agent,
      title: it.session!.title,
      prompt: t.prompt,
      edits: t.events.filter((e) => e.k === "edit").length,
      rows,
    });
  }
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
export const editStatus = (e: TimelineEdit) =>
  (e.del ? "D" : e.from ? "R" : e.new ? "A" : "M") as "D" | "R" | "A" | "M";
export const editStatusTip = (e: TimelineEdit) =>
  e.inferred
    ? "Write found in the agent's command; no diff recorded"
    : { A: "Created the file", D: "Deleted the file", R: `Moved from ${e.from}`, M: "Changed the file" }[editStatus(e)];

// A stable name for one edit across reloads (the list position changes as new edits arrive).
export const editKey = (e: TimelineEdit) => `${e.step}|${e.at}|${e.path}`;
