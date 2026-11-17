//! Linking agent sessions to the change being shown: which turns and edits belong to it, in the order they
//! happened, and the agent's words before each file's latest edit.
//!
//! A turn belongs when it ran in this repo (or one of its worktrees), after the branch point, and has edits on the
//! branch being shown that touch files still in the diff.
use super::model::{Commit, EditEvent, Event, HunkRow, RunEvent, SessionRow, TurnRow};
use crate::data::branches::BranchWork;
use crate::data::git::git_or_empty;
use crate::data::paths::{basename, realpath, relpath, root_of, take};
use crate::data::sessions::{self, Edit, Hunk, Session, Turn};
use crate::data::tree::{At, read_text};
use chrono::{DateTime, FixedOffset};
use indexmap::IndexMap;
use std::collections::{HashMap, HashSet};

// How much of each text the window is sent, in characters or lines.
const MAX_SAY: usize = 400;
const MAX_PROMPT: usize = 600;
const MAX_COMMAND: usize = 200;
const MAX_VIA: usize = 120;
const MAX_HUNKS: usize = 6;
const MAX_HUNK_LINES: usize = 120;
/// Shorter lines ("});", "end") appear all over a file and say nothing about whether an edit is still there.
const MIN_TELLING_LINE: usize = 4;
/// How many characters of a session file's name make its id.
const ID_LENGTH: usize = 8;

/// What the agent said before changing a file. Ordered by time first, so the latest of several is the greatest.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Words {
    pub at: String,
    pub text: String,
    pub agent: String,
}

/// What decides whether a turn or an edit belongs to the change being shown.
pub struct Scope<'a> {
    pub top: &'a str,
    pub at: &'a At,
    /// The branch being shown; empty when no branch is checked out.
    pub branch: &'a str,
    /// When the base commit was made: turns before it belong to earlier work.
    pub base_time: Option<DateTime<FixedOffset>>,
    /// The repo's checkouts: its main folder and its worktrees.
    pub roots: &'a [String],
    /// The changed files: path -> status.
    pub changed: &'a IndexMap<String, String>,
}

/// What the sessions say about the change.
#[derive(Default)]
pub struct Linked {
    pub sessions: Vec<SessionRow>,
    /// changed path -> the agent's message before its latest edit of it
    pub words: HashMap<String, Words>,
    /// branch -> the agent work on it, for the branch picker
    pub branch_work: HashMap<String, BranchWork>,
    /// How many session files worked in this repo.
    pub sessions_in_repo: usize,
    /// reason -> how many turns were left out for it
    pub skipped: IndexMap<&'static str, u64>,
}

pub fn parse_time(text: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(text.trim()).ok()
}

pub fn link(scope: &Scope) -> Linked {
    let worked_here = |file: &String| {
        sessions::cwds(file)
            .iter()
            .any(|cwd| root_of(&realpath(cwd), scope.roots).is_some())
    };
    let files: Vec<String> = sessions::session_files().into_iter().filter(worked_here).collect();
    let mut linked = Linked {
        sessions_in_repo: files.len(),
        ..Linked::default()
    };
    let mut current_texts = HashMap::new();
    for file in &files {
        let session = sessions::parse(file);
        note_branch_work(&session, &mut linked.branch_work);
        let id = session_id(file);
        let mut turns = Vec::new();
        for (index, turn) in session.turns.iter().enumerate() {
            let mut linker = TurnLinker {
                scope,
                agent: session.agent,
                turn,
                step_prefix: format!("{id}:{index}"),
                current_texts: &mut current_texts,
            };
            match linker.link() {
                Ok(LinkedTurn { row, said }) => {
                    for (path, words) in said {
                        if linked.words.get(&path).is_none_or(|earlier| words.at >= earlier.at) {
                            linked.words.insert(path, words);
                        }
                    }
                    turns.push(row);
                }
                Err(reason) => *linked.skipped.entry(reason).or_default() += 1,
            }
        }
        if !turns.is_empty() {
            let title = session.title.clone().unwrap_or_else(|| "Untitled session".into());
            linked.sessions.push(SessionRow {
                id,
                title,
                agent: session.agent,
                turns,
            });
        }
    }
    linked
}

/// Counts a session on each branch it edited on, with its latest edit there.
fn note_branch_work(session: &Session, branch_work: &mut HashMap<String, BranchWork>) {
    let mut latest_edit_on: HashMap<&str, Option<DateTime<FixedOffset>>> = HashMap::new();
    for edit in session.turns.iter().flat_map(|turn| &turn.edits) {
        let Some(branch) = edit.branch.as_deref().filter(|branch| is_known_branch(branch)) else {
            continue;
        };
        let latest = latest_edit_on.entry(branch).or_default();
        *latest = (*latest).max(edit.at.as_deref().and_then(parse_time));
    }
    for (branch, latest) in latest_edit_on {
        let work = branch_work.entry(branch.to_string()).or_default();
        work.sessions += 1;
        work.agents.insert(session.agent);
        work.last = work.last.max(latest);
    }
}

