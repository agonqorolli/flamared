//! What each recent agent session is doing right now: working, waiting for you, or finished. Not shown anywhere yet
//! (the pickers tried it and went back to plain change counts); kept, with its tests, for when it has a place. Read from the end of the session file, no AI:
//! - Claude Code: the last message. A finished turn (`end_turn`) is finished; a tool call with no result yet is the
//!   agent running it, or, once the file has been quiet for a while, waiting for you (usually an approval prompt).
//! - Codex: `task_complete` is finished; an approval request is waiting; anything else recent is working.
//! "Waiting for you" is a best guess (a slow command looks the same), so the window says "probably".
use super::paths::realpath;
use super::sessions;
use serde_json::{json, Value};
use std::io::{Read, Seek, SeekFrom};
use std::time::{Duration, SystemTime};

/// Sessions written in this window count; older ones are just history.
const RECENT: Duration = Duration::from_secs(3 * 24 * 3600);
/// A tool call with no result after this much quiet: probably waiting for an approval.
const QUIET: Duration = Duration::from_secs(30);
/// Still writing within this: working.
const BUSY: Duration = Duration::from_secs(120);
/// Waiting this long is an abandoned session, not one that needs you.
const STALE: Duration = Duration::from_secs(6 * 3600);
/// How much of the end of a file is read: enough for the last few records, even with big tool results.
const TAIL: u64 = 512 * 1024;

/// Every session written in the last few days: its repo (via `repo_of`), branch, agent, state, when it was last
/// written, and its last prompt. Newest first.
pub fn agents_now(repo_of: impl Fn(&str) -> Option<String>) -> Vec<Value> {
    let now = SystemTime::now();
    let mut out: Vec<(SystemTime, Value)> = Vec::new();
    for f in sessions::session_files() {
        let Some(at) = std::fs::metadata(&f).and_then(|m| m.modified()).ok() else { continue };
        let age = now.duration_since(at).unwrap_or_default();
        if age > RECENT {
            continue;
        }
        let s = sessions::parse(&f);
        let Some(turn) = s.turns.last() else { continue };
        let Some(repo) = turn.cwd.as_deref().and_then(|c| repo_of(&realpath(c))) else { continue };
        let records = tail_records(&f);
        let state = if sessions::is_codex(&f) { codex_state(&records, age) } else { claude_state(&records, age) };
        let at_iso = chrono::DateTime::<chrono::Local>::from(at).to_rfc3339();
        out.push((
            at,
            json!({"repo": repo, "branch": turn.branch, "agent": s.agent, "state": state, "at": at_iso, "prompt": last_prompt(&s)}),
        ));
    }
    out.sort_by(|a, b| b.0.cmp(&a.0));
    out.into_iter().map(|(_, v)| v).collect()
}

/// Your latest real prompt: a turn you stopped records "[Request interrupted…]" as its prompt, so that one is skipped.
fn last_prompt(s: &sessions::Session) -> String {
    let p = s.turns.iter().rev().map(|t| t.prompt.trim()).find(|p| !p.is_empty() && !p.starts_with("[Request interrupted")).unwrap_or("");
    p.chars().take(200).collect()
}

/// The last records of a session file, oldest first (a partly cut first line is skipped).
fn tail_records(path: &str) -> Vec<Value> {
    let Ok(mut f) = std::fs::File::open(path) else { return vec![] };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(TAIL);
    if f.seek(SeekFrom::Start(start)).is_err() {
        return vec![];
    }
    let mut buf = Vec::new();
    if f.read_to_end(&mut buf).is_err() {
        return vec![];
    }
    let text = String::from_utf8_lossy(&buf);
    let mut lines: Vec<&str> = text.lines().collect();
    if start > 0 && !lines.is_empty() {
        lines.remove(0);
    }
    lines.into_iter().filter_map(|l| serde_json::from_str(l).ok()).collect()
}

