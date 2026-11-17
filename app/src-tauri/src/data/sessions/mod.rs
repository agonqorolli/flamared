//! Agent session adapters: one parser per agent, all returning the same `Session` shape.
//! Claude Code: ~/.claude/projects/<dir>/<session>.jsonl (claude.rs)
//! Codex: ~/.codex/sessions/**/rollout-*.jsonl (codex.rs)
//! Reads only; never writes to either folder.
mod claude;
mod codex;
mod codex_shell;

use super::cache::{Stamped, cached};
use super::paths::{home, join};
use regex::Regex;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};

static TEST_COMMAND: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(pytest|jest|vitest|mocha|go test|cargo test|npm (run )?test|pnpm test|yarn test|rspec|phpunit)\b")
        .unwrap()
});
static PASSED_COUNT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)(\d+)\s+(passed|passing)").unwrap());
static CWD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#""cwd":"((?:[^"\\]|\\.)*)""#).unwrap());

/// One block of a diff: where it starts in the old and the new file, and its lines, each starting with `+`, `-`
/// or a space.
#[derive(Clone)]
pub struct Hunk {
    pub old_start: Option<i64>,
    pub new_start: Option<i64>,
    pub lines: Vec<String>,
}

impl Hunk {
    /// A new file's whole text, as added lines.
    fn added(text: &str) -> Hunk {
        Hunk {
            old_start: Some(0),
            new_start: Some(1),
            lines: text.lines().map(|line| format!("+{line}")).collect(),
        }
    }

    /// A deleted file's whole text, as removed lines.
    fn removed(text: &str) -> Hunk {
        Hunk {
            old_start: Some(1),
            new_start: Some(0),
            lines: text.lines().map(|line| format!("-{line}")).collect(),
        }
    }
}

/// One change an agent made to one file.
pub struct Edit {
    pub tool: String,
    pub file: Option<String>,
    pub at: Option<String>,
    pub branch: Option<String>,
    pub add: u64,
    pub rem: u64,
    pub new_file: bool,
    pub deleted: bool,
    pub moved_from: Option<String>,
    pub hunks: Vec<Hunk>,
    pub inferred: bool, // a literal shell write target; Codex did not record the file's diff
}

impl Edit {
    /// A change to an existing file with the diff the agent recorded for it; the line counts come from that diff.
    /// The other kinds (new, deleted, moved, inferred) set their own fields on top of this.
    fn recorded(
        tool: &str,
        file: Option<String>,
        at: Option<String>,
        branch: Option<String>,
        hunks: Vec<Hunk>,
    ) -> Edit {
        let (add, rem) = line_counts(&hunks);
        Edit {
            tool: tool.to_string(),
            file,
            at,
            branch,
            add,
            rem,
            new_file: false,
            deleted: false,
            moved_from: None,
            hunks,
            inferred: false,
        }
    }
}

/// A shell command an agent ran.
pub struct Run {
    pub cmd: String,
    pub desc: Option<String>,
    pub is_test: bool,
    pub failed: bool,
    pub passed: Option<u64>,
}

impl Run {
    /// A test command also gets the number of passed tests, when its output says so.
    fn new(cmd: String, desc: Option<String>, failed: bool, output: &str) -> Run {
        let is_test = TEST_COMMAND.is_match(&cmd);
        let passed = if is_test {
            PASSED_COUNT.captures(output).and_then(|found| found[1].parse().ok())
        } else {
            None
        };
        Run {
            cmd,
            desc,
            is_test,
            failed,
            passed,
        }
    }
}

/// What happened in a turn, in the order it happened.
pub enum Event {
    Say(String),
    Edit(usize), // index into Turn::edits
    Run(usize),  // index into Turn::runs
}

/// One prompt of yours and everything the agent did in answer to it.
pub struct Turn {
    pub prompt: String,
    pub at: Option<String>,
    pub branch: Option<String>,
    pub cwd: Option<String>,
    pub edits: Vec<Edit>,
    pub runs: Vec<Run>,
    pub events: Vec<Event>,
}

impl Turn {
    fn new(prompt: String, at: Option<String>, branch: Option<String>, cwd: Option<String>) -> Turn {
        Turn {
            prompt,
            at,
            branch,
            cwd,
            edits: vec![],
            runs: vec![],
            events: vec![],
        }
    }

