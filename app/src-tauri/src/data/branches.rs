//! The branch picker's data, and what a branch is compared with when it is viewed without checking it out.
use super::git::{current_branch, git, git_line, git_or_empty, toplevel, worktrees};
use super::repos::repo_status;
use super::snapshot::model::{BranchFiles, BranchRow};
use chrono::{DateTime, FixedOffset};
use indexmap::IndexMap;
use std::collections::{BTreeSet, HashMap, HashSet};

/// The branch picker counts files for this many branches, newest first.
const MAX_BRANCHES_COUNTED: usize = 50;

/// Agent work on one branch: how many sessions edited there, which agents, and their latest edit.
#[derive(Default)]
pub struct BranchWork {
    pub sessions: u64,
    pub agents: BTreeSet<&'static str>,
    pub last: Option<DateTime<FixedOffset>>,
}

/// One line of `git for-each-ref`: a local branch, or a remote one.
struct Ref {
    name: String,
    /// When its last commit was made.
    at: String,
    remote: bool,
    /// Its last commit's subject.
    subject: String,
}

impl Ref {
    /// A remote branch's name without the remote ("origin/main" -> "main"); a local branch's name as it is.
    fn local_name(&self) -> &str {
        if self.remote {
            self.name.split_once('/').map_or(self.name.as_str(), |(_, name)| name)
        } else {
            &self.name
        }
    }
}

/// Local branches, then remote ones with no local copy, for the branch picker (newest commit first).
pub fn branches(top: &str, current: &str, work: &HashMap<String, BranchWork>) -> Vec<BranchRow> {
    let mut refs: Vec<Ref> = Vec::new();
    // The subject comes last, since it can hold tabs.
    let format = "--format=%(refname)%09%(refname:short)%09%(committerdate:iso-strict)%09%(symref)%09%(subject)";
    let listing = git_or_empty(
        top,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            format,
            "refs/heads",
            "refs/remotes",
        ],
    );
    for line in listing.lines() {
        let fields: Vec<&str> = line.splitn(5, '\t').collect();
        let [full_name, name, at, symref, subject] = fields[..] else {
            continue;
        };
        let remote = full_name.starts_with("refs/remotes/");
        if !symref.is_empty() || (remote && full_name.matches('/').count() < 3) {
            continue; // origin/HEAD and bare remote names
        }
        refs.push(Ref {
            name: name.to_string(),
            at: at.to_string(),
            remote,
            subject: subject.to_string(),
        });
    }
    drop_remotes_with_local_copy(&mut refs);
    refs.sort_by_key(|found| found.remote); // stable: keeps newest first inside each part
    // Branches checked out in other worktrees, read once (not once per branch: repos can have hundreds).
    let in_worktree: HashSet<String> = worktrees(top)
        .into_iter()
        .filter_map(|worktree| worktree.branch)
        .collect();
    refs.into_iter()
        .map(|found| {
            let work = work.get(found.local_name());
            BranchRow {
                current: found.name == current,
                worktree: !found.remote && found.name != current && in_worktree.contains(&found.name),
                sessions: work.map_or(0, |work| work.sessions),
                agents: work.map_or(vec![], |work| work.agents.iter().copied().collect()),
                agent_at: work.and_then(|work| work.last).map(|time| time.to_rfc3339()),
                name: found.name,
                at: found.at,
                remote: found.remote,
                subject: found.subject,
            }
        })
        .collect()
}

/// Leaves out each remote branch that has a local branch of the same name, whichever has the newer commit (the list
/// is newest first, so the remote can come before its local copy).
fn drop_remotes_with_local_copy(refs: &mut Vec<Ref>) {
    let local: HashSet<String> = refs
        .iter()
        .filter(|found| !found.remote)
        .map(|found| found.name.clone())
        .collect();
    refs.retain(|found| !found.remote || !local.contains(found.local_name()));
}

fn exists(top: &str, rev: &str) -> bool {
    !git_line(top, &["rev-parse", "--verify", "--quiet", rev]).is_empty()
}

