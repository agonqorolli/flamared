//! Everything one screen load needs for a repo: changes grouped by logic, every agent edit that led to them,
//! and the repo map.
use super::git::{git, git_or_empty};
use super::group::{diff_by_file, group, read_text, Group, TEST_RE};
use super::paths::{basename, dirname, home, join, realpath, relpath, root_of, take};
use super::sessions::{self, Event, Hunk};
use super::tree::At;
use chrono::{DateTime, FixedOffset};
use indexmap::IndexMap;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::LazyLock;

const MAX_DIFF_LINES: usize = 400;
const MAX_SAY: usize = 400;

fn ts(s: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(s.trim()).ok()
}

/// Same test git uses: a NUL byte in the first 8 KB.
fn is_binary(top: &str, path: &str) -> bool {
    use std::io::Read;
    let mut buf = [0u8; 8000];
    std::fs::File::open(join(top, path)).and_then(|mut f| f.read(&mut buf)).map(|n| buf[..n].contains(&0)).unwrap_or(false)
}

/// This checkout plus every worktree of the same repo (Claude Code often works in worktrees).
pub fn repo_roots(top: &str) -> Vec<String> {
    let mut roots = vec![top.to_string()];
    for line in git_or_empty(top, &["worktree", "list", "--porcelain"]).lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            let p = realpath(p.trim());
            if !roots.contains(&p) {
                roots.push(p);
            }
        }
    }
    roots
}

/// Is an edit still in the current file? Compares its added (or removed) lines with the file as it is now.
/// kept: all its lines are there · partly · gone: rewritten later · undone: removed lines came back.
fn survival(hunks: &[Hunk], text: Option<&String>) -> Option<&'static str> {
    if hunks.is_empty() { return None; }
    let Some(text) = text else { return Some("gone") };
    let now: HashSet<&str> = text.lines().map(str::trim).collect();
    let sig = |sign: char| -> Vec<&str> {
        hunks.iter().flat_map(|h| &h.lines).filter(|l| l.starts_with(sign)).map(|l| l[1..].trim()).filter(|l| l.chars().count() > 3).collect()
    }; // skip trivial lines like "});"
    let (added, removed) = (sig('+'), sig('-'));
    if !added.is_empty() {
        let n = added.iter().filter(|l| now.contains(*l)).count();
        return Some(if n == added.len() { "kept" } else if n == 0 { "gone" } else { "partly" });
    }
    if !removed.is_empty() {
        let back = removed.iter().filter(|l| now.contains(*l)).count();
        return Some(if back == 0 { "kept" } else if back == removed.len() { "undone" } else { "partly" });
    }
    None
}