    fn add_edit(&mut self, edit: Edit) {
        self.edits.push(edit);
        self.events.push(Event::Edit(self.edits.len() - 1));
    }

    fn add_run(&mut self, run: Run) {
        self.runs.push(run);
        self.events.push(Event::Run(self.runs.len() - 1));
    }
}

pub struct Session {
    pub agent: &'static str,
    pub title: Option<String>,
    pub turns: Vec<Turn>,
}

pub fn claude_dir() -> String {
    join(&home(), ".claude/projects")
}

fn codex_dir() -> String {
    join(&home(), ".codex")
}

fn codex_sessions_dir() -> String {
    join(&codex_dir(), "sessions")
}

/// The folders agents write their session files to (the watcher watches these).
pub fn session_dirs() -> Vec<String> {
    vec![claude_dir(), codex_sessions_dir()]
}

/// Every session file of every agent on this machine.
pub fn session_files() -> Vec<String> {
    let mut files = Vec::new();
    // Claude Code: one folder per project, with its session files directly inside.
    for project in entries(Path::new(&claude_dir())) {
        files.extend(
            entries(&project)
                .iter()
                .filter(|path| path.is_file() && is_jsonl(path))
                .map(|path| path_text(path)),
        );
    }
    // Codex: sessions/<year>/<month>/<day>/rollout-*.jsonl
    collect_jsonl(Path::new(&codex_sessions_dir()), &mut files);
    files
}

fn entries(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .collect()
}

fn is_jsonl(path: &Path) -> bool {
    path.extension().is_some_and(|extension| extension == "jsonl")
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn collect_jsonl(dir: &Path, files: &mut Vec<String>) {
    for path in entries(dir) {
        if path.is_dir() {
            collect_jsonl(&path, files);
        } else if is_jsonl(&path) {
            files.push(path_text(&path));
        }
    }
}

pub fn is_codex(path: &str) -> bool {
    path.starts_with(&codex_sessions_dir())
}

static PARSED: LazyLock<Stamped<Session>> = LazyLock::new(Default::default);
static CWDS: LazyLock<Stamped<Vec<String>>> = LazyLock::new(Default::default);

/// A session file as turns and events, read by its agent's parser. Remembered until the file changes.
pub fn parse(path: &str) -> Arc<Session> {
    cached(&PARSED, path, || {
        if is_codex(path) {
            codex::parse(path)
        } else {
            claude::parse(path)
        }
    })
}

/// Every folder a session file ran in (a session can move folders mid-way). Remembered until the file changes.
pub fn cwds(path: &str) -> Arc<Vec<String>> {
    cached(&CWDS, path, || read_cwds(path))
}

fn read_cwds(path: &str) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return vec![];
    };
    let mut folders: Vec<String> = Vec::new();
    for found in text.lines().filter_map(|line| CWD.captures(line)) {
        // The folder is written as a JSON string; reading it as one undoes its escapes.
        if let Ok(folder) = serde_json::from_str::<String>(&format!("\"{}\"", &found[1]))
            && !folders.contains(&folder)
        {
            folders.push(folder);
        }
    }
    folders
}

// --- What both parsers need to read a session file

/// The records of a session file: one JSON value per line. Lines that aren't JSON are left out.
fn records(path: &str) -> Vec<Value> {
    std::fs::read_to_string(path)
        .map(|text| {
            text.lines()
                .filter_map(|line| serde_json::from_str(line).ok())
                .collect()
        })
        .unwrap_or_default()
}

/// A text field of a JSON object.
fn str_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(String::from)
}

/// What a record or content block is: its "type" field.
fn kind(value: &Value) -> Option<&str> {
    value.get("type").and_then(Value::as_str)
}

/// How many lines a diff adds and removes.
fn line_counts(hunks: &[Hunk]) -> (u64, u64) {
    hunks
        .iter()
        .flat_map(|hunk| &hunk.lines)
        .fold((0, 0), |(added, removed), line| {
            if line.starts_with('+') {
                (added + 1, removed)
            } else if line.starts_with('-') {
                (added, removed + 1)
            } else {
                (added, removed)
            }
        })
}
