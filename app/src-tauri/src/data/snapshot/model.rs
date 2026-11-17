//! What the window is sent: one `Snapshot` per screen load, and the rows of the repo and branch pickers.
//! The window's copy of these shapes is app/src/lib/types.ts; change the two together. Fields are written to JSON
//! in the order they are declared here.
use indexmap::IndexMap;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize)]
pub struct Snapshot {
    pub repo: String,
    pub path: String,
    /// The branch being shown, or the short commit id when none is checked out.
    pub branch: String,
    /// The commit the change is compared with, as a short id; `base_label` is how it was asked for ("HEAD").
    pub base: String,
    pub base_label: String,
    pub head: String,
    pub generated: String,
    pub repos: Vec<RepoRow>,
    pub branches: Vec<BranchRow>,
    pub viewing: Viewing,
    pub stats: Totals,
    pub story: Story,
    /// changed path -> its diff as text, in git's order
    pub diffs: IndexMap<String, String>,
    pub timeline: Timeline,
    pub map: Map,
}

#[derive(Serialize)]
pub struct Viewing {
    pub branch: String,
    /// false: another branch's commits, read from git without checking it out
    pub checked_out: bool,
}

#[derive(Serialize)]
pub struct Totals {
    pub files: usize,
    pub add: u64,
    pub rem: u64,
}

// --- Changes

/// The Changes screen's sections.
#[derive(Serialize)]
pub struct Story {
    pub logic: Vec<GroupItem>,
    pub shared: Vec<GroupItem>,
    pub wiring: Vec<GroupItem>,
    pub loose: Vec<LooseFolder>,
    pub support: Vec<SupportKind>,
    pub loose_tests: Vec<FileInfo>,
}

#[derive(Serialize)]
pub struct GroupItem {
    pub name: String,
    pub files: Vec<FileInfo>,
    pub tests: Vec<FileInfo>,
    /// (name, "+" added / "~" changed / "-" removed, the file it is in), the first few
    pub symbols: Vec<(String, String, String)>,
    /// how many more symbols there are
    pub more: usize,
    pub add: u64,
    pub rem: u64,
    pub uses: Vec<String>,
    pub used_by: usize,
    pub imports: usize,
    pub words: Option<String>,
    pub words_agent: Option<String>,
}

#[derive(Serialize)]
pub struct FileInfo {
    pub path: String,
    pub status: String,
    pub add: u64,
    pub rem: u64,
    /// The agent's last message before its latest edit of this file, who said it and when.
    pub words: Option<String>,
    pub words_agent: Option<String>,
    pub words_at: Option<String>,
    /// Changed files this one imports, and changed files importing it.
    pub links_out: Vec<String>,
    pub links_in: Vec<String>,
    pub binary: bool,
}

/// Unconnected code files of one folder.
#[derive(Serialize)]
pub struct LooseFolder {
    pub folder: String,
    pub files: Vec<GroupItem>,
}

/// Changed files that aren't code, of one kind (deps, config, docs...).
#[derive(Serialize)]
pub struct SupportKind {
    pub kind: String,
    pub files: Vec<FileInfo>,
}

// --- Timeline

#[derive(Serialize)]
pub struct Timeline {
    pub sessions: Vec<SessionRow>,
    pub commits: Vec<Commit>,
    pub link: SessionLink,
}

#[derive(Serialize)]
pub struct SessionRow {
    pub id: String,
    pub title: String,
    pub agent: &'static str,
    pub turns: Vec<TurnRow>,
}

#[derive(Serialize)]
pub struct TurnRow {
    pub at: Option<String>,
    pub prompt: String,
    pub branch: Option<String>,
    pub events: Vec<Event>,
}

/// One thing that happened in a turn. In JSON, `k` says which: "say", "edit" or "run".
#[derive(Serialize)]
#[serde(tag = "k", rename_all = "lowercase")]
pub enum Event {
    Say {
        #[serde(rename = "t")]
        text: String,
    },
    Edit(EditEvent),
    Run(RunEvent),
}

#[derive(Serialize)]
pub struct EditEvent {
    pub path: String,
    pub add: u64,
    pub rem: u64,
    pub at: Option<String>,
    /// The shell command that made the edit, when one did.
    pub via: Option<String>,
    pub agent: &'static str,
    /// Names the run of edits between two agent messages: edits with the same step were made together.
    pub step: String,
    /// kept / partly / gone / undone: is the edit still in the file?
    pub survives: Option<&'static str>,
    pub tool: String,
    #[serde(rename = "new")]
    pub new_file: bool,
    #[serde(rename = "del")]
    pub deleted: bool,
    pub inferred: bool,
    #[serde(rename = "from")]
    pub moved_from: Option<String>,
    /// The agent's last message before the edit.
    pub say: Option<String>,
    pub hunks: Vec<HunkRow>,
}

#[derive(Serialize)]
pub struct HunkRow {
    #[serde(rename = "o")]
    pub old_start: Option<i64>,
    #[serde(rename = "n")]
    pub new_start: Option<i64>,
    pub lines: Vec<String>,
}

#[derive(Serialize)]
pub struct RunEvent {
    pub cmd: String,
    pub desc: Option<String>,
    #[serde(rename = "test")]
    pub is_test: bool,
    pub passed: Option<u64>,
    pub failed: bool,
}

#[derive(Serialize)]
pub struct Commit {
    pub sha: String,
    pub at: String,
    pub subject: String,
}

/// How the sessions were matched to this change, with what was left out and why. Not shown in the window; the
/// `dump` example prints it.
#[derive(Serialize)]
pub struct SessionLink {
    pub branch: String,
    pub base: String,
    pub worktrees: usize,
    pub sessions_in_repo: usize,
    pub turns_kept: usize,
    /// reason -> how many turns were left out for it
    pub skipped: IndexMap<&'static str, u64>,
    /// agent -> how many of its sessions are shown
    pub agents: IndexMap<&'static str, u64>,
}

// --- Map

#[derive(Serialize)]
pub struct Map {
    /// (path, size) for every file in the repo
    pub files: Vec<(String, u64)>,
    /// changed path -> its rule flags
    pub flags: BTreeMap<String, Vec<String>>,
    /// changed path -> the name of its group
    pub groups: BTreeMap<String, String>,
}

// --- The pickers

#[derive(Serialize)]
pub struct RepoRow {
    pub name: String,
    /// The folder as shown: with ~ for the home folder.
    pub path: String,
    pub full: String,
    pub sessions: u64,
    pub last: Option<String>,
    pub current: bool,
}

#[derive(Serialize)]
pub struct BranchRow {
    pub name: String,
    pub at: String,
    pub remote: bool,
    pub current: bool,
    /// checked out in another worktree folder
    pub worktree: bool,
    pub sessions: u64,
    pub agents: Vec<&'static str>,
    pub agent_at: Option<String>,
    pub subject: String,
}

/// A repo's checked-out branch and its uncommitted files.
#[derive(Serialize)]
pub struct RepoStatus {
    pub full: String,
    pub branch: String,
    pub changed: Vec<String>,
}

/// How many files a branch changed, and against what (None: uncommitted changes in a working folder).
#[derive(Serialize)]
pub struct BranchFiles {
    pub n: usize,
    pub against: Option<String>,
}
