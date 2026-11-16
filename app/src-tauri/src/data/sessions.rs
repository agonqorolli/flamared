//! Agent session adapters: one parser per agent, all returning the same `Session` shape.
//! Claude Code: ~/.claude/projects/<dir>/<session>.jsonl
//! Codex: ~/.codex/sessions/**/rollout-*.jsonl
//! Reads only; never writes to either folder.
use super::paths::{home, join, take};
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};

static TEST_CMD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(pytest|jest|vitest|mocha|go test|cargo test|npm (run )?test|pnpm test|yarn test|rspec|phpunit)\b").unwrap()
});
static PASS_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)(\d+)\s+(passed|passing)").unwrap());
static FAIL_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)(\d+)\s+(failed|failing)").unwrap());
static HUNK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^@@ -(\d+)(?:,\d+)? \+(\d+)").unwrap());
pub static CWD_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#""cwd":"((?:[^"\\]|\\.)*)""#).unwrap());
const EDIT_TOOLS: &[&str] = &["Edit", "Write", "MultiEdit", "NotebookEdit"];

#[derive(Clone)]
pub struct Hunk {
    pub old_start: Option<i64>,
    pub new_start: Option<i64>,
    pub lines: Vec<String>,
}

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

pub struct Run {
    pub cmd: String,
    pub desc: Option<String>,
    pub is_test: bool,
    pub failed: bool,
    pub passed: Option<u64>,
    pub failed_tests: Option<u64>,
}

pub enum Event {
    Say(String),
    Edit(usize), // index into Turn::edits
    Run(usize),  // index into Turn::runs
}

pub struct Turn {
    pub prompt: String,
    pub at: Option<String>,
    pub branch: Option<String>,
    pub cwd: Option<String>,
    pub edits: Vec<Edit>,
    pub runs: Vec<Run>,
    pub events: Vec<Event>,
}

pub struct Session {
    pub agent: &'static str,
    pub title: Option<String>,
    pub turns: Vec<Turn>,
}

pub fn claude_dir() -> String {
    join(&home(), ".claude/projects")
}
pub fn codex_dir() -> String {
    join(&home(), ".codex")
}

/// Every session file of every agent on this machine.
pub fn session_files() -> Vec<String> {
    let mut out = Vec::new();
    for dir in std::fs::read_dir(claude_dir()).into_iter().flatten().flatten() {
        for f in std::fs::read_dir(dir.path()).into_iter().flatten().flatten() {
            let p = f.path();
            if p.is_file() && p.extension().is_some_and(|e| e == "jsonl") {
                out.push(p.to_string_lossy().into_owned());
            }
        }
    }
    fn walk(dir: &std::path::Path, out: &mut Vec<String>) {
        for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(&p, out);
            } else if p.extension().is_some_and(|e| e == "jsonl") {
                out.push(p.to_string_lossy().into_owned());
            }
        }
    }
    walk(std::path::Path::new(&join(&codex_dir(), "sessions")), &mut out);
    out
}

pub fn is_codex(path: &str) -> bool {
    path.starts_with(&join(&codex_dir(), "sessions"))
}

/// A session file's size and modification time: when neither changed, what was read from it last time still holds.
fn stamp(path: &str) -> Option<(std::time::SystemTime, u64)> {
    let m = std::fs::metadata(path).ok()?;
    Some((m.modified().ok()?, m.len()))
}

type Stamped<T> = HashMap<String, ((std::time::SystemTime, u64), Arc<T>)>;
static PARSED: LazyLock<Mutex<Stamped<Session>>> = LazyLock::new(Default::default);
static CWDS: LazyLock<Mutex<Stamped<Vec<String>>>> = LazyLock::new(Default::default);

