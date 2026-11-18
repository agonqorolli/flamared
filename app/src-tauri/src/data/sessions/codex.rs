//! Codex rollouts: `item_completed` events hold your messages, the agent's, the commands it ran and its file changes.
use super::codex_shell;
use super::{Edit, Event, Hunk, Run, Session, Turn, codex_dir, kind, records, str_field};
use crate::data::paths::{join, take};
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::LazyLock;

static HUNK_HEADER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^@@ -(\d+)(?:,\d+)? \+(\d+)").unwrap());
static BRANCH_SWITCH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^git\s+(?:switch(?:\s+-[cC])?|checkout(?:\s+-[bB])?)\s+([^\s;&|]+)\s*$").unwrap());

/// Where the session is working: Codex says so at the start, and again in a `turn_context` record when it changes.
struct Place {
    cwd: Option<String>,
    branch: Option<String>,
}

impl Place {
    fn new(session_meta: &Value) -> Place {
        Place {
            cwd: folder_path(str_field(session_meta, "cwd")),
            branch: session_meta.get("git").and_then(|git| str_field(git, "branch")),
        }
    }

    /// A `turn_context` record. In another folder the branch is unknown until the record names it.
    fn update(&mut self, context: &Value) {
        let cwd = folder_path(str_field(context, "cwd")).or_else(|| self.cwd.clone());
        if cwd != self.cwd {
            self.branch = None;
        }
        if let Some(branch) = context.get("git").and_then(|git| str_field(git, "branch")) {
            self.branch = Some(branch);
        }
        self.cwd = cwd;
    }
}

pub(super) fn parse(path: &str) -> Session {
    let records = records(path);
    let id = session_meta(&records).and_then(|meta| str_field(meta, "id"));
    let title = id.and_then(|id| titles().remove(&id));
    parse_records(&records, title)
}

fn session_meta(records: &[Value]) -> Option<&Value> {
    records
        .iter()
        .find(|record| kind(record) == Some("session_meta"))
        .and_then(|record| record.get("payload"))
}

/// The names Codex gave its sessions, by session id.
fn titles() -> HashMap<String, String> {
    records(&join(&codex_dir(), "session_index.jsonl"))
        .iter()
        .filter_map(|row| {
            Some((
                str_field(row, "id")?,
                str_field(row, "thread_name").filter(|name| !name.is_empty())?,
            ))
        })
        .collect()
}

fn parse_records(records: &[Value], title: Option<String>) -> Session {
    let mut place = Place::new(session_meta(records).unwrap_or(&Value::Null));
    let mut session = Session {
        agent: "Codex",
        title,
        turns: vec![],
    };
    for record in records {
        let Some(payload) = record.get("payload") else {
            continue;
        };
        if kind(record) == Some("turn_context") {
            place.update(payload);
            continue;
        }
        if kind(record) != Some("event_msg") || kind(payload) != Some("item_completed") {
            continue;
        }
        let Some(item) = payload.get("item") else {
            continue;
        };
        let at = str_field(record, "timestamp");
        if kind(item) == Some("UserMessage") {
            let prompt = text_of(item.get("content"));
            if !prompt.is_empty() {
                session
                    .turns
                    .push(Turn::new(prompt, at, place.branch.clone(), place.cwd.clone()));
            }
            continue;
        }
        let Some(turn) = session.turns.last_mut() else {
            continue;
        };
        match kind(item) {
            Some("AgentMessage") => say(turn, item),
            Some("CommandExecution") => command(turn, item, at, &mut place),
            Some("FileChange") => file_change(turn, item, at, &place),
            _ => {}
        }
    }
    if session.title.is_none() {
        session.title = session
            .turns
            .first()
            .map(|turn| take(turn.prompt.lines().next().unwrap_or(""), 80));
    }
    session
}

