//! Where a snapshot reads files from: the working folder (the checked-out branch, with uncommitted changes), or a
//! commit such as another branch's tip, read straight from git so the checkout is never touched.
use super::git::{git, git_bytes, git_or_empty};
use super::paths::join;

/// How much of a file is looked at to tell text from binary: a NUL byte in the first 8 KB means binary, as in git.
const BINARY_CHECK_BYTES: usize = 8000;

/// The text of a file in the working folder, or None when it isn't there.
pub fn read_text(repo: &str, path: &str) -> Option<String> {
    std::fs::read(join(repo, path))
        .ok()
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
}

#[derive(Clone, Debug)]
pub enum At {
    /// The working folder: uncommitted and untracked changes count.
    Work,
    /// A branch or commit, read from git objects.
    Commit(String),
}

impl At {
    /// The `git diff` command that compares `base` with this source: the options, then the base alone (against
    /// the working folder) or the base and the commit.
    pub fn diff_command<'a>(&'a self, options: &[&'a str], base: &'a str) -> Vec<&'a str> {
        let mut command = vec!["diff"];
        command.extend_from_slice(options);
        command.push(base);
        if let At::Commit(rev) = self {
            command.push(rev);
        }
        command
    }

    /// The text of a file, or None when it doesn't exist here.
    pub fn read(&self, repo: &str, path: &str) -> Option<String> {
        match self {
            At::Work => read_text(repo, path),
            At::Commit(rev) => git(repo, &["show", &format!("{rev}:{path}")]).ok(),
        }
    }

    /// Is this a binary file? A missing file counts as text.
    pub fn is_binary(&self, repo: &str, path: &str) -> bool {
        match self {
            At::Work => {
                use std::io::Read;
                let mut start = [0u8; BINARY_CHECK_BYTES];
                std::fs::File::open(join(repo, path))
                    .and_then(|mut file| file.read(&mut start))
                    .map(|read| start[..read].contains(&0))
                    .unwrap_or(false)
            }
            At::Commit(rev) => {
                let content = git_bytes(repo, &["show", &format!("{rev}:{path}")]);
                content[..content.len().min(BINARY_CHECK_BYTES)].contains(&0)
            }
        }
    }

    /// Files git doesn't track yet; only the working folder has any.
    pub fn untracked(&self, repo: &str) -> Vec<String> {
        match self {
            At::Work => git_or_empty(repo, &["ls-files", "--others", "--exclude-standard"])
                .lines()
                .map(String::from)
                .collect(),
            At::Commit(_) => vec![],
        }
    }

    /// Every file here with a rough size for the map: line counts in the working folder (via `count`), and for a
    /// commit its stored size in bytes / 40, which keeps the same proportions without reading every file.
    pub fn files_sized(&self, repo: &str, count: impl Fn(&str) -> u64) -> Vec<(String, u64)> {
        match self {
            At::Work => git_or_empty(repo, &["ls-files"])
                .lines()
                .map(|p| (p.to_string(), count(p)))
                .collect(),
            At::Commit(rev) => git_or_empty(repo, &["ls-tree", "-r", "-l", rev])
                .lines()
                .filter_map(|l| {
                    let (meta, path) = l.split_once('\t')?;
                    let size: u64 = meta.split_whitespace().nth(3)?.parse().unwrap_or(0);
                    Some((path.to_string(), (size / 40).max(1)))
                })
                .collect(),
        }
    }

    /// The commit this source ends at ("HEAD" for the working folder).
    pub fn rev(&self) -> &str {
        match self {
            At::Work => "HEAD",
            At::Commit(rev) => rev,
        }
    }
}
