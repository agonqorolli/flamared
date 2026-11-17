import { plural, type TipKey } from "@/lib/format";
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

const sum = (fs: FileInfo[], k: "add" | "rem") => fs.reduce((a, f) => a + f[k], 0);

// The Changes list: logic groups, shared, wiring, loose files by folder, lone tests, then non-code files.
export function buildSections(snap: Snapshot): { sections: Section[]; rows: Row[] } {
  const S = snap.story;
  const rows: Row[] = [];
  // The agent's latest message about any file in the block, whatever the section.
  const latestWords = (fs: FileInfo[]) => fs.filter((f) => f.words).sort((x, y) => ms(y.words_at) - ms(x.words_at))[0];
  const block = (
    key: string,
    name: string,
    sub: string,
    files: FileInfo[],
    tests: FileInfo[],
    extra: Partial<Block> = {},
  ): Block => ({
    key,
    name,
    sub,
    add: sum([...files, ...tests], "add"),
    rem: sum([...files, ...tests], "rem"),
    words: latestWords([...files, ...tests])?.words ?? null,
    words_agent: latestWords([...files, ...tests])?.words_agent ?? null,
    lonely: false,
    ...extra,
    rows: [...files, ...tests].map((f) => {
      const row = { file: f, group: name, index: rows.length };
      rows.push(row);
      return row;
    }),
  });
  // Several one-file groups shown as one block (shared files, loose files in a folder).
  const merge = (key: string, name: string, sub: string, list: GroupItem[], extra: Partial<Block> = {}) =>
    block(
      key,
      name,
      sub,
      list.flatMap((g) => g.files),
      list.flatMap((g) => g.tests),
      extra,
    );

  const sections: Section[] = [];
  if (S.logic.length)
    sections.push({
      label: "Logic groups",
      tip: "logic",
      blocks: S.logic.map((g, i) =>
        block(
          `logic-${i}`,
          g.name,
          plural(g.files.length, "file") + (g.tests.length ? ` + ${plural(g.tests.length, "test")}` : ""),
          g.files,
          g.tests,
        ),
      ),
    });
  if (S.shared.length)
    sections.push({
      label: "Shared building blocks",
      tip: "shared",
      blocks: [merge("shared", "shared", `${S.shared.length} files used by 3+ changed files`, S.shared)],
    });
  if (S.wiring.length)
    sections.push({
      label: "Wiring",
      tip: "wiring",
      blocks: [merge("wiring", "wiring", `${S.wiring.length} files using 4+ changed files`, S.wiring)],
    });
  if (S.loose.length)
    sections.push({
      label: "Other changes, by folder",
      tip: "loose",
      blocks: S.loose.map((L, i) => {
        const b = merge(`loose-${i}`, L.folder.split("/").slice(-2).join("/"), plural(L.files.length, "file"), L.files);
        return { ...b, lonely: L.files.every((g) => !g.uses.length) };
      }),
    });
  // Tests whose source file didn't change and that use nothing changed would otherwise be lost.
  if (S.loose_tests.length)
    sections.push({
      label: "Tests on their own",
      tip: "tests",
      blocks: [
        block(
          "tests",
          "tests",
          `${plural(S.loose_tests.length, "test file")} whose source didn't change`,
          [],
          S.loose_tests,
        ),
      ],
    });
  if (S.support.length)
    sections.push({
      label: "Supporting changes",
      tip: "support",
      blocks: S.support.map((s) => block(`support-${s.kind}`, s.kind, plural(s.files.length, "file"), s.files, [])),
    });
  return { sections, rows };
}

// A unified patch the diff component can read; our diffs are hunks only, without file headers.
// Long diffs are cut at 400 lines, so each hunk header's line counts are worked out again from what is left.
export function toPatch(f: FileInfo, diff: string): { patch: string; more: string | null } {
  const lines = diff.split("\n");
  const more = lines.length && lines[lines.length - 1].startsWith("… ") ? lines.pop()! : null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(lines[i]);
    if (!m) continue;
    let old = 0,
      neu = 0;
    for (let j = i + 1; j < lines.length && !lines[j].startsWith("@@"); j++) {
      if (lines[j].startsWith("\\")) continue; // "\ No newline at end of file"
      if (!lines[j].startsWith("+")) old++;
      if (!lines[j].startsWith("-")) neu++;
    }
    lines[i] = `@@ -${m[1]},${old} +${m[2]},${neu} @@${m[3]}`;
  }
  const a = f.status === "A" ? "/dev/null" : `a/${f.path}`;
  const b = f.status === "D" ? "/dev/null" : `b/${f.path}`;
  return { patch: `diff --git a/${f.path} b/${f.path}\n--- ${a}\n+++ ${b}\n${lines.join("\n")}\n`, more };
}