/// The text of a message: its content blocks' texts, one per line.
fn text_of(content: Option<&Value>) -> String {
    let blocks = content.and_then(Value::as_array).into_iter().flatten();
    blocks
        .filter_map(|block| str_field(block, "text"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

/// Codex writes a folder as a path or as a file: URL.
fn folder_path(value: Option<String>) -> Option<String> {
    let value = value?;
    if !value.starts_with("file:") {
        return Some(value);
    }
    let path = tauri::Url::parse(&value).ok()?.to_file_path().ok()?;
    Some(path.to_string_lossy().into_owned())
}

/// Something the agent wrote to you.
fn say(turn: &mut Turn, item: &Value) {
    let text = text_of(item.get("content"));
    if !text.is_empty() {
        turn.events.push(Event::Say(text));
    }
}

/// A shell command: a run, a branch switch to follow, and an edit for each file it plainly wrote (see codex_shell).
fn command(turn: &mut Turn, item: &Value, at: Option<String>, place: &mut Place) {
    let cmd = match item.get("command") {
        // A shell and its arguments, the command last: ["/bin/zsh", "-lc", "<command>"]
        Some(Value::Array(parts)) => parts.last().and_then(Value::as_str).unwrap_or("").to_string(),
        Some(Value::String(cmd)) => cmd.clone(),
        _ => String::new(),
    };
    let output = str_field(item, "aggregated_output").unwrap_or_default();
    let exit = item.get("exit_code").and_then(Value::as_i64);
    let folder = folder_path(str_field(item, "cwd")).or_else(|| place.cwd.clone());
    let in_session_folder = folder
        .as_ref()
        .zip(place.cwd.as_ref())
        .is_some_and(|(folder, session_folder)| {
            folder == session_folder || folder.starts_with(&format!("{session_folder}/"))
        });
    if in_session_folder && let Some(branch) = switched_branch(&cmd, &output, exit) {
        place.branch = Some(branch);
    }
    let written = codex_shell::written_paths(&cmd, &output, exit);
    let failed = item
        .get("exit_code")
        .is_some_and(|code| !code.is_null() && code.as_i64() != Some(0));
    turn.add_run(Run::new(cmd, None, at.clone(), failed, &output));
    let Some(folder) = folder else {
        return;
    };
    for path in written {
        let branch = if in_session_folder { place.branch.clone() } else { None };
        let edit = Edit::recorded("Codex shell", Some(join(&folder, &path)), at.clone(), branch, vec![]);
        turn.add_edit(Edit { inferred: true, ..edit });
    }
}

/// Follow a successful, directly recorded branch switch. Never take branch-looking text in a
/// read command's output as evidence, and never assign a switch in another folder to this session.
fn switched_branch(cmd: &str, output: &str, exit: Option<i64>) -> Option<String> {
    if exit != Some(0) {
        return None;
    }
    let found = BRANCH_SWITCH.captures(cmd.trim())?;
    let branch = found[1].trim_matches(['\'', '"']);
    if branch.starts_with('-') {
        return None;
    }
    let confirmed = output.lines().any(|line| {
        line == format!("Switched to branch '{branch}'") || line == format!("Switched to a new branch '{branch}'")
    });
    confirmed.then(|| branch.to_string())
}

/// The files one FileChange item added, deleted, moved or patched, each with its diff.
fn file_change(turn: &mut Turn, item: &Value, at: Option<String>, place: &Place) {
    let Some(changes) = item.get("changes").and_then(Value::as_object) else {
        return;
    };
    let folder = place.cwd.clone().unwrap_or_default();
    for (path, change) in changes {
        let file = join(&folder, path);
        let moved_to = str_field(change, "move_path").map(|to| join(&folder, &to));
        let change_kind = kind(change);
        let content = str_field(change, "content").unwrap_or_default();
        let hunks = match change_kind {
            Some("add") => vec![Hunk::added(&content)],
            Some("delete") => vec![Hunk::removed(&content)],
            _ => hunks_from_unified(&str_field(change, "unified_diff").unwrap_or_default()),
        };
        let moved_from = moved_to.is_some().then(|| file.clone());
        let edit = Edit::recorded(
            "Codex",
            Some(moved_to.unwrap_or(file)),
            at.clone(),
            place.branch.clone(),
            hunks,
        );
        turn.add_edit(Edit {
            new_file: change_kind == Some("add"),
            deleted: change_kind == Some("delete"),
            moved_from,
            ..edit
        });
    }
}

/// A unified diff string -> hunks.
fn hunks_from_unified(diff: &str) -> Vec<Hunk> {
    let mut hunks: Vec<Hunk> = Vec::new();
    for line in diff.lines() {
        if let Some(header) = HUNK_HEADER.captures(line) {
            hunks.push(Hunk {
                old_start: header[1].parse().ok(),
                new_start: header[2].parse().ok(),
                lines: vec![],
            });
        } else if let Some(hunk) = hunks.last_mut()
            && line.starts_with(['+', '-', ' '])
        {
            hunk.lines.push(line.to_string());
        }
    }
    hunks
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn item(it: Value) -> Value {
        json!({"type":"event_msg", "timestamp":"2026-11-16T19:00:00Z", "payload":{"type":"item_completed", "item":it}})
    }
    fn start() -> Vec<Value> {
        vec![
            json!({"type":"session_meta", "payload":{"cwd":"/repo", "git":{"branch":"old"}}}),
            item(json!({"type":"UserMessage", "content":[{"text":"Fix loading"}]})),
            item(json!({"type":"AgentMessage", "content":[{"text":"I will update the loading state."}]})),
        ]
    }
    fn command(cmd: &str, cwd: &str, out: &str, exit: Option<i64>) -> Value {
        item(
            json!({"type":"CommandExecution", "command":["/bin/zsh","-lc",cmd], "cwd":cwd, "aggregated_output":out, "exit_code":exit}),
        )
    }
    fn write(cwd: &str) -> Value {
        command(
            "python3 - <<'PY'\np='src/view.ts';s=open(p).read();open(p,'w').write(s)\nPY",
            cwd,
            "",
            Some(0),
        )
    }

    #[test]
    fn shell_writes_follow_a_branch_switch_in_the_same_turn() {
        let mut records = start();
        records.push(write("file:///repo"));
        records.push(command(
            "git switch -c feature",
            "file:///repo/app",
            "Switched to a new branch 'feature'\n",
            Some(0),
        ));
        records.push(write("file:///repo"));
        let session = parse_records(&records, None);
        let turn = &session.turns[0];
        assert_eq!(turn.edits.len(), 2);
        assert_eq!(turn.edits[0].branch.as_deref(), Some("old"));
        let edit = &turn.edits[1];
        assert_eq!(edit.branch.as_deref(), Some("feature"));
        assert_eq!(edit.file.as_deref(), Some("/repo/src/view.ts"));
        assert!(edit.inferred && edit.hunks.is_empty());
        assert_eq!((edit.add, edit.rem), (0, 0));
        assert!(matches!(&turn.events[0], Event::Say(s) if s == "I will update the loading state."));
    }

    #[test]
    fn failed_switches_other_repositories_and_read_output_do_not_reassign_edits() {
        let mut records = start();
        records.push(command(
            "git switch -c failed",
            "file:///repo",
            "fatal: failed",
            Some(1),
        ));
        records.push(command(
            "git switch other",
            "file:///elsewhere",
            "Switched to branch 'other'",
            Some(0),
        ));
        records.push(command(
            "cat log.txt",
            "file:///repo",
            "Switched to branch 'printed'",
            Some(0),
        ));
        records.push(write("file:///repo"));
        assert_eq!(
            parse_records(&records, None).turns[0].edits[0].branch.as_deref(),
            Some("old")
        );
    }

    #[test]
    fn file_changes_keep_their_diff_and_use_the_updated_branch() {
        let mut records = start();
        records.push(command(
            "git checkout -b next",
            "file:///repo",
            "Switched to a new branch 'next'",
            Some(0),
        ));
        records.push(item(json!({"type":"UserMessage", "content":[{"text":"Now edit"}]})));
        records.push(item(json!({"type":"FileChange", "changes":{"src/a.ts":{"type":"update", "unified_diff":"@@ -1 +1 @@\n-old\n+new\n"}}})));
        let session = parse_records(&records, None);
        let edit = &session.turns[1].edits[0];
        assert_eq!(edit.branch.as_deref(), Some("next"));
        assert_eq!((edit.add, edit.rem), (1, 1));
        assert!(!edit.inferred);
    }

    #[test]
    fn command_working_directory_is_used_and_uri_paths_are_decoded() {
        let mut records = start();
        records.push(write("file:///repo/sub%20folder"));
        assert_eq!(
            parse_records(&records, None).turns[0].edits[0].file.as_deref(),
            Some("/repo/sub folder/src/view.ts")
        );
    }
}
