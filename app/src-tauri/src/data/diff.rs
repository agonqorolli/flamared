//! What git says changed between a base commit and what is being shown: which files, how many lines, and each
//! file's diff.
use super::git::{git, git_or_empty};
use super::tree::At;
use indexmap::IndexMap;
use std::collections::HashMap;

/// changed path -> status letter, in git's order, untracked files last (as "A")
pub fn changed_files(repo: &str, base: &str, at: &At) -> Result<IndexMap<String, String>, String> {
    let mut files = IndexMap::new();
    for line in git(repo, &at.diff_command(&["--name-status", "-M"], base))?.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        // A rename has two paths; the last one is the file's name now.
        if let (Some(status), Some(path)) = (fields.first(), fields.last()) {
            files.insert(path.to_string(), status.chars().next().unwrap_or('M').to_string());
        }
    }
    for path in at.untracked(repo) {
        files.insert(path, "A".into());
    }
    Ok(files)
}

/// changed path -> (lines added, lines removed). Untracked files aren't in it; binary files count as 0.
pub fn numstat(repo: &str, base: &str, at: &At) -> Result<HashMap<String, (u64, u64)>, String> {
    let mut stats = HashMap::new();
    for line in git(repo, &at.diff_command(&["--numstat", "-M"], base))?.lines() {
        let mut fields = line.splitn(3, '\t');
        if let (Some(added), Some(removed), Some(path)) = (fields.next(), fields.next(), fields.next()) {
            stats.insert(
                rename_target(path),
                (added.parse().unwrap_or(0), removed.parse().unwrap_or(0)),
            );
        }
    }
    Ok(stats)
}

/// "dir/{old => new}/f.ts" or "old.ts => new.ts" -> the new path
fn rename_target(path: &str) -> String {
    if let (Some(open), Some(close)) = (path.find('{'), path.find('}')) {
        let renamed = &path[open + 1..close];
        let new = renamed.split(" => ").last().unwrap_or(renamed);
        return format!("{}{}{}", &path[..open], new, &path[close + 1..]).replace("//", "/");
    }
    path.split(" => ").last().unwrap_or(path).to_string()
}

/// One `git diff` for the whole change, split into each file's lines (keyed by its new path). Starting git once
/// instead of once per file is most of what makes a reload fast.
pub fn diff_by_file(repo: &str, at: &At, options: &[&str], base: &str) -> HashMap<String, Vec<String>> {
    let mut command = vec!["-c", "core.quotePath=false"];
    command.extend(at.diff_command(options, base));
    let text = git_or_empty(repo, &command);
    let mut by_file: HashMap<String, Vec<String>> = HashMap::new();
    let mut chunk: Vec<&str> = Vec::new();
    let mut keep = |chunk: &mut Vec<&str>| {
        if let Some(path) = chunk_path(chunk) {
            by_file.insert(path, chunk.iter().map(|line| line.to_string()).collect());
        }
        chunk.clear();
    };
    for line in text.lines() {
        if line.starts_with("diff --git ") {
            keep(&mut chunk);
        }
        chunk.push(line);
    }
    keep(&mut chunk);
    by_file
}

/// The file a diff chunk is about: its new path, or the old one for a deletion.
fn chunk_path(chunk: &[&str]) -> Option<String> {
    let header = chunk.first()?.strip_prefix("diff --git a/")?;
    for line in chunk.iter().take_while(|line| !line.starts_with("@@")) {
        if let Some(path) = line.strip_prefix("+++ b/") {
            return Some(path.to_string());
        }
        if let Some(path) = line.strip_prefix("rename to ") {
            return Some(path.to_string());
        }
    }
    if let Some(path) = chunk.iter().find_map(|line| line.strip_prefix("--- a/")) {
        return Some(path.to_string()); // deleted: "+++ /dev/null"
    }
    // Binary or mode-only changes have no ---/+++ lines: "a/<p> b/<p>" with the same path twice.
    let half = header.len().checked_sub(3)? / 2;
    (header.get(half..half + 3) == Some(" b/") && header[..half] == header[half + 3..])
        .then(|| header[..half].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renames() {
        assert_eq!(rename_target("src/{old => new}/f.ts"), "src/new/f.ts");
        assert_eq!(rename_target("a.ts => b.ts"), "b.ts");
        assert_eq!(rename_target("src/{ => sub}/f.ts"), "src/sub/f.ts");
    }
}
