//! Where a snapshot reads files from: the working folder (the checked-out branch, with uncommitted changes), or a
//! commit such as another branch's tip, read straight from git so the checkout is never touched.
use super::git::git_or_empty;
use super::paths::join;

#[derive(Clone, Debug)]
pub enum At {
    /// The working folder: uncommitted and untracked changes count.
    Work,
    /// A branch or commit, read from git objects.
    Commit(String),
}

impl At {
    /// The arguments that end a `git diff <base> …` for this source: nothing (working folder) or the commit.
    pub fn diff_args<'a>(&'a self, base: &'a str) -> Vec<&'a str> {
        match self {
            At::Work => vec![base],
            At::Commit(rev) => vec![base, rev.as_str()],
        }
    }

    /// The text of a file, or None when it doesn't exist here.
    pub fn read(&self, repo: &str, path: &str) -> Option<String> {
        match self {
            At::Work => std::fs::read(join(repo, path))
                .ok()
                .map(|b| String::from_utf8_lossy(&b).into_owned()),
            At::Commit(rev) => {
                let out = std::process::Command::new("git")
                    .args(["-C", repo, "show", &format!("{rev}:{path}")])
                    .output()
                    .ok()?;
                out.status
                    .success()
                    .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
            }
        }
    }

    /// The first bytes of a file, to tell text from binary (a NUL in the first 8 KB, as git does).
    pub fn is_binary(&self, repo: &str, path: &str) -> bool {
        match self {
            At::Work => {
                use std::io::Read;
                let mut buf = [0u8; 8000];
                std::fs::File::open(join(repo, path))
                    .and_then(|mut f| f.read(&mut buf))
                    .map(|n| buf[..n].contains(&0))
                    .unwrap_or(false)
            }
            At::Commit(rev) => std::process::Command::new("git")
                .args(["-C", repo, "show", &format!("{rev}:{path}")])
                .output()
                .map(|o| o.stdout[..o.stdout.len().min(8000)].contains(&0))
                .unwrap_or(false),
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
