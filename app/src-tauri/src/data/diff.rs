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
    let text = git_or_empty(repo, &at.diff_command(options, base));
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

/// Where a file's diff turns from its header (`diff --git`, `index`, `---`, `+++`…) to its hunks: the first `@@`
/// line, or the end when it has none (binary or mode-only). Only the header is read as header: a removed `-- x` line
/// is `--- x` in the hunks.
pub fn hunks_start<S: AsRef<str>>(chunk: &[S]) -> usize {
    chunk
        .iter()
        .position(|line| line.as_ref().starts_with("@@"))
        .unwrap_or(chunk.len())
}

/// The file a diff chunk is about: its new path, or the old one for a deletion.
fn chunk_path(chunk: &[&str]) -> Option<String> {
    let header_line = chunk.first()?.strip_prefix("diff --git a/")?;
    let header = &chunk[..hunks_start(chunk)];
    for line in header {
        if let Some(path) = line.strip_prefix("+++ b/") {
            return Some(path.to_string());
        }
        if let Some(path) = line.strip_prefix("rename to ") {
            return Some(path.to_string());
        }
    }
    if let Some(path) = header.iter().find_map(|line| line.strip_prefix("--- a/")) {
        return Some(path.to_string()); // deleted: "+++ /dev/null"
    }
    // Binary or mode-only changes have no ---/+++ lines: "a/<p> b/<p>" with the same path twice.
    let half = header_line.len().checked_sub(3)? / 2;
    (header_line.get(half..half + 3) == Some(" b/") && header_line[..half] == header_line[half + 3..])
        .then(|| header_line[..half].to_string())
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

    #[test]
    fn hunk_lines_that_look_like_headers() {
        // A removed "-- note" and an added "++ x" line read "--- note" and "+++ x" in the hunks.
        let chunk = [
            "diff --git a/q.sql b/q.sql",
            "--- a/q.sql",
            "+++ b/q.sql",
            "@@ -1,2 +1,2 @@",
            "--- note",
            "+++ x",
        ];
        assert_eq!(hunks_start(&chunk), 3);
        assert_eq!(chunk_path(&chunk).as_deref(), Some("q.sql"));
        let deleted = [
            "diff --git a/q.sql b/q.sql",
            "deleted file mode 100644",
            "--- a/q.sql",
            "+++ /dev/null",
            "@@ -1 +0,0 @@",
            "--- a/other.sql",
        ];
        assert_eq!(chunk_path(&deleted).as_deref(), Some("q.sql"));
        let binary = ["diff --git a/i.png b/i.png", "Binary files a/i.png and b/i.png differ"];
        assert_eq!(hunks_start(&binary), binary.len());
        assert_eq!(chunk_path(&binary).as_deref(), Some("i.png"));
    }
}
