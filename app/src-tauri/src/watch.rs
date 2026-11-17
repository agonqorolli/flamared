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

/// How long changes are collected before the window is told, so that a burst means one reload.
const QUIET: Duration = Duration::from_millis(700);

/// The one active watcher; opening another repo replaces it.
#[derive(Default)]
pub struct Watching(Mutex<Option<Debouncer<notify::RecommendedWatcher>>>);

/// Inside a repo's .git folder only these mean the change itself moved: a commit, a branch switch, a reset.
/// The index (staging), logs and objects don't change what the app shows.
fn git_meta_matters(path: &str) -> bool {
    let path = path.strip_prefix(".git/").unwrap_or(path);
    // A worktree keeps its own HEAD and refs under .git/worktrees/<name>/.
    let path = path.split_once("worktrees/").map_or(path, |(_, in_worktrees)| {
        in_worktrees.split_once('/').map_or(in_worktrees, |(_name, rest)| rest)
    });
    !path.ends_with(".lock") && (path == "HEAD" || path == "packed-refs" || path.starts_with("refs/"))
}

/// Does this batch of changed paths affect what the window shows for the repo at `roots`?
fn matters(paths: &[String], roots: &[String], session_dirs: &[String]) -> bool {
    // (root, path relative to it) for the changed files in a working folder; git is asked about these last.
    let mut working_files: Vec<(&str, &str)> = Vec::new();
    for path in paths {
        if session_dirs.iter().any(|dir| path.starts_with(dir.as_str())) {
            // A session counts only if it worked in this repo (or one of its worktrees).
            let worked_here = || {
                sessions::cwds(path)
                    .iter()
                    .any(|cwd| root_of(&realpath(cwd), roots).is_some())
            };
            if path.ends_with(".jsonl") && worked_here() {
                return true;
            }
            continue;
        }
        let Some(root) = root_of(path, roots) else { continue };
        let relative = path[root.len()..].trim_start_matches('/');
        if relative == ".git" || relative.starts_with(".git/") {
            if git_meta_matters(relative) {
                return true;
            }
            continue;
        }
        working_files.push((root, relative));
    }
    // Files git ignores (node_modules, build output...) never show up in the change, so they don't count.
    roots.iter().any(|root| {
        let in_root = working_files.iter().filter(|(of, _)| *of == root.as_str());
        let changed: Vec<&str> = in_root.map(|(_, relative)| *relative).collect();
        if changed.is_empty() {
            return false;
        }
        let ignored = ignored_by_git(root, &changed);
        changed
            .iter()
            .any(|path| !ignored.iter().any(|ignored| ignored == path))
    })
}

/// The paths among `paths` (relative to `root`) that git ignores in the repo at `root`.
fn ignored_by_git(root: &str, paths: &[&str]) -> Vec<String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let check = Command::new("git")
        .args(["-C", root, "check-ignore", "--stdin", "-z"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let Ok(mut check) = check else {
        return vec![];
    };
    if let Some(mut stdin) = check.stdin.take() {
        let _ = stdin.write_all(paths.join("\0").as_bytes());
    }
    let Ok(output) = check.wait_with_output() else {
        return vec![];
    };
    let ignored = String::from_utf8_lossy(&output.stdout);
    ignored
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(String::from)
        .collect()
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
    let existing = session_dirs.into_iter().filter(|dir| Path::new(dir).is_dir());
    let session_dirs: Vec<String> = existing.map(|dir| realpath(&dir)).collect();
    let (watched_roots, watched_sessions) = (roots.clone(), session_dirs.clone());
    let mut debouncer = new_debouncer(QUIET, move |burst: DebounceEventResult| {
        let Ok(events) = burst else { return };
        let paths: Vec<String> = events
            .iter()
            .map(|event| event.path.to_string_lossy().into_owned())
            .collect();
        if matters(&paths, &watched_roots, &watched_sessions) {
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
