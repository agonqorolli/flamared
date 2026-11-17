// What the Timeline screen works out from its list: the days, one file's history, and the edits of one step.
import { ms, type TimelineItem } from "@/lib/timeline";
import type { TimelineEdit } from "@/lib/types";

export type TurnOrCommit = Exclude<TimelineItem, { kind: "day" }>;

export interface Day {
  label: string | null; // null: what comes before the first day label
  items: TurnOrCommit[];
}

// The list split at each day label: the turns and commits under it.
export function byDay(items: TimelineItem[]): Day[] {
  const days: Day[] = [];
  for (const item of items) {
    if (item.kind === "day" || !days.length) days.push({ label: item.kind === "day" ? item.label : null, items: [] });
    if (item.kind !== "day") days[days.length - 1].items.push(item);
  }
  return days;
}

// An edit with its position in the list (what selecting it needs).
export interface PlacedEdit {
  edit: TimelineEdit;
  index: number;
}

const placed = (edits: TimelineEdit[]): PlacedEdit[] => edits.map((edit, index) => ({ edit, index }));

// One file's edits, latest first.
export function fileHistory(edits: TimelineEdit[], path: string): PlacedEdit[] {
  return placed(edits)
    .filter(({ edit }) => edit.path === path)
    .sort((a, b) => ms(b.edit.at) - ms(a.edit.at));
}

// The other files edited in the same step as the edit at `index` (between the same two agent messages), each once.
export function sameStep(edits: TimelineEdit[], index: number): PlacedEdit[] {
  const current = edits[index];
  const others = placed(edits).filter(
    (other) => other.index !== index && other.edit.step === current.step && other.edit.path !== current.path,
  );
  return others.filter(({ edit }, k) => others.findIndex((other) => other.edit.path === edit.path) === k);
}
