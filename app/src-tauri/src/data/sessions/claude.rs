//! Claude Code transcripts. The format is internal and changes between versions: every field is read as optional.
use super::{Edit, Event, Hunk, Run, Session, Turn, kind, records, str_field};
use serde_json::Value;
use std::collections::HashMap;

const EDIT_TOOLS: &[&str] = &["Edit", "Write", "MultiEdit", "NotebookEdit"];

/// Messages the harness sends in your name; they look like prompts but you didn't type them.
const HARNESS_MESSAGES: &[&str] = &[
    "<command-",
    "<local-command",
    "<task-notification",
    "<side-sessions-event",
    "<ci-monitor-event",
    "<system-reminder",
];

/// Each tool call's result, by the call's id: the record it came in and its `tool_result` block.
type ToolResults<'a> = HashMap<String, (&'a Value, &'a Value)>;

pub(super) fn parse(path: &str) -> Session {
    parse_records(&records(path))
}

fn parse_records(records: &[Value]) -> Session {
    let results = tool_results(records);
    let mut session = Session {
        agent: "Claude Code",
        title: None,
        turns: vec![],
    };
    for record in records {
        if kind(record) == Some("custom-title") {
            session.title = str_field(record, "customTitle");
        }
        if is_true(record, "isSidechain") {
            continue;
        }
        if let Some(prompt) = prompt_text(record) {
            let (at, branch, cwd) = (
                str_field(record, "timestamp"),
                str_field(record, "gitBranch"),
                str_field(record, "cwd"),
            );
            session.turns.push(Turn::new(prompt, at, branch, cwd));
            continue;
        }
        let Some(turn) = session.turns.last_mut() else {
            continue;
        };
        if kind(record) != Some("assistant") {
            continue;
        }
        for block in content_blocks(record) {
            match kind(block) {
                Some("text") => say(turn, block),
                Some("tool_use") => tool_use(turn, record, block, &results),
                _ => {}
            }
        }
    }
    session
}

fn is_true(record: &Value, flag: &str) -> bool {
    record.get(flag).and_then(Value::as_bool).unwrap_or(false)
}

/// A message's content blocks (text, tool calls, tool results); none when its content is plain text.
fn content_blocks(record: &Value) -> &[Value] {
    let content = record.get("message").and_then(|message| message.get("content"));
    content.and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default()
}

fn tool_results(records: &[Value]) -> ToolResults<'_> {
    let mut results = ToolResults::new();
    // Only the transcript's own user records: "api-request-blob" records repeat earlier tool results without their
    // toolUseResult, and would replace the real one (and with it the edit's diff).
    for record in records.iter().filter(|record| kind(record) == Some("user")) {
        for block in content_blocks(record)
            .iter()
            .filter(|block| kind(block) == Some("tool_result"))
        {
            if let Some(id) = str_field(block, "tool_use_id") {
                results.insert(id, (record, block));
            }
        }
    }
    results
}

/// The user's typed prompt, or None for tool results / meta records / harness wrappers.
fn prompt_text(record: &Value) -> Option<String> {
    if kind(record) != Some("user") {
        return None;
    }
    if ["isMeta", "isSidechain", "isCompactSummary"]
        .iter()
        .any(|flag| is_true(record, flag))
    {
        return None;
    }
    let text = match record.get("message")?.get("content")? {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => {
            if blocks.iter().any(|block| kind(block) == Some("tool_result")) {
                return None;
            }
            let texts = blocks.iter().filter(|block| kind(block) == Some("text"));
            texts
                .filter_map(|block| str_field(block, "text"))
                .collect::<Vec<_>>()
                .join("\n")
        }
        _ => return None,
    };
    let text = text.trim();
    if text.is_empty() || HARNESS_MESSAGES.iter().any(|start| text.starts_with(start)) {
        return None;
    }
    // Claude Code's automatic summary when a long session runs out of room; not typed by the user.
    if text.starts_with("This session is being continued from a previous conversation") {
        return None;
    }
    Some(text.to_string())
}

/// Something the agent wrote to you.
fn say(turn: &mut Turn, block: &Value) {
    let text = str_field(block, "text").unwrap_or_default();
    if !text.trim().is_empty() {
        turn.events.push(Event::Say(text.trim().to_string()));
    }
}