/// Reads a session file through a cache keyed by its stamp, so a reload only re-reads the files agents wrote to.
fn cached<T>(cache: &Mutex<Stamped<T>>, path: &str, read: impl FnOnce() -> T) -> Arc<T> {
    let st = stamp(path);
    if let (Some(st), Some((old, v))) = (st, cache.lock().unwrap().get(path)) {
        if *old == st {
            return v.clone();
        }
    }
    let v = Arc::new(read());
    if let Some(st) = st {
        cache.lock().unwrap().insert(path.to_string(), (st, v.clone()));
    }
    v
}

/// Every folder a session file ran in (a session can move folders mid-way).
pub fn cwds(path: &str) -> Arc<Vec<String>> {
    cached(&CWDS, path, || read_cwds(path))
}

fn read_cwds(path: &str) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(path) else { return vec![] };
    let mut out: Vec<String> = Vec::new();
    for m in text.lines().filter_map(|l| CWD_RE.captures(l)) {
        if let Ok(s) = serde_json::from_str::<String>(&format!("\"{}\"", &m[1])) {
            if !out.contains(&s) {
                out.push(s);
            }
        }
    }
    out
}

fn load(path: &str) -> Vec<Value> {
    std::fs::read_to_string(path)
        .map(|t| t.lines().filter_map(|l| serde_json::from_str(l).ok()).collect())
        .unwrap_or_default()
}

pub fn parse(path: &str) -> Arc<Session> {
    cached(&PARSED, path, || if is_codex(path) { parse_codex(path) } else { parse_claude(path) })
}

fn s(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(|x| x.as_str()).map(String::from)
}

