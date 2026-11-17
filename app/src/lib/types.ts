// The shapes the Rust side sends: the snapshot and the picker rows (src-tauri/src/data/snapshot/model.rs), and the
// license (src-tauri/src/license.rs). Change the two sides together.

export type Status = "A" | "M" | "D" | "R" | "T" | "U" | "C";

export interface FileInfo {
  path: string;
  status: Status;
  add: number;
  rem: number;
  words: string | null;
  words_agent: string | null;
  words_at: string | null; // when the agent wrote `words`
  links_out: string[];
  links_in: string[];
  binary: boolean;
}

export interface GroupItem {
  name: string;
  files: FileInfo[];
  tests: FileInfo[];
  symbols: [string, string, string][];
  more: number;
  add: number;
  rem: number;
  uses: string[];
  used_by: number;
  imports: number;
  words: string | null;
  words_agent: string | null;
}

export interface RepoRow {
  name: string;
  path: string;
  full: string;
  sessions: number;
  last: string | null;
  current: boolean;
}

export interface BranchRow {
  name: string;
  at: string;
  remote: boolean;
  current: boolean;
  worktree: boolean; // checked out in another worktree folder
  sessions: number;
  agents: string[]; // agents that edited on this branch ("Claude Code", "Codex")
  agent_at: string | null; // their latest edit here
  subject: string; // the last commit's subject
}

// For the repo picker, read when it opens (src-tauri `repo_status`).
export interface RepoStatus {
  full: string;
  branch: string; // checked out
  changed: string[]; // uncommitted files
}

export interface BranchFiles {
  n: number;
  against: string | null; // null: uncommitted changes in a working folder
}

export interface TimelineEdit {
  k: "edit";
  path: string;
  add: number;
  rem: number;
  at: string | null;
  via: string | null;
  agent: string;
  step: string;
  survives: "kept" | "partly" | "gone" | "undone" | null;
  tool: string;
  inferred?: boolean; // a literal shell write target; no historical diff was recorded
  new: boolean;
  del: boolean;
  from: string | null;
  say: string | null;
  hunks: { o: number | null; n: number | null; lines: string[] }[];
}
export type TimelineEvent =
  | { k: "say"; t: string }
  | { k: "run"; cmd: string; desc: string | null; test: boolean; passed: number | null; failed: boolean }
  | TimelineEdit;

export interface SessionLink {
  branch: string;
  base: string;
  worktrees: number;
  sessions_in_repo: number;
  turns_kept: number;
  skipped: Record<string, number>;
  agents: Record<string, number>;
}

export interface Snapshot {
  repo: string;
  path: string;
  branch: string;
  base: string;
  base_label: string;
  head: string;
  generated: string;
  repos: RepoRow[];
  branches: BranchRow[];
  viewing: { branch: string; checked_out: boolean }; // checked_out false: another branch's commits, read-only
  stats: { files: number; add: number; rem: number };
  story: {
    logic: GroupItem[];
    shared: GroupItem[];
    wiring: GroupItem[];
    loose: { folder: string; files: GroupItem[] }[];
    support: { kind: string; files: FileInfo[] }[];
    loose_tests: FileInfo[];
  };
  diffs: Record<string, string>;
  timeline: {
    sessions: {
      id: string;
      title: string;
      agent: string;
      turns: { at: string | null; prompt: string; branch: string | null; events: TimelineEvent[] }[];
    }[];
    commits: { sha: string; at: string; subject: string }[];
    link: SessionLink;
  };
  map: { files: [string, number][]; flags: Record<string, string[]>; groups: Record<string, string> };
}

// Who a license belongs to.
export interface Holder {
  name: string;
  email: string;
  id: string;
  issued: string; // YYYY-MM-DD
}

export type LicenseStatus =
  | { state: "licensed"; holder: Holder }
  | { state: "trial"; days_left: number; ends: number } // ends: seconds since 1970
  | { state: "ended"; ended: number };