fn claude_state(records: &[Value], age: Duration) -> &'static str {
    // The last message (agent or you); everything else (snapshots, titles, costs) doesn't say what's happening.
    let Some(last) = records.iter().rev().find(|r| matches!(r["type"].as_str(), Some("assistant" | "user")) && r["isMeta"] != true) else {
        return "finished";
    };
    let content = &last["message"]["content"];
    let blocks = content.as_array().map(Vec::as_slice).unwrap_or_default();
    let has = |kind: &str| blocks.iter().any(|b| b["type"] == kind);
    let text = content.as_str().map(str::to_string).unwrap_or_else(|| blocks.iter().filter_map(|b| b["text"].as_str()).collect());
    if last["type"] == "assistant" {
        if has("tool_use") {
            // A call with no result yet: running it, or (quiet for a while) waiting for your approval.
            return if age < QUIET { "working" } else if age < STALE { "waiting" } else { "finished" };
        }
        return if last["message"]["stop_reason"].is_null() && age < BUSY { "working" } else { "finished" };
    }
    // Your side: a tool result (the agent continues) or a prompt (the agent starts); stopped by you means finished.
    if text.contains("[Request interrupted") {
        return "finished";
    }
    if age < BUSY { "working" } else { "finished" }
}

fn codex_state(records: &[Value], age: Duration) -> &'static str {
    for r in records.iter().rev() {
        let kind = r["payload"]["type"].as_str().unwrap_or("");
        if kind == "task_complete" || kind == "turn_aborted" {
            return "finished";
        }
        if kind.contains("approval") {
            return if age < STALE { "waiting" } else { "finished" };
        }
        if r["type"] == "response_item" || kind == "task_started" || kind == "user_message" {
            break; // the newest real step: decided by how recently the file was written
        }
    }
    if age < BUSY { "working" } else { "finished" }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn secs(n: u64) -> Duration {
        Duration::from_secs(n)
    }
    fn assistant(content: Value, stop: Value) -> Value {
        json!({"type": "assistant", "message": {"content": content, "stop_reason": stop}})
    }

    #[test]
    fn claude() {
        let tool_call = assistant(json!([{"type": "tool_use", "name": "Bash"}]), json!("tool_use"));
        let done = assistant(json!([{"type": "text", "text": "Done."}]), json!("end_turn"));
        let result = json!({"type": "user", "message": {"content": [{"type": "tool_result"}]}});
        let stopped = json!({"type": "user", "message": {"content": "[Request interrupted by user]"}});
        let noise = json!({"type": "file-history-snapshot"});
        // A tool call with no result: running it at first, then probably waiting for approval, then abandoned.
        assert_eq!(claude_state(&[tool_call.clone(), noise.clone()], secs(5)), "working");
        assert_eq!(claude_state(&[tool_call.clone()], secs(90)), "waiting");
        assert_eq!(claude_state(&[tool_call], secs(7 * 3600)), "finished");
        // A finished turn is finished however recent.
        assert_eq!(claude_state(&[done], secs(3)), "finished");
        // A tool result just written: the agent is continuing; long silent after one, it has stopped.
        assert_eq!(claude_state(&[result.clone()], secs(10)), "working");
        assert_eq!(claude_state(&[result], secs(600)), "finished");
        assert_eq!(claude_state(&[stopped], secs(1)), "finished");
        assert_eq!(claude_state(&[], secs(1)), "finished");
    }

    #[test]
    fn codex() {
        let ev = |t: &str| json!({"type": "event_msg", "payload": {"type": t}});
        assert_eq!(codex_state(&[ev("task_started"), ev("task_complete")], secs(5)), "finished");
        assert_eq!(codex_state(&[ev("exec_approval_request")], secs(300)), "waiting");
        assert_eq!(codex_state(&[ev("task_started"), ev("token_count")], secs(30)), "working");
        assert_eq!(codex_state(&[ev("task_started")], secs(900)), "finished");
    }
}