fn hunks_of(v: Option<&Value>) -> Vec<Hunk> {
    v.and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .map(|h| Hunk {
                    old_start: h.get("oldStart").and_then(|x| x.as_i64()),
                    new_start: h.get("newStart").and_then(|x| x.as_i64()),
                    lines: h.get("lines").and_then(|l| l.as_array()).map(|l| l.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn counts(hunks: &[Hunk]) -> (u64, u64) {
    hunks.iter().flat_map(|h| &h.lines).fold((0, 0), |(a, r), l| {
        if l.starts_with('+') { (a + 1, r) } else if l.starts_with('-') { (a, r + 1) } else { (a, r) }
    })
}

fn test_result(run: &mut Run, out: &str) {
    if run.is_test {
        run.passed = PASS_RE.captures(out).and_then(|m| m[1].parse().ok());
        run.failed_tests = FAIL_RE.captures(out).and_then(|m| m[1].parse().ok());
    }
}

/// The user's typed prompt, or None for tool results / meta records / harness wrappers.
fn prompt_text(rec: &Value) -> Option<String> {
    if s(rec, "type").as_deref() != Some("user") {
        return None;
    }
    for flag in ["isMeta", "isSidechain", "isCompactSummary"] {
        if rec.get(flag).and_then(|x| x.as_bool()).unwrap_or(false) {
            return None;
        }
    }
    let c = rec.get("message")?.get("content")?;
    let text = match c {
        Value::String(t) => t.clone(),
        Value::Array(blocks) => {
            if blocks.iter().any(|b| s(b, "type").as_deref() == Some("tool_result")) {
                return None;
            }
            blocks.iter().filter(|b| s(b, "type").as_deref() == Some("text")).filter_map(|b| s(b, "text")).collect::<Vec<_>>().join("\n")
        }
        _ => return None,
    };
    let text = text.trim();
    const WRAPPERS: &[&str] =
        &["<command-", "<local-command", "<task-notification", "<side-sessions-event", "<ci-monitor-event", "<system-reminder"];
    if text.is_empty() || WRAPPERS.iter().any(|w| text.starts_with(w)) {
        return None;
    }
    // Claude Code's automatic summary when a long session runs out of room; not typed by the user.
    if text.starts_with("This session is being continued from a previous conversation") {
        return None;
    }
    Some(text.to_string())
}

fn new_turn(prompt: String, at: Option<String>, branch: Option<String>, cwd: Option<String>) -> Turn {
    Turn { prompt, at, branch, cwd, edits: vec![], runs: vec![], events: vec![] }
}

fn parse_claude(path: &str) -> Session {
    parse_claude_records(&load(path))
}

fn parse_claude_records(recs: &[Value]) -> Session {
    let mut results: HashMap<String, (&Value, &Value)> = HashMap::new(); // tool_use_id -> (record, tool_result block)
    // Only the transcript's own user records: "api-request-blob" records repeat earlier tool results without their
    // toolUseResult, and would replace the real one (and with it the edit's diff).
    for r in recs.iter().filter(|r| s(r, "type").as_deref() == Some("user")) {
        if let Some(blocks) = r.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
            for b in blocks.iter().filter(|b| s(b, "type").as_deref() == Some("tool_result")) {
                if let Some(id) = s(b, "tool_use_id") {
                    results.insert(id, (r, b));
                }
            }
        }
    }
    let mut session = Session { agent: "Claude Code", title: None, turns: vec![] };
    for r in recs {
        if s(r, "type").as_deref() == Some("custom-title") {
            session.title = s(r, "customTitle");
        }
        if r.get("isSidechain").and_then(|x| x.as_bool()).unwrap_or(false) {
            continue;
        }
        if let Some(p) = prompt_text(r) {
            session.turns.push(new_turn(p, s(r, "timestamp"), s(r, "gitBranch"), s(r, "cwd")));
            continue;
        }
        let Some(turn) = session.turns.last_mut() else { continue };
        if s(r, "type").as_deref() != Some("assistant") {
            continue;
        }
        let blocks = r.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()).cloned().unwrap_or_default();
        for b in &blocks {
            match s(b, "type").as_deref() {
                Some("text") => {
                    let t = s(b, "text").unwrap_or_default();
                    if !t.trim().is_empty() {
                        turn.events.push(Event::Say(t.trim().to_string()));
                    }
                }
                Some("tool_use") => {
                    let name = s(b, "name").unwrap_or_default();
                    let empty = Value::Object(Default::default());
                    let inp = b.get("input").unwrap_or(&empty);
                    let (res_rec, res_block) = s(b, "id").and_then(|id| results.get(&id).copied()).unzip();
                    let tur = res_rec.and_then(|r| r.get("toolUseResult")).filter(|t| t.is_object());
                    let failed = res_block.and_then(|b| b.get("is_error")).and_then(|x| x.as_bool()).unwrap_or(false);
                    if EDIT_TOOLS.contains(&name.as_str()) {
                        let mut hunks = hunks_of(tur.and_then(|t| t.get("structuredPatch")));
                        let is_new = tur.and_then(|t| s(t, "type")).as_deref() == Some("create");
                        if is_new && hunks.is_empty() {
                            // Write creating a file records the content, not a patch
                            let body = tur.and_then(|t| s(t, "content")).filter(|c| !c.is_empty()).or_else(|| s(inp, "content")).unwrap_or_default();
                            if !body.is_empty() {
                                hunks = vec![Hunk { old_start: Some(0), new_start: Some(1), lines: body.lines().map(|l| format!("+{l}")).collect() }];
                            }
                        }
                        let (add, rem) = counts(&hunks);
                        turn.edits.push(Edit {
                            tool: name.clone(),
                            file: s(inp, "file_path").or_else(|| s(inp, "notebook_path")),
                            at: s(r, "timestamp"),
                            branch: s(r, "gitBranch"),
                            add,
                            rem,
                            new_file: is_new,
                            deleted: false,
                            moved_from: None,
                            hunks,
                            inferred: false,
                        });
                        turn.events.push(Event::Edit(turn.edits.len() - 1));
                    } else if name == "Bash" {
                        let cmd = s(inp, "command").unwrap_or_default();
                        let out = tur.map(|t| format!("{}{}", s(t, "stdout").unwrap_or_default(), s(t, "stderr").unwrap_or_default())).unwrap_or_default();
                        let mut run = Run { is_test: TEST_CMD.is_match(&cmd), cmd, desc: s(inp, "description"), failed, passed: None, failed_tests: None };
                        // Claude Code records diffs for files a shell command changed.
                        let files = tur.and_then(|t| t.get("bashEditDiff")).and_then(|d| d.get("files")).and_then(|f| f.as_array()).cloned().unwrap_or_default();
                        for fd in &files {
                            let hunks = hunks_of(fd.get("hunks"));
                            let (add, rem) = counts(&hunks);
                            turn.edits.push(Edit {
                                tool: "Bash".into(),
                                file: s(fd, "filePath"),
                                at: s(r, "timestamp"),
                                branch: s(r, "gitBranch"),
                                add,
                                rem,
                                new_file: false,
                                deleted: false,
                                moved_from: None,
                                hunks,
                                inferred: false,
                            });
                            turn.events.push(Event::Edit(turn.edits.len() - 1));
                        }
                        test_result(&mut run, &out);
                        turn.runs.push(run);
                        turn.events.push(Event::Run(turn.runs.len() - 1));
                    }
                }
                _ => {}
            }
        }
    }
    session
}

fn codex_titles() -> HashMap<String, String> {
    load(&join(&codex_dir(), "session_index.jsonl"))
        .iter()
        .filter_map(|r| Some((s(r, "id")?, s(r, "thread_name").filter(|t| !t.is_empty())?)))
        .collect()
}

fn text_of(content: Option<&Value>) -> String {
    content
        .and_then(|c| c.as_array())
        .map(|a| a.iter().filter_map(|c| s(c, "text")).collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// A unified diff string -> hunks.
fn hunks_from_unified(diff: &str) -> Vec<Hunk> {
    let mut hunks: Vec<Hunk> = Vec::new();
    for l in diff.lines() {
        if let Some(m) = HUNK.captures(l) {
            hunks.push(Hunk { old_start: m[1].parse().ok(), new_start: m[2].parse().ok(), lines: vec![] });
        } else if let Some(h) = hunks.last_mut() {
            if l.starts_with(['+', '-', ' ']) {
                h.lines.push(l.to_string());
            }
        }
    }
    hunks
}

fn parse_codex(path: &str) -> Session {
    let recs = load(path);
    let id = recs.iter().find(|r| s(r, "type").as_deref() == Some("session_meta")).and_then(|r| r.get("payload")).and_then(|p| s(p, "id"));
    let title = id.and_then(|id| codex_titles().remove(&id));
    parse_codex_records(&recs, title)
}

fn codex_cwd(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        if v.starts_with("file:") {
            tauri::Url::parse(&v).ok()?.to_file_path().ok().map(|p| p.to_string_lossy().into_owned())
        } else { Some(v) }
    })
}

/// Follow a successful, directly recorded branch switch. Never take branch-looking text in a
/// read command's output as evidence, and never assign a switch in another folder to this session.
fn switched_branch(cmd: &str, output: &str, exit: Option<i64>) -> Option<String> {
    static SWITCH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^git\s+(?:switch(?:\s+-[cC])?|checkout(?:\s+-[bB])?)\s+([^\s;&|]+)\s*$").unwrap());
    if exit != Some(0) { return None; }
    let m = SWITCH.captures(cmd.trim())?;
    let branch = m[1].trim_matches(['\'', '"']);
    if branch.starts_with('-') { return None; }
    output.lines().any(|l| l == format!("Switched to branch '{branch}'") || l == format!("Switched to a new branch '{branch}'"))
        .then(|| branch.to_string())
}

fn parse_codex_records(recs: &[Value], title: Option<String>) -> Session {
    let meta = recs.iter().find(|r| s(r, "type").as_deref() == Some("session_meta")).and_then(|r| r.get("payload")).cloned().unwrap_or_default();
    let mut branch = meta.get("git").and_then(|g| s(g, "branch"));
    let mut cwd = codex_cwd(s(&meta, "cwd"));
    let mut session = Session { agent: "Codex", title, turns: vec![] };
    for r in recs {
        let Some(p) = r.get("payload") else { continue };
        if s(r, "type").as_deref() == Some("turn_context") {
            let next = codex_cwd(s(p, "cwd")).or_else(|| cwd.clone());
            if next != cwd { branch = None; }
            if let Some(b) = p.get("git").and_then(|g| s(g, "branch")) { branch = Some(b); }
            cwd = next;
            continue;
        }
        if s(r, "type").as_deref() != Some("event_msg") || s(p, "type").as_deref() != Some("item_completed") {
            continue;
        }
        let Some(it) = p.get("item") else { continue };
        let at = s(r, "timestamp");
        match s(it, "type").as_deref() {
            Some("UserMessage") => {
                let prompt = text_of(it.get("content"));
                if !prompt.is_empty() {
                    session.turns.push(new_turn(prompt, at, branch.clone(), cwd.clone()));
                }
            }
            kind => {
                let Some(turn) = session.turns.last_mut() else { continue };
                match kind {
                    Some("AgentMessage") => {
                        let said = text_of(it.get("content"));
                        if !said.is_empty() {
                            turn.events.push(Event::Say(said));
                        }
                    }
                    Some("CommandExecution") => {
                        let cmd = match it.get("command") {
                            Some(Value::Array(a)) => a.last().and_then(|x| x.as_str()).unwrap_or("").to_string(), // ["/bin/zsh", "-lc", "<command>"]
                            Some(Value::String(c)) => c.clone(),
                            _ => String::new(),
                        };
                        let out = s(it, "aggregated_output").unwrap_or_default();
                        let exit = it.get("exit_code").and_then(|c| c.as_i64());
                        let command_cwd = codex_cwd(s(it, "cwd")).or_else(|| cwd.clone());
                        let same_folder = command_cwd.as_ref().zip(cwd.as_ref())
                            .is_some_and(|(c, root)| c == root || c.starts_with(&format!("{root}/")));
                        if same_folder {
                            if let Some(b) = switched_branch(&cmd, &out, exit) { branch = Some(b); }
                        }
                        let targets = super::codex_shell::written_paths(&cmd, &out, exit);
                        let failed = it.get("exit_code").is_some_and(|c| !c.is_null() && c.as_i64() != Some(0));
                        let mut run = Run { is_test: TEST_CMD.is_match(&cmd), cmd, desc: None, failed, passed: None, failed_tests: None };
                        test_result(&mut run, &out);
                        turn.runs.push(run);
                        turn.events.push(Event::Run(turn.runs.len() - 1));
                        if let Some(base) = command_cwd {
                            for path in targets {
                                turn.edits.push(Edit {
                                    tool: "Codex shell".into(), file: Some(join(&base, &path)), at: at.clone(),
                                    branch: if same_folder { branch.clone() } else { None },
                                    add: 0, rem: 0, new_file: false, deleted: false, moved_from: None,
                                    hunks: vec![], inferred: true,
                                });
                                turn.events.push(Event::Edit(turn.edits.len() - 1));
                            }
                        }
                    }
                    Some("FileChange") => {
                        let Some(changes) = it.get("changes").and_then(|c| c.as_object()) else { continue };
                        let base = cwd.clone().unwrap_or_default();
                        let abs = |p: &str| if p.starts_with('/') { p.to_string() } else { join(&base, p) };
                        for (fpath, c) in changes {
                            let absf = abs(fpath);
                            let moved = s(c, "move_path").map(|m| abs(&m));
                            let kind = s(c, "type");
                            let body = s(c, "content").unwrap_or_default();
                            let hunks = match kind.as_deref() {
                                Some("add") => vec![Hunk { old_start: Some(0), new_start: Some(1), lines: body.lines().map(|l| format!("+{l}")).collect() }],
                                Some("delete") => vec![Hunk { old_start: Some(1), new_start: Some(0), lines: body.lines().map(|l| format!("-{l}")).collect() }],
                                _ => hunks_from_unified(&s(c, "unified_diff").unwrap_or_default()),
                            };
                            let (add, rem) = counts(&hunks);
                            turn.edits.push(Edit {
                                tool: "Codex".into(),
                                file: Some(moved.clone().unwrap_or_else(|| absf.clone())),
                                at: at.clone(),
                                branch: branch.clone(),
                                add,
                                rem,
                                new_file: kind.as_deref() == Some("add"),
                                deleted: kind.as_deref() == Some("delete"),
                                moved_from: moved.map(|_| absf),
                                hunks,
                                inferred: false,
                            });
                            turn.events.push(Event::Edit(turn.edits.len() - 1));
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    if session.title.is_none() {
        session.title = session.turns.first().map(|t| take(t.prompt.lines().next().unwrap_or(""), 80));
    }
    session
}

#[cfg(test)]
mod codex_tests {
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
        item(json!({"type":"CommandExecution", "command":["/bin/zsh","-lc",cmd], "cwd":cwd, "aggregated_output":out, "exit_code":exit}))
    }
    fn write(cwd: &str) -> Value {
        command("python3 - <<'PY'\np='src/view.ts';s=open(p).read();open(p,'w').write(s)\nPY", cwd, "", Some(0))
    }

    #[test]
    fn shell_writes_follow_a_branch_switch_in_the_same_turn() {
        let mut records = start();
        records.push(write("file:///repo"));
        records.push(command("git switch -c feature", "file:///repo/app", "Switched to a new branch 'feature'\n", Some(0)));
        records.push(write("file:///repo"));
        let session = parse_codex_records(&records, None);
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
        records.push(command("git switch -c failed", "file:///repo", "fatal: failed", Some(1)));
        records.push(command("git switch other", "file:///elsewhere", "Switched to branch 'other'", Some(0)));
        records.push(command("cat log.txt", "file:///repo", "Switched to branch 'printed'", Some(0)));
        records.push(write("file:///repo"));
        assert_eq!(parse_codex_records(&records, None).turns[0].edits[0].branch.as_deref(), Some("old"));
    }

    #[test]
    fn file_changes_keep_their_diff_and_use_the_updated_branch() {
        let mut records = start();
        records.push(command("git checkout -b next", "file:///repo", "Switched to a new branch 'next'", Some(0)));
        records.push(item(json!({"type":"UserMessage", "content":[{"text":"Now edit"}]})));
        records.push(item(json!({"type":"FileChange", "changes":{"src/a.ts":{"type":"update", "unified_diff":"@@ -1 +1 @@\n-old\n+new\n"}}})));
        let session = parse_codex_records(&records, None);
        let edit = &session.turns[1].edits[0];
        assert_eq!(edit.branch.as_deref(), Some("next"));
        assert_eq!((edit.add, edit.rem), (1, 1));
        assert!(!edit.inferred);
    }

    #[test]
    fn command_working_directory_is_used_and_uri_paths_are_decoded() {
        let mut records = start();
        records.push(write("file:///repo/sub%20folder"));
        assert_eq!(parse_codex_records(&records, None).turns[0].edits[0].file.as_deref(), Some("/repo/sub folder/src/view.ts"));
    }
}

#[cfg(test)]
mod claude_tests {
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
        let session = parse_claude_records(&records);
        let turn = &session.turns[0];
        assert_eq!(session.turns.len(), 1);
        assert_eq!(turn.edits.len(), 1);
        assert_eq!(turn.edits[0].file.as_deref(), Some("/repo/a.ts"));
        assert_eq!((turn.edits[0].add, turn.edits[0].rem), (1, 1));
    }
}
