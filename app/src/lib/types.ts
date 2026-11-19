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
  survives: "kept" | "partly" | "gone" | "undone" | null; // is the edit still in the file?
  tool: string;
  inferred?: boolean; // a literal shell write target; no historical diff was recorded
  new: boolean;
  del: boolean;
  from: string | null;
  say: string | null;
  hunks: Hunk[];
}

// One block of an edit's diff: where it starts in the old (`o`) and the new (`n`) file, and its lines.
export interface Hunk {
  o: number | null;
  n: number | null;
  lines: string[];
}
// A shell command the agent ran. `checks` says what it checks (test, type check, lint, build tools), `effects` what
// it changed outside the diff.
export type Check = "test" | "types" | "lint" | "build";
// What a command changed outside the diff (src-tauri/src/data/sessions/effects.rs).
export type Effect = "install" | "delete" | "discard" | "git" | "network" | "database";
export interface TimelineRun {
  k: "run";
  cmd: string;
  desc: string | null;
  at: string | null;
  checks: Check[]; // in the order the command runs them; empty for any other command
  check_cmd: string | null; // the parts of the command that run them ("pnpm lint && npx tsc --noEmit")
  effects: Effect[]; // what it changed outside the diff, in order; empty for most commands
  effect_cmd: string | null; // the parts of the command that did it ("rm -rf dist && git stash")
  passed: number | null; // tests passed, when a test command's output says so
  failed: boolean; // it exited with an error, or (for a check) its output reports a failure
}
export type TimelineEvent = { k: "say"; t: string } | TimelineRun | TimelineEdit;

export interface TimelineTurn {
  at: string | null;
  prompt: string;
  branch: string | null;
  events: TimelineEvent[];
}

export interface TimelineSession {
  id: string;
  title: string;
  agent: string;
  turns: TimelineTurn[];
}

export interface TimelineCommit {
  sha: string;
  at: string;
  subject: string;
}

// How the sessions were matched to the change. Not shown in the window.
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
    left_out: FileInfo[]; // left out of the review by the patterns in Settings → Files, in git's order
  };
  diffs: Record<string, string>;
  timeline: {
    sessions: TimelineSession[];
    commits: TimelineCommit[];
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
  updates_until?: string; // YYYY-MM-DD, set on renewed keys; read `updates_until` on the status instead
}

// Days are YYYY-MM-DD. `updates_until`: the last day whose new versions the key covers; `released`: the day this
// version was made, after that.
export type LicenseStatus =
  | { state: "licensed"; holder: Holder; updates_until: string }
  | { state: "trial"; days_left: number; ends: number } // ends: seconds since 1970
  | { state: "ended"; ended: number }
  | { state: "not_covered"; holder: Holder; updates_until: string; released: string };

// What Settings → About shows that only the Rust side can read.
export interface About {
  system: string; // "macOS 26.1 (aarch64)"
  data_folder: string;
  data_folder_shown: string; // with ~ for the home folder
}

// Where an agent's sessions are read from (Settings → Agents). `source`: the agent's own default folder, its
// environment variable (`variable`), or a folder chosen in Settings.
export type AgentId = "claude" | "codex";
export interface AgentFolder {
  agent: AgentId;
  name: string;
  folder: string; // with ~ for the home folder
  full: string;
  source: "default" | "variable" | "chosen";
  variable: string;
  found: boolean; // its sessions folder is there
  sessions: number;
  latest: string | null; // when the newest session file was written
}
