//! Live updates: watch the open repo and the agents' session folders, and tell the window when something that
//! matters changed. Bursts are collected for a moment first, so an agent saving 20 files means one reload.
//! Watching only reads change notifications (FSEvents on macOS); nothing is written anywhere.
use crate::data::git::{repo_roots, toplevel};
use crate::data::paths::{realpath, root_of};
use crate::data::sessions;
use notify::RecursiveMode;
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const QUIET: Duration = Duration::from_millis(700);

/// The one active watcher; opening another repo replaces it.
#[derive(Default)]
pub struct Watching(Mutex<Option<Debouncer<notify::RecommendedWatcher>>>);

/// Inside a repo's .git folder only these mean the change itself moved: a commit, a branch switch, a reset.
/// The index (staging), logs and objects don't change what the app shows.
fn git_meta_matters(rel: &str) -> bool {
    let rel = rel.strip_prefix(".git/").unwrap_or(rel);
    let rel = rel
        .split_once("worktrees/")
        .map_or(rel, |(_, r)| r.split_once('/').map_or(r, |x| x.1));
    !rel.ends_with(".lock") && (rel == "HEAD" || rel == "packed-refs" || rel.starts_with("refs/"))
}

/// Does this batch of changed paths affect what the window shows for the repo at `roots`?
fn matters(paths: &[String], roots: &[String], session_dirs: &[String]) -> bool {
    let mut work: Vec<(&str, String)> = Vec::new(); // (root, path relative to it) for files in the working tree
    for p in paths {
        if session_dirs.iter().any(|d| p.starts_with(d.as_str())) {
            // A session counts only if it worked in this repo (or one of its worktrees).
            if p.ends_with(".jsonl") && sessions::cwds(p).iter().any(|c| root_of(&realpath(c), roots).is_some()) {
                return true;
            }
            continue;
        }
        let Some(root) = root_of(p, roots) else { continue };
        let rel = p[root.len()..].trim_start_matches('/');
        if rel == ".git" || rel.starts_with(".git/") {
            if git_meta_matters(rel) {
                return true;
            }
            continue;
        }
        work.push((root, rel.to_string()));
    }
    // Files git ignores (node_modules, build output...) never show up in the change, so they don't count.
    for root in roots {
        let rels: Vec<&str> = work
            .iter()
            .filter(|(r, _)| r == root)
            .map(|(_, p)| p.as_str())
            .collect();
        if rels.is_empty() {
            continue;
        }
        let ignored = check_ignore(root, &rels);
        if rels.iter().any(|p| !ignored.contains(&p.to_string())) {
            return true;
        }
    }
    false
}

/// The paths among `rels` that git ignores in the repo at `root`.
fn check_ignore(root: &str, rels: &[&str]) -> Vec<String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let Ok(mut child) = Command::new("git")
        .args(["-C", root, "check-ignore", "--stdin", "-z"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return vec![];
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(rels.join("\0").as_bytes());
    }
    child
        .wait_with_output()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .split('\0')
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

/// Watch `repo` (and its worktrees) plus `session_dirs`, calling `on_change` after each burst of changes that
/// matters. Dropping the returned watcher stops it.
pub fn start(
    repo: &str,
    session_dirs: Vec<String>,
    on_change: impl Fn() + Send + 'static,
) -> Result<Debouncer<notify::RecommendedWatcher>, String> {
    let top = toplevel(repo).map_err(|_| format!("{repo} is not a git repository"))?;
    let roots = repo_roots(&top);
    let session_dirs: Vec<String> = session_dirs
        .into_iter()
        .filter(|d| Path::new(d).is_dir())
        .map(|d| realpath(&d))
        .collect();
    let (r, s) = (roots.clone(), session_dirs.clone());
    let mut debouncer = new_debouncer(QUIET, move |res: DebounceEventResult| {
        let Ok(events) = res else { return };
        let paths: Vec<String> = events.iter().map(|e| e.path.to_string_lossy().into_owned()).collect();
        if matters(&paths, &r, &s) {
            on_change();
        }
    })
    .map_err(|e| e.to_string())?;
    for dir in roots.iter().chain(&session_dirs) {
        debouncer
            .watcher()
            .watch(Path::new(dir), RecursiveMode::Recursive)
            .map_err(|e| format!("can't watch {dir}: {e}"))?;
    }
    Ok(debouncer)
}

/// Start watching `repo` (replacing any earlier watch). The window gets a "repo-changed" event after each burst
/// of changes that matters.
#[tauri::command]
pub fn watch(app: AppHandle, state: tauri::State<'_, Watching>, repo: String) -> Result<(), String> {
    let top = toplevel(&repo).unwrap_or_default();
    let debouncer = start(&repo, sessions::session_dirs(), move || {
        let _ = app.emit("repo-changed", &top);
    })?;
    *state.0.lock().unwrap() = Some(debouncer);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn git_meta() {
        assert!(git_meta_matters(".git/HEAD"));
        assert!(git_meta_matters(".git/refs/heads/main"));
        assert!(git_meta_matters(".git/worktrees/feature/HEAD"));
        assert!(!git_meta_matters(".git/index"));
        assert!(!git_meta_matters(".git/refs/heads/main.lock"));
        assert!(!git_meta_matters(".git/objects/ab/cdef"));
        assert!(!git_meta_matters(".git/logs/HEAD"));
    }
}