/// "HEAD" means no branch was checked out at the time: unknown, like no branch at all.
fn is_known_branch(branch: &str) -> bool {
    !branch.is_empty() && branch != "HEAD"
}

/// A short id per session: Claude Code names files by a UUID; Codex names them "rollout-<time>-<uuid>.jsonl",
/// so its unique part is at the end.
fn session_id(file: &str) -> String {
    let name = basename(file).trim_end_matches(".jsonl");
    if !sessions::is_codex(file) {
        return take(name, ID_LENGTH);
    }
    let from_the_end: Vec<char> = name.chars().rev().take(ID_LENGTH).collect();
    from_the_end.into_iter().rev().collect()
}

/// A turn that belongs to the change, and what the agent said before editing each of its changed files.
struct LinkedTurn {
    row: TurnRow,
    said: Vec<(String, Words)>,
}

/// (file text now, by checkout and path): read once however many edits touched the file.
type CurrentTexts = HashMap<(String, String), Option<String>>;

/// One turn being matched against the change.
struct TurnLinker<'a> {
    scope: &'a Scope<'a>,
    agent: &'static str,
    turn: &'a Turn,
    /// "<session id>:<turn number>", the start of each step's name.
    step_prefix: String,
    current_texts: &'a mut CurrentTexts,
}

impl TurnLinker<'_> {
    /// The turn as the window shows it, with what the agent said about each changed file; or why it is left out.
    fn link(&mut self) -> Result<LinkedTurn, &'static str> {
        let (scope, turn) = (self.scope, self.turn);
        if root_of(&realpath(turn.cwd.as_deref().unwrap_or("/")), scope.roots).is_none() {
            return Err("other folder");
        }
        if let (Some(base_time), Some(at)) = (scope.base_time, turn.at.as_deref().and_then(parse_time))
            && at < base_time
        {
            return Err("before the branch point");
        }
        let mut events: Vec<Event> = Vec::new();
        let mut said: Vec<(String, Words)> = Vec::new();
        // Commands shown on the edit they made, not as their own row (by their place in `events`).
        let mut absorbed: HashSet<usize> = HashSet::new();
        let (mut last_say, mut last_run, mut off_branch, mut step) = (None::<String>, None::<usize>, 0, 0);
        for event in &turn.events {
            match event {
                sessions::Event::Say(text) => {
                    let text = take(text, MAX_SAY);
                    last_run = None;
                    step += 1; // a "step" is the run of edits between two agent messages
                    events.push(Event::Say { text: text.clone() });
                    last_say = Some(text);
                }
                sessions::Event::Run(index) => {
                    let run = &turn.runs[*index];
                    last_run = Some(events.len());
                    events.push(Event::Run(RunEvent {
                        cmd: take(&run.cmd, MAX_COMMAND),
                        desc: run.desc.clone(),
                        is_test: run.is_test,
                        passed: run.passed,
                        failed: run.failed,
                    }));
                }
                sessions::Event::Edit(index) => {
                    let edit = &turn.edits[*index];
                    // The branch is checked per edit: a turn can start on one branch and check out another mid-way.
                    if self.is_on_another_branch(edit) {
                        off_branch += 1;
                        continue;
                    }
                    let file = realpath(edit.file.as_deref().unwrap_or("/"));
                    let Some(root) = root_of(&file, scope.roots) else {
                        continue;
                    };
                    let path = relpath(&file, root);
                    let still_changed = scope.changed.contains_key(&path);
                    // Shell evidence has no historical diff: only link targets still changed in git.
                    if edit.inferred && !still_changed {
                        continue;
                    }
                    let mut via = None;
                    if (edit.tool == "Bash" || edit.tool == "Codex shell")
                        && let Some(run_at) = last_run
                        && let Event::Run(run) = &events[run_at]
                    {
                        // The command that made this edit is shown on the edit, not as its own row.
                        via = Some(take(run.cmd.lines().next().unwrap_or(""), MAX_VIA));
                        absorbed.insert(run_at);
                    }
                    let step_name = format!("{}:{step}", self.step_prefix);
                    events.push(Event::Edit(self.edit_event(
                        edit,
                        root,
                        &path,
                        via,
                        step_name,
                        last_say.clone(),
                    )));
                    if let Some(text) = &last_say
                        && still_changed
                    {
                        let words = Words {
                            at: edit.at.clone().unwrap_or_default(),
                            text: text.clone(),
                            agent: self.agent.to_string(),
                        };
                        said.push((path, words));
                    }
                }
            }
        }
        let events: Vec<Event> = events
            .into_iter()
            .enumerate()
            .filter(|(i, _)| !absorbed.contains(i))
            .map(|(_, event)| event)
            .collect();
        let edited: Vec<&str> = events
            .iter()
            .filter_map(|event| match event {
                Event::Edit(edit) => Some(edit.path.as_str()),
                _ => None,
            })
            .collect();
        if edited.is_empty() {
            return Err(if off_branch > 0 {
                "edits on another branch"
            } else {
                "no file edits"
            });
        }
        if !edited.iter().any(|path| scope.changed.contains_key(*path)) {
            return Err("edits no longer in the diff");
        }
        let row = TurnRow {
            at: turn.at.clone(),
            prompt: take(&turn.prompt, MAX_PROMPT),
            branch: turn.branch.clone(),
            events,
        };
        Ok(LinkedTurn { row, said })
    }

    fn is_on_another_branch(&self, edit: &Edit) -> bool {
        let shown = self.scope.branch;
        !shown.is_empty()
            && edit
                .branch
                .as_deref()
                .is_some_and(|branch| is_known_branch(branch) && branch != shown)
    }

    fn edit_event(
        &mut self,
        edit: &Edit,
        root: &str,
        path: &str,
        via: Option<String>,
        step: String,
        say: Option<String>,
    ) -> EditEvent {
        let scope = self.scope;
        let text_now = self
            .current_texts
            .entry((root.to_string(), path.to_string()))
            .or_insert_with(|| match scope.at {
                At::Work => read_text(root, path),
                At::Commit(_) => scope.at.read(scope.top, path), // the file as it is at the viewed branch's tip
            });
        EditEvent {
            path: path.to_string(),
            add: edit.add,
            rem: edit.rem,
            at: edit.at.clone(),
            via,
            agent: self.agent,
            step,
            survives: survival(&edit.hunks, text_now.as_ref()),
            tool: edit.tool.clone(),
            new_file: edit.new_file,
            deleted: edit.deleted,
            inferred: edit.inferred,
            moved_from: edit.moved_from.as_deref().map(|from| relpath(&realpath(from), root)),
            say,
            hunks: edit.hunks.iter().take(MAX_HUNKS).map(hunk_row).collect(),
        }
    }
}

