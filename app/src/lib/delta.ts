// What is new in a file's change since you marked it: the added and removed lines of the change now, matched in
// order against the ones you saw (their sign and text, not their position, since earlier edits move lines). The
// lines left over are new; the lines you saw that are no longer in the change are gone.

// A line of a change: "+" or "-" and its text, and its number in the new file (added) or the old one (removed).
interface ChangeLine {
  text: string;
  line: number;
}

export interface Delta {
  added: number[]; // new-file numbers of added lines you haven't seen
  removed: number[]; // old-file numbers of removed lines you haven't seen
  gone: number; // lines of the change you saw that are no longer in it
}

const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
// Past this many cells, matching in order costs too much; lines are then matched by text alone.
const MAX_MATCH_CELLS = 4_000_000;

// The added and removed lines of a diff (hunks only, as the snapshot keeps them), with their line numbers.
function changeLines(diff: string): ChangeLine[] {
  const lines: ChangeLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const text of diff.split("\n")) {
    const start = HUNK_START.exec(text);
    if (start) {
      oldLine = Number(start[1]);
      newLine = Number(start[2]);
    } else if (text.startsWith("+")) {
      lines.push({ text, line: newLine++ });
    } else if (text.startsWith("-")) {
      lines.push({ text, line: oldLine++ });
    } else if (text.startsWith(" ")) {
      oldLine++;
      newLine++;
    }
  }
  return lines;
}

// The change lines of a diff as saved with a mark: only their sign and text.
export const seenLines = (diff: string) => changeLines(diff).map((line) => line.text);

// Which of `now` match a line of `seen`: the longest run of lines the two share in order.
function matchInOrder(seen: string[], now: string[]): boolean[] {
  const cols = now.length + 1;
  const common = new Uint16Array((seen.length + 1) * cols);
  for (let i = seen.length - 1; i >= 0; i--) {
    for (let j = now.length - 1; j >= 0; j--) {
      const here = i * cols + j;
      common[here] = seen[i] === now[j] ? common[here + cols + 1] + 1 : Math.max(common[here + cols], common[here + 1]);
    }
  }
  const matched = now.map(() => false);
  let i = 0;
  let j = 0;
  while (i < seen.length && j < now.length) {
    if (seen[i] === now[j]) {
      matched[j] = true;
      i++;
      j++;
    } else if (common[(i + 1) * cols + j] >= common[i * cols + j + 1]) i++;
    else j++;
  }
  return matched;
}

// Which of `now` match a line of `seen` by text alone, each seen line used once (for very long changes).
function matchByText(seen: string[], now: string[]): boolean[] {
  const left = new Map<string, number>();
  for (const text of seen) left.set(text, (left.get(text) ?? 0) + 1);
  return now.map((text) => {
    const count = left.get(text) ?? 0;
    if (count) left.set(text, count - 1);
    return count > 0;
  });
}

// What in `diff` is new compared with the change lines you saw.
export function deltaSince(seen: string[], diff: string): Delta {
  const now = changeLines(diff);
  const texts = now.map((line) => line.text);
  const tooBig = (seen.length + 1) * (texts.length + 1) > MAX_MATCH_CELLS;
  const matched = tooBig ? matchByText(seen, texts) : matchInOrder(seen, texts);
  const fresh = now.filter((_, i) => !matched[i]);
  return {
    added: fresh.filter((line) => line.text.startsWith("+")).map((line) => line.line),
    removed: fresh.filter((line) => line.text.startsWith("-")).map((line) => line.line),
    gone: seen.length - (now.length - fresh.length),
  };
}
