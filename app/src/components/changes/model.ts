// The Changes screen's list, built from a snapshot: sections of blocks (groups) of file rows, and a file's diff as
// a patch the diff component can read.
import { plural, type TipKey } from "@/lib/format";
import { fileHeader, hunkHeader } from "@/lib/patch";
import { ms } from "@/lib/timeline";
import type { FileInfo, GroupItem, Snapshot } from "@/lib/types";

export interface Row {
  file: FileInfo;
  group: string;
  index: number; // position in the flat list (j/k and "File N of M")
}
export interface Block {
  key: string;
  name: string;
  sub: string;
  add: number;
  rem: number;
  words: string | null;
  words_agent: string | null;
  rows: Row[];
  lonely: boolean; // a loose file that uses nothing changed
}
export interface Section {
  label: string;
  tip: TipKey;
  blocks: Block[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

const sum = (files: FileInfo[], count: "add" | "rem") => files.reduce((total, file) => total + file[count], 0);

// The file with the agent's latest message, whatever the section.
const latestWords = (files: FileInfo[]) =>
  files.filter((file) => file.words).sort((a, b) => ms(b.words_at) - ms(a.words_at))[0];

// The Changes list: logic groups, shared, wiring, loose files by folder, lone tests, then non-code files.
export function buildSections(snap: Snapshot): { sections: Section[]; rows: Row[] } {
  const { logic, shared, wiring, loose, loose_tests: looseTests, support } = snap.story;
  const rows: Row[] = [];

  // One block of the list; its files take the next positions in the flat list.
  const block = (
    key: string,
    name: string,
    sub: string,
    files: FileInfo[],
    tests: FileInfo[],
    lonely = false,
  ): Block => {
    const all = [...files, ...tests];
    const latest = latestWords(all);
    return {
      key,
      name,
      sub,
      add: sum(all, "add"),
      rem: sum(all, "rem"),
      words: latest?.words ?? null,
      words_agent: latest?.words_agent ?? null,
      lonely,
      rows: all.map((file) => {
        const row = { file, group: name, index: rows.length };
        rows.push(row);
        return row;
      }),
    };
  };
  // Several one-file groups shown as one block (shared files, loose files in a folder).
  const merged = (key: string, name: string, sub: string, groups: GroupItem[], lonely = false) => {
    const files = groups.flatMap((group) => group.files);
    const tests = groups.flatMap((group) => group.tests);
    return block(key, name, sub, files, tests, lonely);
  };

  const sections: Section[] = [];
  if (logic.length) {
    const blocks = logic.map((group, i) => {
      const tests = group.tests.length ? ` + ${plural(group.tests.length, "test")}` : "";
      return block(`logic-${i}`, group.name, plural(group.files.length, "file") + tests, group.files, group.tests);
    });
    sections.push({ label: "Logic groups", tip: "logic", blocks });
  }
  if (shared.length) {
    const sub = `${shared.length} files used by 3+ changed files`;
    sections.push({
      label: "Shared building blocks",
      tip: "shared",
      blocks: [merged("shared", "shared", sub, shared)],
    });
  }
  if (wiring.length) {
    const sub = `${wiring.length} files using 4+ changed files`;
    sections.push({ label: "Wiring", tip: "wiring", blocks: [merged("wiring", "wiring", sub, wiring)] });
  }
  if (loose.length) {
    const blocks = loose.map(({ folder, files: groups }, i) => {
      const name = folder.split("/").slice(-2).join("/");
      const usesNothing = groups.every((group) => !group.uses.length);
      return merged(`loose-${i}`, name, plural(groups.length, "file"), groups, usesNothing);
    });
    sections.push({ label: "Files on their own", tip: "loose", blocks });
  }
  // Tests whose source file didn't change and that use nothing changed would otherwise be lost.
  if (looseTests.length) {
    const sub = `${plural(looseTests.length, "test file")} whose source didn't change`;
    sections.push({
      label: "Tests on their own",
      tip: "tests",
      blocks: [block("tests", "tests", sub, [], looseTests)],
    });
  }
  if (support.length) {
    const blocks = support.map(({ kind, files }) =>
      block(`support-${kind}`, kind, plural(files.length, "file"), files, []),
    );
    sections.push({ label: "Supporting changes", tip: "support", blocks });
  }
  return { sections, rows };
}

// A unified patch the diff component can read; our diffs are hunks only, without file headers.
// Long diffs are cut at 400 lines, so each hunk header's line counts are worked out again from what is left.
export function toPatch(file: FileInfo, diff: string): { patch: string; more: string | null } {
  const lines = diff.split("\n");
  // A diff that was cut ends with a line saying how many more lines there are.
  const wasCut = lines[lines.length - 1].startsWith("… ");
  const more = wasCut ? (lines.pop() ?? null) : null;
  for (let i = 0; i < lines.length; i++) {
    const header = HUNK_HEADER.exec(lines[i]);
    if (!header) continue;
    const [, oldStart, newStart, context] = header;
    let end = i + 1;
    while (end < lines.length && !lines[end].startsWith("@@")) end++;
    lines[i] = hunkHeader(oldStart, newStart, lines.slice(i + 1, end), context);
  }
  const header = fileHeader(file.path, { added: file.status === "A", deleted: file.status === "D" });
  return { patch: `${header}${lines.join("\n")}\n`, more };
}