/// A tool call: an edit tool changes one file; a shell command is a run, plus an edit for each file it changed.
fn tool_use(turn: &mut Turn, record: &Value, block: &Value, results: &ToolResults) {
    let name = str_field(block, "name").unwrap_or_default();
    let no_input = Value::Object(Default::default());
    let input = block.get("input").unwrap_or(&no_input);
    let (result_record, result_block) = str_field(block, "id").and_then(|id| results.get(&id).copied()).unzip();
    // What the tool reported back, beyond the text the agent saw: the patch, the output, the files a command changed.
    let outcome = result_record
        .and_then(|record| record.get("toolUseResult"))
        .filter(|outcome| outcome.is_object());
    let (at, branch) = (str_field(record, "timestamp"), str_field(record, "gitBranch"));
    if EDIT_TOOLS.contains(&name.as_str()) {
        turn.add_edit(file_edit(&name, input, outcome, at, branch));
    } else if name == "Bash" {
        let failed = result_block
            .and_then(|block| block.get("is_error"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        shell_command(turn, input, outcome, failed, at, branch);
    }
}

fn file_edit(tool: &str, input: &Value, outcome: Option<&Value>, at: Option<String>, branch: Option<String>) -> Edit {
    let mut hunks = patch_hunks(outcome.and_then(|outcome| outcome.get("structuredPatch")));
    let new_file = outcome.and_then(|outcome| str_field(outcome, "type")).as_deref() == Some("create");
    if new_file && hunks.is_empty() {
        // Write creating a file records the content, not a patch
        let recorded = outcome
            .and_then(|outcome| str_field(outcome, "content"))
            .filter(|content| !content.is_empty());
        let content = recorded.or_else(|| str_field(input, "content")).unwrap_or_default();
        if !content.is_empty() {
            hunks = vec![Hunk::added(&content)];
        }
    }
    let file = str_field(input, "file_path").or_else(|| str_field(input, "notebook_path"));
    Edit {
        new_file,
        ..Edit::recorded(tool, file, at, branch, hunks)
    }
}

fn shell_command(
    turn: &mut Turn,
    input: &Value,
    outcome: Option<&Value>,
    failed: bool,
    at: Option<String>,
    branch: Option<String>,
) {
    let cmd = str_field(input, "command").unwrap_or_default();
    let output = outcome
        .map(|outcome| {
            let (stdout, stderr) = (str_field(outcome, "stdout"), str_field(outcome, "stderr"));
            format!("{}{}", stdout.unwrap_or_default(), stderr.unwrap_or_default())
        })
        .unwrap_or_default();
    // The command comes before the edits it made, so each edit is linked to it (the edit's `via`).
    turn.add_run(Run::new(
        cmd,
        str_field(input, "description"),
        at.clone(),
        failed,
        &output,
    ));
    // Claude Code records diffs for files a shell command changed.
    let changed = outcome
        .and_then(|outcome| outcome.get("bashEditDiff"))
        .and_then(|diff| diff.get("files"));
    for file_diff in changed.and_then(Value::as_array).into_iter().flatten() {
        let hunks = patch_hunks(file_diff.get("hunks"));
        turn.add_edit(Edit::recorded(
            "Bash",
            str_field(file_diff, "filePath"),
            at.clone(),
            branch.clone(),
            hunks,
        ));
    }
}

/// The hunks of a patch as Claude Code records one (`structuredPatch`, and each file of `bashEditDiff`).
fn patch_hunks(patch: Option<&Value>) -> Vec<Hunk> {
    let hunks = patch.and_then(Value::as_array).into_iter().flatten();
    hunks
        .map(|hunk| Hunk {
            old_start: hunk.get("oldStart").and_then(Value::as_i64),
            new_start: hunk.get("newStart").and_then(Value::as_i64),
            lines: hunk
                .get("lines")
                .and_then(Value::as_array)
                .map(|lines| {
                    lines
                        .iter()
                        .filter_map(|line| line.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shell_edits_keep_their_diff_when_a_request_blob_repeats_the_result() {
        let result = |extra: Value| {
            let mut r = json!({"type":"user", "message":{"role":"user", "content":[{"type":"tool_result", "tool_use_id":"t1", "content":"ok"}]}});
            r.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
            r
        };
        let diff = json!({"files":[{"filePath":"/repo/a.ts", "hunks":[{"oldStart":1, "newStart":1, "lines":["-old", "+new"]}]}]});
        let records = vec![
            json!({"type":"user", "timestamp":"2026-11-16T19:05:28Z", "cwd":"/repo", "message":{"role":"user", "content":"Redesign the list"}}),
            json!({"type":"assistant", "timestamp":"2026-11-16T19:05:56Z", "gitBranch":"main",
                   "message":{"content":[{"type":"tool_use", "id":"t1", "name":"Bash", "input":{"command":"sed -i '' s/old/new/ a.ts"}}]}}),
            result(json!({"toolUseResult":{"stdout":"", "stderr":"", "bashEditDiff":diff}})),
            result(json!({"type":"api-request-blob"})),
        ];
        let session = parse_records(&records);
        let turn = &session.turns[0];
        assert_eq!(session.turns.len(), 1);
        assert_eq!(turn.edits.len(), 1);
        assert_eq!(turn.edits[0].file.as_deref(), Some("/repo/a.ts"));
        assert_eq!((turn.edits[0].add, turn.edits[0].rem), (1, 1));
        // The command comes first, so the edit is linked to the command that made it.
        assert!(matches!(turn.events[..], [Event::Run(0), Event::Edit(0)]));
    }
}