/// The branch a repo's work usually merges into: origin's default (origin/HEAD), else main or master if it exists.
pub fn default_branch(top: &str) -> Option<String> {
    let origin_head = git_line(top, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
    if let Some(name) = origin_head.strip_prefix("origin/") {
        // The local branch of that name when there is one, else the remote one.
        return Some(if exists(top, name) {
            name.to_string()
        } else {
            origin_head
        });
    }
    ["main", "master"]
        .iter()
        .find(|name| exists(top, name))
        .map(|name| name.to_string())
}

/// The worktree folder where a branch is checked out, if any (Claude Code often works in worktrees).
pub fn worktree_of(top: &str, branch: &str) -> Option<String> {
    let mut checkouts = worktrees(top).into_iter();
    checkouts
        .find(|worktree| worktree.branch.as_deref() == Some(branch))
        .map(|worktree| worktree.path)
}

/// A branch's latest commit and the commit it is compared with.
pub struct SplitOff {
    pub tip: String,
    /// Where the branch split off.
    pub base: String,
    /// What it split off from: a branch name, or "HEAD".
    pub against: String,
}

/// A branch's tip and where it split off: from the default branch; for the default branch itself (or one already
/// merged into it), from the checked-out branch instead.
pub fn split_off(top: &str, branch: &str, default: Option<&str>) -> Result<SplitOff, String> {
    let tip = git(top, &["rev-parse", branch])?.trim().to_string();
    let split_from = |other: &str| git_line(top, &["merge-base", other, branch]);
    let mut base = default.map(split_from).unwrap_or_default();
    let mut against = default.unwrap_or("HEAD").to_string();
    if base.is_empty() || base == tip {
        base = split_from("HEAD");
        against = "HEAD".to_string();
    }
    if base.is_empty() {
        base = tip.clone();
    }
    Ok(SplitOff { tip, base, against })
}

/// For the branch picker, run when it opens: how many files each branch changed, as viewing it would show them
/// (a worktree's uncommitted files; otherwise the files changed since it split off). The checked-out branch is left
/// out (the window knows its files), and so is anything past the first 50 branches.
pub fn branch_files(repo: &str) -> Result<IndexMap<String, BranchFiles>, String> {
    let top = toplevel(repo)?;
    let checked_out = current_branch(&top);
    let default = default_branch(&top);
    let mut counts = IndexMap::new();
    let format = "--format=%(refname:short)%09%(symref)";
    let listing = git_or_empty(
        &top,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            format,
            "refs/heads",
            "refs/remotes",
        ],
    );
    // Like the branch list: pointers such as origin/HEAD (a symref) aren't branches.
    let names = listing
        .lines()
        .filter_map(|line| line.split_once('\t'))
        .filter(|(name, symref)| symref.is_empty() && *name != checked_out)
        .map(|(name, _)| name);
    for name in names.take(MAX_BRANCHES_COUNTED) {
        let count = if let Some(folder) = worktree_of(&top, name) {
            BranchFiles {
                n: repo_status(&folder).changed.len(),
                against: None,
            }
        } else {
            // A branch git can't read (a broken ref) gets no count; the others still do.
            let Ok(split) = split_off(&top, name, default.as_deref()) else {
                continue;
            };
            let n = if split.tip == split.base {
                0
            } else {
                git_or_empty(&top, &["diff", "--name-only", &split.base, &split.tip])
                    .lines()
                    .count()
            };
            let against = if split.against != "HEAD" {
                split.against
            } else if checked_out.is_empty() {
                git_line(&top, &["rev-parse", "--short", "HEAD"])
            } else {
                checked_out.clone()
            };
            BranchFiles {
                n,
                against: Some(against),
            }
        };
        counts.insert(name.to_string(), count);
    }
    Ok(counts)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn branch(name: &str, remote: bool) -> Ref {
        Ref {
            name: name.to_string(),
            at: String::new(),
            remote,
            subject: String::new(),
        }
    }

    #[test]
    fn remote_with_newer_commit_than_its_local_copy() {
        // Newest first: origin/main has commits main hasn't pulled yet.
        let mut refs = vec![
            branch("origin/main", true),
            branch("main", false),
            branch("origin/feature/x", true),
        ];
        drop_remotes_with_local_copy(&mut refs);
        let names: Vec<&str> = refs.iter().map(|found| found.name.as_str()).collect();
        assert_eq!(names, ["main", "origin/feature/x"]);
    }
}
