//! Everything one screen load needs for a repo: changes grouped by logic, every agent edit that led to them,
//! and the repo map.
mod diffs;
mod flags;
mod map;
pub mod model;
mod story;
mod timeline;

use super::branches::{branches, default_branch, split_off, worktree_of};
use super::git::{current_branch, git, git_line, git_or_empty, repo_roots, toplevel};
use super::group::{Grouping, group};
use super::paths::{basename, realpath};
use super::repos::known_repos;
use super::tree::At;
use indexmap::IndexMap;
use model::{Map, SessionLink, Snapshot, Timeline, Totals, Viewing};
use std::collections::{HashMap, HashSet};
use story::Files;
use timeline::{Linked, Scope};

/// Everything a screen load needs for `repo`, showing `branch` (None: the checked-out one). Viewing is read-only:
/// a branch checked out in a worktree is read from that folder (with its uncommitted changes); any other branch
/// shows its commits since it split off from the default branch, read from git without touching the checkout.
pub fn view(repo: &str, branch: Option<&str>) -> Result<Snapshot, String> {
    let shown = what_to_show(repo, branch)?;
    build(&shown.top, &shown.base, &shown.at)
}

/// One changed file's whole diff in the same view as `view` (the snapshot's diffs are cut at 400 lines).
pub fn file_diff(repo: &str, branch: Option<&str>, path: &str) -> Result<String, String> {
    let shown = what_to_show(repo, branch)?;
    let top = realpath(&shown.top);
    let untracked: HashSet<String> = shown.at.untracked(&top).into_iter().collect();
    Ok(diffs::whole_text(&top, &shown.base, &shown.at, path, &untracked))
}

/// The folder, base and version a view of `branch` reads: see `view`.
struct Shown {
    top: String,
    base: String,
    at: At,
}

fn what_to_show(repo: &str, branch: Option<&str>) -> Result<Shown, String> {
    let top = toplevel(repo)?;
    let checked_out = current_branch(&top);
    let work = |top: String| Shown {
        top,
        base: "HEAD".into(),
        at: At::Work,
    };
    let Some(branch) = branch.filter(|branch| *branch != checked_out) else {
        return Ok(work(top));
    };
    if let Some(folder) = worktree_of(&top, branch) {
        return Ok(work(folder));
    }
    let split = split_off(&top, branch, default_branch(&top).as_deref())?;
    Ok(Shown {
        top,
        base: split.base,
        at: At::Commit(branch.to_string()),
    })
}

/// The snapshot of the change between `base` and `at`: the working folder (the checked-out branch) or another
/// branch's tip, read from git (see tree.rs).
pub fn build(top: &str, base: &str, at: &At) -> Result<Snapshot, String> {
    let top = realpath(top);
    let top = top.as_str();
    // Everything that could be committed is shown: every changed, deleted and untracked (not ignored) file, any type.
    // Files the person chose to leave out (left_out.rs) are still counted, flagged and listed, but not grouped, not
    // linked to agent edits and not colored on the Map.
    let grouping = group(top, base, at)?;
    let changed = &grouping.files;
    let all: IndexMap<String, String> = changed
        .iter()
        .chain(&grouping.left_out)
        .map(|(path, status)| (path.clone(), status.clone()))
        .collect();
    let untracked: HashSet<String> = at.untracked(top).into_iter().collect();
    let stats = stats_with_untracked(&grouping, &untracked, top, at);
    let binary: HashSet<&String> = all.keys().filter(|path| at.is_binary(top, path)).collect();

    let checked_out = current_branch(top); // empty when detached
    // The branch being shown: the checked-out one, or the one picked to view. Agent edits are matched against it.
    let branch = match at {
        At::Work => checked_out.clone(),
        At::Commit(rev) => rev.clone(),
    };
    let roots = repo_roots(top);
    let base_time = timeline::parse_time(&git_or_empty(top, &["show", "-s", "--format=%cI", base]));
    let linked = timeline::link(&Scope {
        top,
        at,
        branch: &branch,
        base_time,
        roots: &roots,
        changed,
    });
    let base_short = git(top, &["rev-parse", "--short", base])?.trim().to_string();
    let head = git_line(top, &["rev-parse", "--short", at.rev()]);

    let files = Files::new(&grouping, &stats, &binary, &linked.words);
    let diff_lines = diffs::lines_by_file(top, base, at, &all, &untracked);
    let (add, rem) = all
        .keys()
        .map(|path| files.stat(path))
        .fold((0, 0), |(add, rem), (a, r)| (add + a, rem + r));
    let shown_branch = if branch.is_empty() {
        head.clone()
    } else {
        branch.clone()
    };
    Ok(Snapshot {
        repo: basename(top).to_string(),
        path: top.to_string(),
        branch: shown_branch.clone(),
        base: base_short.clone(),
        base_label: base.to_string(),
        head,
        generated: chrono::Local::now().format("%Y-%m-%d %H:%M").to_string(),
        repos: known_repos(Some(top)),
        branches: branches(top, &checked_out, &linked.branch_work),
        viewing: Viewing {
            branch: shown_branch,
            checked_out: matches!(at, At::Work),
        },
        stats: Totals {
            files: all.len(),
            add,
            rem,
        },
        story: story::story(&files),
        diffs: all
            .keys()
            .map(|path| (path.clone(), diffs::shown_text(&diff_lines[path])))
            .collect(),
        map: Map {
            files: map::files_sized(top, at, &all, |path| files.stat(path).1),
            flags: flags::rule_flags(&grouping, &diff_lines),
            groups: group_names(&grouping),
        },
        timeline: Timeline {
            commits: timeline::commits(top, base, at),
            link: session_link(&linked, branch, base_short, roots.len() - 1),
            sessions: linked.sessions,
        },
    })
}

/// Line counts for every changed file: git's, plus the files it doesn't track yet, whose every line counts as added.
fn stats_with_untracked(
    grouping: &Grouping,
    untracked: &HashSet<String>,
    top: &str,
    at: &At,
) -> HashMap<String, (u64, u64)> {
    let mut stats = grouping.stats.clone();
    for path in untracked {
        if !stats.contains_key(path) {
            let lines = if at.is_binary(top, path) {
                0
            } else {
                at.read(top, path).map_or(0, |text| text.lines().count() as u64)
            };
            stats.insert(path.clone(), (lines, 0));
        }
    }
    stats
}

/// changed path -> the name of the group it is in
fn group_names(grouping: &Grouping) -> std::collections::BTreeMap<String, String> {
    let named = grouping
        .groups
        .iter()
        .flat_map(|group| group.files.iter().chain(&group.tests).map(move |path| (path, group)));
    named.map(|(path, group)| (path.clone(), group.name.clone())).collect()
}

fn session_link(linked: &Linked, branch: String, base: String, worktrees: usize) -> SessionLink {
    let mut agents: IndexMap<&'static str, u64> = IndexMap::new();
    for session in &linked.sessions {
        *agents.entry(session.agent).or_default() += 1;
    }
    SessionLink {
        branch,
        base,
        worktrees,
        sessions_in_repo: linked.sessions_in_repo,
        turns_kept: linked.sessions.iter().map(|session| session.turns.len()).sum(),
        skipped: linked.skipped.clone(),
        agents,
    }
}