// --- Rule flags read from the diff text (plain pattern matching, no AI)
static TEST_CASE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"\b(it|test)\s*\(\s*['"`]|^\s*def test_|^\s*async def test_"#).unwrap());
static TEST_SKIP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\.(skip|only)\s*\(|\b(xit|xdescribe|xtest)\s*\(|@pytest\.mark\.skip|@unittest\.skip").unwrap());
static SECRET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"AKIA[0-9A-Z]{16}",                                  // AWS access key
        r"|-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----",
        r"|\bsk-[A-Za-z0-9_-]{20,}",                          // OpenAI/Anthropic-style keys
        r"|\bgh[pousr]_[A-Za-z0-9]{30,}",                     // GitHub tokens
        r"|\bxox[baprs]-[A-Za-z0-9-]{10,}",                   // Slack tokens
        r#"|(?i:(api[_-]?key|secret|token|passw(or)?d)\s*[:=]\s*['"][^'"\s]{12,}['"])"#,
    ))
    .unwrap()
});
static DEBUG_ANY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\bdebugger\b|\bbreakpoint\(\)|pdb\.set_trace\(|\bTODO\b|\bFIXME\b").unwrap());
static DEBUG_LOG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\bconsole\.log\(").unwrap());
static CLI_DIRS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(^|/)(scripts|bin|tools|cli)/").unwrap());

/// Flags for one file from its full diff. Never returns the matched text itself (it could be a secret).
/// The window explains each rule in app/src/components/map/FlagRules.tsx; keep the two in step.
fn diff_flags(path: &str, diff: &[String]) -> Vec<String> {
    let added: Vec<&str> = diff.iter().filter(|l| l.starts_with('+')).map(|l| &l[1..]).collect();
    let removed: Vec<&str> = diff.iter().filter(|l| l.starts_with('-')).map(|l| &l[1..]).collect();
    let (mut flags, name) = (Vec::new(), basename(path));
    if TEST_RE.is_match(name) {
        let cases = |ls: &[&str]| ls.iter().filter(|l| TEST_CASE.is_match(l)).count() as i64;
        let lost = cases(&removed) - cases(&added);
        if lost > 0 {
            flags.push(format!("tests weakened (−{lost} case{})", if lost > 1 { "s" } else { "" }));
        }
        if added.iter().any(|l| TEST_SKIP.is_match(l)) {
            flags.push("tests skipped".into());
        }
    }
    let example = [".example", ".sample", ".template"].iter().any(|s| name.ends_with(s));
    if name == ".env" || (name.starts_with(".env.") && !example) {
        flags.push("possible secret (.env file)".into());
    } else if added.iter().any(|l| SECRET.is_match(l)) {
        flags.push("possible secret".into());
    }
    let mut debug = added.iter().filter(|l| DEBUG_ANY.is_match(l)).count();
    if !CLI_DIRS.is_match(path) {
        debug += added.iter().filter(|l| DEBUG_LOG.is_match(l)).count();
    }
    if debug > 0 {
        flags.push(format!("debug leftovers ({debug})"));
    }
    flags
}

/// Full diff of one file as lines (hunk headers and +/- lines), untracked files as all-added.
/// `tracked` is the whole change's `git diff -M`, split by file. Binary files have no text diff (empty; the page says so).
fn file_diff_lines(top: &str, path: &str, untracked: &HashSet<String>, tracked: &HashMap<String, Vec<String>>) -> Vec<String> {
    if untracked.contains(path) {
        if is_binary(top, path) {
            return vec![];
        }
        let Some(text) = read_text(top, path) else { return vec![] }; // untracked files only exist in the working folder
        let body: Vec<&str> = text.lines().collect();
        let mut out = vec![format!("@@ -0,0 +1,{} @@", body.len())];
        out.extend(body.iter().map(|l| format!("+{l}")));
        return out;
    }
    const META: &[&str] = &["diff --git", "index ", "--- ", "+++ ", "new file", "deleted file", "similarity", "rename ", "old mode", "new mode", "Binary files"];
    tracked.get(path).into_iter().flatten().filter(|l| !META.iter().any(|m| l.starts_with(m))).cloned().collect()
}

type Stamp = (std::time::SystemTime, u64);
static LINES: LazyLock<std::sync::Mutex<HashMap<String, (Stamp, u64)>>> = LazyLock::new(Default::default);

/// A file's line count for the map, remembered by size and modification time: a reload only reads the files that
/// changed since, which matters in repos with thousands of files.
fn line_count(top: &str, p: &str) -> u64 {
    use std::io::Read;
    let path = join(top, p);
    let stamp = std::fs::metadata(&path).ok().and_then(|m| Some((m.modified().ok()?, m.len())));
    if let (Some(st), Some((old, n))) = (stamp, LINES.lock().unwrap().get(&path)) {
        if *old == st {
            return *n;
        }
    }
    let mut data = Vec::new();
    let n = if std::fs::File::open(&path).and_then(|f| f.take(2_000_000).read_to_end(&mut data)).is_err() {
        0
    } else if data[..data.len().min(4096)].contains(&0) {
        10 // binary files get a small fixed size
    } else {
        (data.iter().filter(|b| **b == b'\n').count() as u64).max(1)
    };
    if let Some(st) = stamp {
        LINES.lock().unwrap().insert(path, (st, n));
    }
    n
}

const TEMP: &[&str] = &["/private/tmp/", "/private/var/folders/", "/tmp/"];

static REPO_OF: LazyLock<std::sync::Mutex<HashMap<String, Option<String>>>> = LazyLock::new(Default::default);

/// The main checkout of the git repo a folder is in (a worktree counts as its repo), or None. Remembered for the
/// app's lifetime: which repo a folder belongs to practically never changes.
fn repo_of(folder: &str) -> Option<String> {
    REPO_OF
        .lock()
        .unwrap()
        .entry(folder.to_string())
        .or_insert_with(|| {
            if !std::path::Path::new(folder).is_dir() {
                return None;
            }
            let common = git_or_empty(folder, &["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim().to_string();
            if common.is_empty() {
                return None;
            }
            Some(realpath(common.strip_suffix("/.git").unwrap_or(&common)))
        })
        .clone()
}

/// Repos coding agents have worked in on this machine, for the repo picker: sessions per repo and the last one.
pub fn known_repos(current: Option<&str>) -> Vec<Value> {
    let mut found: IndexMap<String, (u64, f64)> = IndexMap::new();
    for f in sessions::session_files() {
        // Every repo the session worked in, not just the first: a session can move to another folder mid-way.
        let mut tops: Vec<String> = sessions::cwds(&f).iter().filter_map(|c| repo_of(c)).collect();
        tops.sort();
        tops.dedup();
        let mtime = std::fs::metadata(&f).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0.0, |d| d.as_secs_f64());
        for top in tops {
            if TEMP.iter().any(|t| top.starts_with(t)) {
                continue; // throwaway repos in temp folders aren't projects
            }
            let e = found.entry(top).or_insert((0, 0.0));
            e.0 += 1;
            e.1 = e.1.max(mtime);
        }
    }
    if let Some(c) = current {
        found.entry(c.to_string()).or_insert((0, 0.0));
    }
    let mut rows: Vec<_> = found.into_iter().collect();
    rows.sort_by(|a, b| b.1 .1.total_cmp(&a.1 .1));
    let h = home();
    rows.into_iter()
        .map(|(t, (n, last))| {
            let last = (last > 0.0).then(|| DateTime::from_timestamp(last as i64, 0).map(|d| d.with_timezone(&chrono::Local).to_rfc3339())).flatten();
            json!({"name": basename(&t), "path": if !h.is_empty() && t.starts_with(&h) { t.replacen(&h, "~", 1) } else { t.clone() },
                   "full": t, "sessions": n, "last": last, "current": Some(t.as_str()) == current})
        })
        .collect()
}

/// Agent work on one branch: how many sessions edited there, which agents, and their latest edit.
#[derive(Default)]
struct BranchWork {
    sessions: u64,
    agents: std::collections::BTreeSet<&'static str>,
    last: Option<DateTime<FixedOffset>>,
}

/// Local branches, then remote ones with no local copy, for the branch picker (newest commit first).
fn branches(top: &str, current: &str, session_branches: &HashMap<String, BranchWork>) -> Vec<Value> {
    // name, date, remote, and the last commit's subject (last, since it can hold tabs).
    let mut rows: Vec<(String, String, bool, String)> = Vec::new();
    let fmt = "--format=%(refname)%09%(refname:short)%09%(committerdate:iso-strict)%09%(symref)%09%(subject)";
    for line in git_or_empty(top, &["for-each-ref", "--sort=-committerdate", fmt, "refs/heads", "refs/remotes"]).lines() {
        let f: Vec<&str> = line.splitn(5, '\t').collect();
        let [r, name, at, sym, subject] = f[..] else { continue };
        if !sym.is_empty() || (r.starts_with("refs/remotes/") && r.matches('/').count() < 3) {
            continue; // origin/HEAD and bare remote names
        }
        let remote = r.starts_with("refs/remotes/");
        let local_name = if remote { name.split_once('/').map_or(name, |x| x.1) } else { name };
        if remote && rows.iter().any(|(n, _, rem, _)| n == local_name && !rem) {
            continue;
        }
        rows.push((name.to_string(), at.to_string(), remote, subject.to_string()));
    }
    rows.sort_by_key(|r| r.2); // stable: keeps newest first inside each part
    // Branches checked out in other worktrees, read once (not once per branch: repos can have hundreds).
    let in_worktree: HashSet<String> = git_or_empty(top, &["worktree", "list", "--porcelain"])
        .lines()
        .filter_map(|l| l.strip_prefix("branch refs/heads/").map(String::from))
        .collect();
    rows.into_iter()
        .map(|(name, at, remote, subject)| {
            let local = if remote { name.split_once('/').map_or(name.as_str(), |x| x.1) } else { name.as_str() };
            let worktree = !remote && name != current && in_worktree.contains(&name);
            let work = session_branches.get(local);
            json!({"name": name, "at": at, "remote": remote, "current": name == current, "worktree": worktree,
                   "sessions": work.map_or(0, |w| w.sessions),
                   "agents": work.map_or(vec![], |w| w.agents.iter().copied().collect()),
                   "agent_at": work.and_then(|w| w.last).map(|t| t.to_rfc3339()),
                   "subject": subject})
        })
        .collect()
}

/// `at` is the working folder (the checked-out branch) or another branch's tip, read from git (see tree.rs).
pub fn build(top: &str, base: &str, at: &At) -> Result<Value, String> {
    let top = realpath(top);
    let top = top.as_str();
    let untracked: HashSet<String> = at.untracked(top).into_iter().collect();
    let r = group(top, base, at)?;
    let mut stats = r.stats.clone();
    // Everything that could be committed is shown: every changed, deleted and untracked (not ignored) file, any type.
    let keep = &r.files;
    for p in &untracked {
        if !stats.contains_key(p) {
            let n = if at.is_binary(top, p) { 0 } else { at.read(top, p).map_or(0, |t| t.lines().count() as u64) };
            stats.insert(p.clone(), (n, 0));
        }
    }
    let binary: HashSet<&String> = keep.keys().filter(|p| at.is_binary(top, p)).collect();
    let stat = |p: &str| stats.get(p).copied().unwrap_or((0, 0));

    // Import links between changed files ("Connected files" in Changes).
    let imported_by = &r.importers;
    let mut imports: HashMap<&String, Vec<&String>> = HashMap::new();
    for (t, ps) in imported_by {
        for p in ps {
            imports.entry(p).or_default().push(t);
        }
    }

    let base_time = ts(&git_or_empty(top, &["show", "-s", "--format=%cI", base]));
    let checked_out = git_or_empty(top, &["branch", "--show-current"]).trim().to_string(); // empty when detached
    // The branch being shown: the checked-out one, or the one picked to view. Agent edits are matched against it.
    let branch = match at {
        At::Work => checked_out.clone(),
        At::Commit(rev) => rev.clone(),
    };
    let roots = repo_roots(top);

    // --- sessions -> timeline + the agent's words per file
    // A turn belongs to this branch when it ran in this repo (or one of its worktrees), on the checked-out
    // branch, after the branch point, and its edits touch files still in the diff.
    let mut words: HashMap<String, (String, String, String)> = HashMap::new(); // rel path -> (time, text, agent)
    let mut sessions_out = Vec::new();
    let mut skipped: IndexMap<&str, u64> = IndexMap::new();
    let mut session_branches: HashMap<String, BranchWork> = HashMap::new(); // agent work on each branch, for the picker
    let mut current: HashMap<(String, String), Option<String>> = HashMap::new(); // (root, rel) -> file text now
    let session_files: Vec<String> =
        sessions::session_files().into_iter().filter(|f| sessions::cwds(f).iter().any(|c| root_of(&realpath(c), &roots).is_some())).collect();
    for f in &session_files {
        let s = sessions::parse(f);
        // Each branch this session edited on, with its latest edit there.
        let mut edited_on: HashMap<&str, Option<DateTime<FixedOffset>>> = HashMap::new();
        for e in s.turns.iter().flat_map(|t| &t.edits) {
            let Some(b) = e.branch.as_deref().filter(|b| !b.is_empty() && *b != "HEAD") else { continue };
            let at = e.at.as_deref().and_then(ts);
            let latest = edited_on.entry(b).or_default();
            *latest = (*latest).max(at);
        }
        for (b, at) in edited_on {
            let w = session_branches.entry(b.to_string()).or_default();
            w.sessions += 1;
            w.agents.insert(s.agent);
            w.last = w.last.max(at);
        }
        // A short id per session: Claude Code names files by a UUID; Codex names them "rollout-<time>-<uuid>.jsonl",
        // so its unique part is at the end.
        let stem = basename(f).trim_end_matches(".jsonl");
        let sid = if sessions::is_codex(f) { stem.chars().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect() } else { take(stem, 8) };
        let mut turns = Vec::new();
        for (ti, tn) in s.turns.iter().enumerate() {
            if root_of(&realpath(tn.cwd.as_deref().unwrap_or("/")), &roots).is_none() {
                *skipped.entry("other folder").or_default() += 1;
                continue;
            }
            if let (Some(bt), Some(at)) = (base_time, tn.at.as_deref().and_then(ts)) {
                if at < bt {
                    *skipped.entry("before the branch point").or_default() += 1;
                    continue;
                }
            }
            // The branch is checked per edit: a turn can start on one branch and check out another mid-way.
            let (mut events, mut said): (Vec<Value>, Vec<(String, String, String)>) = (vec![], vec![]);
            let (mut last_say, mut last_run, mut off_branch, mut step) = (None::<String>, None::<usize>, 0, 0);
            for ev in &tn.events {
                match ev {
                    Event::Say(t) => {
                        let t = take(t, MAX_SAY);
                        last_run = None;
                        step += 1; // a "step" is the run of edits between two agent messages
                        events.push(json!({"k": "say", "t": t}));
                        last_say = Some(t);
                    }
                    Event::Edit(i) => {
                        let e = &tn.edits[*i];
                        // "HEAD" means no branch was checked out at the time: unknown, so time and files decide.
                        if !branch.is_empty() && e.branch.as_deref().is_some_and(|b| !b.is_empty() && b != "HEAD" && b != branch) {
                            off_branch += 1;
                            continue;
                        }
                        let absf = realpath(e.file.as_deref().unwrap_or("/"));
                        let Some(root) = root_of(&absf, &roots) else { continue };
                        let rel = relpath(&absf, root);
                        // Shell evidence has no historical diff: only link targets still changed in git.
                        if e.inferred && !keep.contains_key(&rel) { continue; }
                        let mut via = Value::Null;
                        if e.tool == "Bash" || e.tool == "Codex shell" {
                            if let Some(lr) = last_run {
                                // The command that made this edit is shown on the edit, not as its own row.
                                events[lr]["absorbed"] = json!(true);
                                via = json!(take(events[lr]["cmd"].as_str().unwrap_or("").lines().next().unwrap_or(""), 120));
                            }
                        }
                        let text = current.entry((root.to_string(), rel.clone())).or_insert_with(|| match at {
                            At::Work => read_text(root, &rel),
                            At::Commit(_) => at.read(top, &rel), // the file as it is at the viewed branch's tip
                        }).clone();
                        events.push(json!({
                            "k": "edit", "path": rel, "add": e.add, "rem": e.rem, "at": e.at, "via": via, "agent": s.agent,
                            "step": format!("{sid}:{ti}:{step}"), "survives": survival(&e.hunks, text.as_ref()),
                            "tool": e.tool, "new": e.new_file, "del": e.deleted, "inferred": e.inferred,
                            "from": e.moved_from.as_deref().map(|m| relpath(&realpath(m), root)), "say": last_say,
                            "hunks": e.hunks.iter().take(6).map(|h| json!({"o": h.old_start, "n": h.new_start, "lines": h.lines.iter().take(120).collect::<Vec<_>>()})).collect::<Vec<_>>(),
                        }));
                        if let Some(say) = &last_say {
                            if keep.contains_key(&rel) {
                                said.push((rel, e.at.clone().unwrap_or_default(), say.clone()));
                            }
                        }
                    }
                    Event::Run(i) => {
                        let run = &tn.runs[*i];
                        last_run = Some(events.len());
                        events.push(json!({"k": "run", "cmd": take(&run.cmd, 200), "desc": run.desc, "test": run.is_test,
                                           "passed": run.passed, "failed": run.failed}));
                    }
                }
            }
            events.retain(|e| !e.get("absorbed").and_then(|a| a.as_bool()).unwrap_or(false));
            let edits: Vec<&Value> = events.iter().filter(|e| e["k"] == "edit").collect();
            if edits.is_empty() {
                *skipped.entry(if off_branch > 0 { "edits on another branch" } else { "no file edits" }).or_default() += 1;
                continue;
            }
            if !edits.iter().any(|e| keep.contains_key(e["path"].as_str().unwrap_or(""))) {
                *skipped.entry("edits no longer in the diff").or_default() += 1;
                continue;
            }
            for (rel, when, text) in said {
                if words.get(&rel).is_none_or(|prev| when >= prev.0) {
                    words.insert(rel, (when, text, s.agent.to_string()));
                }
            }
            turns.push(json!({"at": tn.at, "prompt": take(&tn.prompt, 600), "branch": tn.branch, "events": events}));
        }
        if !turns.is_empty() {
            sessions_out.push(json!({"id": sid, "title": s.title.clone().unwrap_or_else(|| "Untitled session".into()), "agent": s.agent, "turns": turns}));
        }
    }
    let mut agents: IndexMap<&str, u64> = IndexMap::new();
    for x in &sessions_out {
        *agents.entry(x["agent"].as_str().unwrap_or("")).or_default() += 1;
    }
    let base_short = git(top, &["rev-parse", "--short", base])?.trim().to_string();
    let link = json!({"branch": branch, "base": base_short, "worktrees": roots.len() - 1, "sessions_in_repo": session_files.len(),
                      "turns_kept": sessions_out.iter().map(|x| x["turns"].as_array().map_or(0, |t| t.len())).sum::<usize>(),
                      "skipped": skipped, "agents": agents});

    let commits: Vec<Value> = git_or_empty(top, &["log", "--format=%h%x09%cI%x09%s", &format!("{base}..{}", at.rev())])
        .lines()
        .filter_map(|l| {
            let mut it = l.splitn(3, '\t');
            Some(json!({"sha": it.next()?, "at": it.next()?, "subject": it.next()?}))
        })
        .collect();

    // --- story
    let finfo = |p: &String| -> Value {
        let (a, d) = stat(p);
        let w = words.get(p);
        let mut out: Vec<&String> = imports.get(p).into_iter().flatten().copied().filter(|x| keep.contains_key(*x)).collect();
        out.sort();
        let ins: Vec<&String> = imported_by.get(p).into_iter().flatten().filter(|x| keep.contains_key(*x)).collect();
        json!({"path": p, "status": keep.get(p).map_or("M", |s| s.as_str()), "add": a, "rem": d,
               "words": w.map(|w| &w.1), "words_agent": w.map(|w| &w.2), "words_at": w.map(|w| &w.0), "links_out": out, "links_in": ins, "binary": binary.contains(p)})
    };
    let latest_words = |paths: &[&String]| paths.iter().filter_map(|p| words.get(*p)).max().cloned();
    let item = |g: &Group| -> Value {
        let mut syms: Vec<(&String, &(char, String))> = g.symbols.iter().collect();
        syms.sort_by_key(|(_, (k, _))| "+~-".find(*k));
        let all: Vec<&String> = g.files.iter().chain(&g.tests).collect();
        let w = latest_words(&all);
        json!({"name": g.name, "files": g.files.iter().map(&finfo).collect::<Vec<_>>(), "tests": g.tests.iter().map(&finfo).collect::<Vec<_>>(),
               "symbols": syms.iter().take(12).map(|(n, (k, p))| json!([n, k.to_string(), basename(p)])).collect::<Vec<_>>(),
               "more": g.symbols.len().saturating_sub(12), "add": g.add, "rem": g.rem, "uses": g.uses, "used_by": g.used_by,
               "imports": g.imports, "words": w.as_ref().map(|w| &w.1), "words_agent": w.as_ref().map(|w| &w.2)})
    };
    let (mut logic, mut shared, mut wiring) = (vec![], vec![], vec![]);
    let mut loose: IndexMap<String, Vec<Value>> = IndexMap::new();
    for g in &r.groups {
        if g.shared {
            shared.push(item(g));
        } else if g.registry {
            wiring.push(item(g));
        } else if g.files.len() > 1 {
            logic.push(item(g));
        } else {
            let d = dirname(&g.files[0]);
            loose.entry(if d.is_empty() { ".".into() } else { d.to_string() }).or_default().push(item(g));
        }
    }
    let mut loose: Vec<(String, Vec<Value>)> = loose.into_iter().collect();
    loose.sort_by(|a, b| b.1.len().cmp(&a.1.len())); // stable: ties keep group order
    let support: Vec<Value> = r
        .support
        .iter()
        .map(|(k, ps)| json!({"kind": k, "files": ps.iter().filter(|p| keep.contains_key(*p)).map(&finfo).collect::<Vec<_>>()}))
        .filter(|s| s["files"].as_array().is_some_and(|f| !f.is_empty()))
        .collect();
    let mut whole_args = vec!["diff", "-M"];
    whole_args.extend(at.diff_args(base));
    let whole = diff_by_file(top, &whole_args);
    let diff_lines: HashMap<&String, Vec<String>> = keep.keys().map(|p| (p, file_diff_lines(top, p, &untracked, &whole))).collect();
    let diffs: Map<String, Value> = keep
        .keys()
        .map(|p| {
            let mut lines = diff_lines[p].clone();
            if lines.len() > MAX_DIFF_LINES {
                let more = lines.len() - MAX_DIFF_LINES;
                lines.truncate(MAX_DIFF_LINES);
                lines.push(format!("… {more} more lines"));
            }
            (p.clone(), json!(lines.join("\n")))
        })
        .collect();

    // --- map: every file in the repo, sized by length, so the layout follows the folder tree (stable day to day)
    let mut map_files: BTreeMap<String, u64> = at.files_sized(top, |p| line_count(top, p)).into_iter().collect();
    for (p, st) in keep {
        // untracked and deleted files are part of the change too
        map_files.entry(p.clone()).or_insert_with(|| if st != "D" { line_count(top, p) } else { stat(p).1.max(1) });
    }
    // Rule flags, the same fixed rules as elsewhere (no guessing).
    let mut flags: HashMap<&String, Vec<String>> = HashMap::new();
    for (p, st) in keep {
        let f = flags.entry(p).or_default();
        if st == "D" && TEST_RE.is_match(basename(p)) {
            f.push("test deleted".into());
        }
    }
    for (kind, ps) in &r.support {
        for p in ps {
            if let Some(f) = flags.get_mut(p) {
                if kind == "deps" || kind == "infra" {
                    f.push(if kind == "deps" { "dependency file" } else { "infra file" }.into());
                }
            }
        }
    }
    for g in &r.groups {
        if g.files.len() == 1 && !g.shared && !g.registry && g.uses.is_empty() {
            if let Some(f) = flags.get_mut(&g.files[0]) {
                f.push("not connected".into());
            }
        }
    }
    for p in keep.keys() {
        let extra = diff_flags(p, &diff_lines[p]); // rules that read the diff itself
        flags.get_mut(p).unwrap().extend(extra);
    }
    let group_of: BTreeMap<&String, &String> = r.groups.iter().flat_map(|g| g.files.iter().chain(&g.tests).map(move |p| (p, &g.name))).collect();

    let head = git_or_empty(top, &["rev-parse", "--short", at.rev()]).trim().to_string();
    let (add, rem) = keep.keys().fold((0, 0), |(a, d), p| (a + stat(p).0, d + stat(p).1));
    Ok(json!({
        "repo": basename(top), "path": top, "branch": if branch.is_empty() { head.clone() } else { branch.clone() },
        "base": base_short, "base_label": base, "head": head,
        "generated": chrono::Local::now().format("%Y-%m-%d %H:%M").to_string(),
        "repos": known_repos(Some(top)), "branches": branches(top, &checked_out, &session_branches),
        "viewing": {"branch": if branch.is_empty() { head.clone() } else { branch.clone() }, "checked_out": matches!(at, At::Work)},
        "stats": {"files": keep.len(), "add": add, "rem": rem},
        "story": {"logic": logic, "shared": shared, "wiring": wiring,
                  "loose": loose.into_iter().map(|(k, v)| json!({"folder": k, "files": v})).collect::<Vec<_>>(),
                  "support": support, "loose_tests": r.loose_tests.iter().map(&finfo).collect::<Vec<_>>()},
        "diffs": diffs,
        "timeline": {"sessions": sessions_out, "commits": commits, "link": link},
        "map": {"files": map_files.into_iter().map(|(p, n)| json!([p, n])).collect::<Vec<_>>(),
                "flags": flags.into_iter().filter(|(_, f)| !f.is_empty()).collect::<BTreeMap<_, _>>(), "groups": group_of},
    }))
}

/// The branch a repo's work usually merges into: origin's default (origin/HEAD), else main or master if it exists.
fn default_branch(top: &str) -> Option<String> {
    let head = git_or_empty(top, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).trim().to_string();
    if let Some(name) = head.strip_prefix("origin/") {
        if !git_or_empty(top, &["rev-parse", "--verify", "--quiet", name]).trim().is_empty() {
            return Some(name.to_string());
        }
        return Some(head);
    }
    ["main", "master"].iter().find(|b| !git_or_empty(top, &["rev-parse", "--verify", "--quiet", b]).trim().is_empty()).map(|b| b.to_string())
}

/// The worktree folder where a branch is checked out, if any (Claude Code often works in worktrees).
fn worktree_of(top: &str, branch: &str) -> Option<String> {
    let mut path = None;
    for line in git_or_empty(top, &["worktree", "list", "--porcelain"]).lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            path = Some(p.trim().to_string());
        } else if line.strip_prefix("branch refs/heads/") == Some(branch) {
            return path;
        }
    }
    None
}

/// Everything a screen load needs for `repo`, showing `branch` (None: the checked-out one). Viewing is read-only:
/// a branch checked out in a worktree is read from that folder (with its uncommitted changes); any other branch
/// shows its commits since it split off from the default branch, read from git without touching the checkout.
pub fn view(repo: &str, branch: Option<&str>) -> Result<Value, String> {
    let top = realpath(git(repo, &["rev-parse", "--show-toplevel"])?.trim());
    let checked_out = git_or_empty(&top, &["branch", "--show-current"]).trim().to_string();
    let Some(branch) = branch.filter(|b| *b != checked_out) else { return build(&top, "HEAD", &At::Work) };
    if let Some(folder) = worktree_of(&top, branch) {
        return build(&folder, "HEAD", &At::Work);
    }
    let (_, base) = split_off(&top, branch, default_branch(&top).as_deref())?;
    build(&top, &base, &At::Commit(branch.to_string()))
}

/// A branch's tip and where it split off: from the default branch; for the default branch itself (or one already
/// merged into it), from the checked-out branch instead.
fn split_off(top: &str, branch: &str, default: Option<&str>) -> Result<(String, String), String> {
    let tip = git(top, &["rev-parse", branch])?.trim().to_string();
    let split = |other: &str| git_or_empty(top, &["merge-base", other, branch]).trim().to_string();
    let mut base = default.map(split).unwrap_or_default();
    if base.is_empty() || base == tip {
        base = split("HEAD");
    }
    if base.is_empty() {
        base = tip.clone();
    }
    Ok((tip, base))
}

/// For the repo picker, run when it opens: a repo's checked-out branch and its uncommitted files (as `git status`
/// lists them, ignored files left out).
pub fn repo_status(top: &str) -> Value {
    let branch = git_or_empty(top, &["branch", "--show-current"]).trim().to_string();
    let out = git_or_empty(top, &["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    let mut changed = Vec::new();
    let mut entries = out.split('\0');
    while let Some(e) = entries.next() {
        if e.len() < 4 {
            continue;
        }
        if e[..2].contains(['R', 'C']) {
            entries.next(); // a rename or copy is followed by its old path
        }
        changed.push(e[3..].to_string());
    }
    json!({"full": top, "branch": branch, "changed": changed})
}

/// For the branch picker, run when it opens: how many files each branch changed, as viewing it would show them
/// (a worktree's uncommitted files; otherwise the files changed since it split off). The checked-out branch is left
/// out (the window knows its files), and so is anything past the first 50 branches.
pub fn branch_files(repo: &str) -> Result<Map<String, Value>, String> {
    let top = realpath(git(repo, &["rev-parse", "--show-toplevel"])?.trim());
    let checked_out = git_or_empty(&top, &["branch", "--show-current"]).trim().to_string();
    let default = default_branch(&top);
    let mut out = Map::new();
    let refs = git_or_empty(&top, &["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)%09%(symref)", "refs/heads", "refs/remotes"]);
    // Like the branch list: pointers such as origin/HEAD (a symref) aren't branches.
    let names = refs.lines().filter_map(|l| l.split_once('\t')).filter(|(n, sym)| sym.is_empty() && *n != checked_out).map(|(n, _)| n);
    for name in names.take(50) {
        let n = if let Some(folder) = worktree_of(&top, name) {
            repo_status(&folder)["changed"].as_array().map_or(0, |a| a.len())
        } else {
            let (tip, base) = split_off(&top, name, default.as_deref())?;
            if tip == base { 0 } else { git_or_empty(&top, &["diff", "--name-only", &base, &tip]).lines().count() }
        };
        out.insert(name.to_string(), json!(n));
    }
    Ok(out)
}
