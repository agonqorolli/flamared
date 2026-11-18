//! The repo picker's data: the repos coding agents have worked in on this machine, and each one's uncommitted files.
use super::git::{current_branch, git_line, git_or_empty};
use super::paths::{basename, home, realpath, tilde};
use super::sessions;
use super::snapshot::model::{RepoRow, RepoStatus};
use chrono::DateTime;
use indexmap::IndexMap;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// Throwaway repos in temp folders aren't projects.
const TEMP_FOLDERS: &[&str] = &["/private/tmp/", "/private/var/folders/", "/tmp/"];

static REPO_OF: LazyLock<Mutex<HashMap<String, Option<String>>>> = LazyLock::new(Default::default);

/// The main checkout of the git repo a folder is in (a worktree counts as its repo), or None. Remembered for the
/// app's lifetime: which repo a folder belongs to practically never changes.
fn repo_of(folder: &str) -> Option<String> {
    let mut remembered = REPO_OF.lock().unwrap();
    remembered
        .entry(folder.to_string())
        .or_insert_with(|| find_repo(folder))
        .clone()
}

fn find_repo(folder: &str) -> Option<String> {
    if !std::path::Path::new(folder).is_dir() {
        return None;
    }
    // The .git folder all worktrees share sits in the main checkout.
    let common = git_line(folder, &["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if common.is_empty() {
        return None;
    }
    Some(realpath(common.strip_suffix("/.git").unwrap_or(&common)))
}

/// What the sessions say about one repo.
#[derive(Default)]
struct Seen {
    sessions: u64,
    /// When a session there was last written, in seconds since 1970; 0 when none was.
    last_written: f64,
}

/// Repos coding agents have worked in on this machine, for the repo picker: sessions per repo and the last one,
/// most recent first. `current` (the open repo) is listed even when no session worked in it.
pub fn known_repos(current: Option<&str>) -> Vec<RepoRow> {
    let mut found: IndexMap<String, Seen> = IndexMap::new();
    for file in sessions::session_files() {
        // Every repo the session worked in, not just the first: a session can move to another folder mid-way.
        let mut repos: Vec<String> = sessions::cwds(&file)
            .iter()
            .filter_map(|folder| repo_of(folder))
            .collect();
        repos.sort();
        repos.dedup();
        let written = written_at(&file);
        for repo in repos {
            if TEMP_FOLDERS.iter().any(|temp| repo.starts_with(temp)) {
                continue;
            }
            let seen = found.entry(repo).or_default();
            seen.sessions += 1;
            seen.last_written = seen.last_written.max(written);
        }
    }
    if let Some(current) = current {
        found.entry(current.to_string()).or_default();
    }
    let mut rows: Vec<(String, Seen)> = found.into_iter().collect();
    rows.sort_by(|a, b| b.1.last_written.total_cmp(&a.1.last_written));
    let home = home();
    rows.into_iter()
        .map(|(repo, seen)| RepoRow {
            name: basename(&repo).to_string(),
            path: tilde(&repo, &home),
            current: Some(repo.as_str()) == current,
            full: repo,
            sessions: seen.sessions,
            last: local_time(seen.last_written),
        })
        .collect()
}

/// When a file was last written, in seconds since 1970; 0 when that can't be read.
fn written_at(file: &str) -> f64 {
    let modified = std::fs::metadata(file).and_then(|meta| meta.modified()).ok();
    let since_1970 = modified.and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok());
    since_1970.map_or(0.0, |duration| duration.as_secs_f64())
}

fn local_time(seconds: f64) -> Option<String> {
    if seconds <= 0.0 {
        return None;
    }
    DateTime::from_timestamp(seconds as i64, 0).map(|time| time.with_timezone(&chrono::Local).to_rfc3339())
}

/// For the repo picker, run when it opens: a repo's checked-out branch and its uncommitted files (as `git status`
/// lists them, ignored files left out).
pub fn repo_status(top: &str) -> RepoStatus {
    let branch = current_branch(top);
    let status = git_or_empty(top, &["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    let mut changed = Vec::new();
    let mut entries = status.split('\0');
    // Each entry is two status letters, a space and the path.
    while let Some(entry) = entries.next() {
        if entry.len() < 4 {
            continue;
        }
        if entry[..2].contains(['R', 'C']) {
            entries.next(); // a rename or copy is followed by its old path
        }
        changed.push(entry[3..].to_string());
    }
    RepoStatus {
        full: top.to_string(),
        branch,
        changed,
    }
}

/// `repo_status` for several repos, read at the same time.
pub fn status_of_each(repos: &[String]) -> Vec<RepoStatus> {
    std::thread::scope(|scope| {
        let reading: Vec<_> = repos
            .iter()
            .map(|repo| scope.spawn(move || repo_status(repo)))
            .collect();
        reading.into_iter().filter_map(|thread| thread.join().ok()).collect()
    })
}
