//! Running git, and the facts about a repo that several places ask for. Read-only: only diff, show, log, ls-files,
//! status-like queries.
use super::paths::realpath;
use std::process::{Command, Output};

fn run(repo: &str, args: &[&str]) -> std::io::Result<Output> {
    Command::new("git").arg("-C").arg(repo).args(args).output()
}

/// stdout of `git -C <repo> <args>`; an error with git's message when it exits non-zero.
pub fn git(repo: &str, args: &[&str]) -> Result<String, String> {
    let out = run(repo, args).map_err(|e| format!("can't run git: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Like `git`, but a failure just gives empty output (e.g. `git show` of a file that didn't exist).
pub fn git_or_empty(repo: &str, args: &[&str]) -> String {
    String::from_utf8_lossy(&git_bytes(repo, args)).into_owned()
}

/// Like `git_or_empty`, for output that may not be text (a file's content).
pub fn git_bytes(repo: &str, args: &[&str]) -> Vec<u8> {
    run(repo, args).map(|out| out.stdout).unwrap_or_default()
}

/// A one-line answer from git, without its line break; empty when git fails.
pub fn git_line(repo: &str, args: &[&str]) -> String {
    git_or_empty(repo, args).trim().to_string()
}

/// The top folder of the repo a folder is in; git's own message when it isn't in one.
pub fn toplevel(folder: &str) -> Result<String, String> {
    Ok(realpath(git(folder, &["rev-parse", "--show-toplevel"])?.trim()))
}

/// The checked-out branch; empty when no branch is (a detached HEAD).
pub fn current_branch(repo: &str) -> String {
    git_line(repo, &["branch", "--show-current"])
}

/// One checkout of a repo: its main folder or a `git worktree` folder, and the branch checked out there (None when
/// it is on a commit instead).
pub struct Worktree {
    pub path: String,
    pub branch: Option<String>,
}

/// Every checkout of the repo, the main one first (Claude Code often works in worktrees).
pub fn worktrees(repo: &str) -> Vec<Worktree> {
    let mut found: Vec<Worktree> = Vec::new();
    for line in git_or_empty(repo, &["worktree", "list", "--porcelain"]).lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            found.push(Worktree {
                path: path.trim().to_string(),
                branch: None,
            });
        } else if let (Some(branch), Some(last)) = (line.strip_prefix("branch refs/heads/"), found.last_mut()) {
            last.branch = Some(branch.to_string());
        }
    }
    found
}

/// This checkout plus every worktree of the same repo, as real paths.
pub fn repo_roots(top: &str) -> Vec<String> {
    let mut roots = vec![top.to_string()];
    for worktree in worktrees(top) {
        let path = realpath(&worktree.path);
        if !roots.contains(&path) {
            roots.push(path);
        }
    }
    roots
}