fn hunk_row(hunk: &Hunk) -> HunkRow {
    HunkRow {
        old_start: hunk.old_start,
        new_start: hunk.new_start,
        lines: hunk.lines.iter().take(MAX_HUNK_LINES).cloned().collect(),
    }
}

/// Is an edit still in the current file? Compares its added (or removed) lines with the file as it is now.
/// kept: all its lines are there · partly · gone: rewritten later · undone: removed lines came back.
fn survival(hunks: &[Hunk], text_now: Option<&String>) -> Option<&'static str> {
    if hunks.is_empty() {
        return None;
    }
    let Some(text_now) = text_now else {
        return Some("gone");
    };
    let lines_now: HashSet<&str> = text_now.lines().map(str::trim).collect();
    let telling_lines = |sign: char| -> Vec<&str> {
        let lines = hunks
            .iter()
            .flat_map(|hunk| &hunk.lines)
            .filter(|line| line.starts_with(sign));
        lines
            .map(|line| line[1..].trim())
            .filter(|line| line.chars().count() >= MIN_TELLING_LINE)
            .collect()
    };
    let still_there = |lines: &[&str]| lines.iter().filter(|line| lines_now.contains(*line)).count();
    let (added, removed) = (telling_lines('+'), telling_lines('-'));
    if !added.is_empty() {
        let there = still_there(&added);
        return Some(if there == added.len() {
            "kept"
        } else if there == 0 {
            "gone"
        } else {
            "partly"
        });
    }
    if !removed.is_empty() {
        let back = still_there(&removed);
        return Some(if back == 0 {
            "kept"
        } else if back == removed.len() {
            "undone"
        } else {
            "partly"
        });
    }
    None
}

/// The commits between the base and what is shown, newest first.
pub fn commits(top: &str, base: &str, at: &At) -> Vec<Commit> {
    let log = git_or_empty(
        top,
        &["log", "--format=%h%x09%cI%x09%s", &format!("{base}..{}", at.rev())],
    );
    log.lines()
        .filter_map(|line| {
            let mut fields = line.splitn(3, '\t');
            Some(Commit {
                sha: fields.next()?.to_string(),
                at: fields.next()?.to_string(),
                subject: fields.next()?.to_string(),
            })
        })
        .collect()
}
