//! Running git. Read-only: only diff, show, log, ls-files, status-like queries.
use std::process::Command;

/// stdout of `git -C <repo> <args>`; an error with git's message when it exits non-zero.
pub fn git(repo: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git").arg("-C").arg(repo).args(args).output().map_err(|e| format!("can't run git: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Like `git`, but a failure just gives empty output (e.g. `git show` of a file that didn't exist).
pub fn git_or_empty(repo: &str, args: &[&str]) -> String {
    Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}
