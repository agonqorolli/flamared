//! Files to leave out of the review (Settings → Files): committed files you don't want to step through one by one,
//! like lockfiles or generated code. None by default. A left-out file is still part of the change: it is counted,
//! checked by the rule flags and listed at the end of Changes; it only stays out of the groups, the Timeline and the
//! Map's lenses. The patterns are saved by the app (left_out.rs beside data/) and set here when it starts.
//!
//! Patterns read like .gitignore lines: `*` is any characters but `/`, `**` any folders, `?` one character. Without
//! a `/` a pattern matches a file or folder name at any depth (`*.lock`, `__snapshots__`); with one it is matched
//! from the repo's top (`src/gen/**`); a trailing `/` matches folders only. Matching a folder leaves out what is in
//! it.
use indexmap::IndexMap;
use regex::Regex;
use std::sync::RwLock;

/// One pattern, ready to match paths.
struct Pattern {
    regex: Regex,
    /// has a `/` before its end: matched against the path from the repo's top, not against names
    anchored: bool,
    /// ends with `/`: matches folders only
    folders_only: bool,
}

static PATTERNS: RwLock<Vec<Pattern>> = RwLock::new(Vec::new());

/// A pattern as it is kept: trimmed, with a leading `/` dropped. A plain-language reason when it can't be used.
pub fn tidy(pattern: &str) -> Result<String, String> {
    let tidy = pattern.trim().trim_start_matches('/');
    if tidy.is_empty() || tidy == "/" {
        return Err("Type a file name or pattern, like *.lock or src/generated/.".into());
    }
    if tidy.starts_with('!') {
        return Err("Patterns that bring files back (starting with !) aren't supported.".into());
    }
    if tidy
        .trim_end_matches('/')
        .split('/')
        .all(|part| part == "**" || part == "*")
    {
        return Err(format!("\"{tidy}\" would leave out every file."));
    }
    Ok(tidy.to_string())
}

/// Use these patterns from now on; ones that can't be used are skipped.
pub fn set_patterns(patterns: &[String]) {
    *PATTERNS.write().unwrap() = patterns.iter().filter_map(|pattern| compile(pattern)).collect();
}

fn compile(pattern: &str) -> Option<Pattern> {
    let pattern = tidy(pattern).ok()?;
    let folders_only = pattern.ends_with('/');
    let body = pattern.trim_end_matches('/');
    Some(Pattern {
        regex: Regex::new(&format!("^{}$", glob_regex(body))).ok()?,
        anchored: body.contains('/'),
        folders_only,
    })
}

/// A glob as a regex: `**/` any folders (or none), `**` anything, `*` anything but `/`, `?` one character but `/`.
fn glob_regex(glob: &str) -> String {
    let mut regex = String::new();
    let mut rest = glob;
    while let Some(next) = rest.chars().next() {
        let (piece, used) = if rest.starts_with("**/") {
            ("(?:.*/)?".to_string(), 3)
        } else if rest.starts_with("**") {
            (".*".to_string(), 2)
        } else if next == '*' {
            ("[^/]*".to_string(), 1)
        } else if next == '?' {
            ("[^/]".to_string(), 1)
        } else {
            (regex::escape(&next.to_string()), next.len_utf8())
        };
        regex.push_str(&piece);
        rest = &rest[used..];
    }
    regex
}

impl Pattern {
    /// Does it match the file at `path` (relative to the repo's top), or one of the folders it is in?
    fn matches(&self, path: &str) -> bool {
        let parts: Vec<&str> = path.split('/').collect();
        let is_folder = |count: usize| count < parts.len();
        if self.anchored {
            (1..=parts.len())
                .any(|count| (!self.folders_only || is_folder(count)) && self.regex.is_match(&parts[..count].join("/")))
        } else {
            parts
                .iter()
                .enumerate()
                .any(|(index, name)| (!self.folders_only || is_folder(index + 1)) && self.regex.is_match(name))
        }
    }
}

fn left_out_by(patterns: &[Pattern], path: &str) -> bool {
    patterns.iter().any(|pattern| pattern.matches(path))
}

type Changed = IndexMap<String, String>;

/// The changed files (path -> status) split into the ones to review and the ones left out, each in git's order.
pub fn split(files: Changed) -> (Changed, Changed) {
    split_by(&PATTERNS.read().unwrap(), files)
}

fn split_by(patterns: &[Pattern], files: Changed) -> (Changed, Changed) {
    files.into_iter().partition(|(path, _)| !left_out_by(patterns, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn left_out(pattern: &str, path: &str) -> bool {
        left_out_by(&[compile(pattern).unwrap()], path)
    }

    #[test]
    fn names_match_at_any_depth() {
        assert!(left_out("*.lock", "Cargo.lock"));
        assert!(left_out("*.lock", "app/src-tauri/Cargo.lock"));
        assert!(left_out("pnpm-lock.yaml", "app/pnpm-lock.yaml"));
        assert!(!left_out("*.lock", "src/lock.ts"));
        assert!(left_out("*.min.js", "public/vendor.min.js"));
        assert!(left_out("file?.txt", "a/file1.txt"));
        assert!(!left_out("file?.txt", "a/file10.txt"));
    }

    #[test]
    fn folders_leave_out_what_is_inside() {
        assert!(left_out("__snapshots__", "src/__snapshots__/app.test.ts.snap"));
        assert!(left_out("generated/", "src/generated/api.ts"));
        // A trailing slash means a folder: a file of that name stays in.
        assert!(!left_out("generated/", "src/generated"));
        assert!(left_out("generated", "src/generated"));
    }

    #[test]
    fn a_slash_anchors_to_the_top() {
        assert!(left_out("src/gen/**", "src/gen/a/b.ts"));
        assert!(left_out("/src/gen", "src/gen/b.ts"));
        assert!(!left_out("src/gen/**", "app/src/gen/b.ts"));
        assert!(left_out("**/gen/*.ts", "app/src/gen/b.ts"));
        assert!(left_out("**/gen/*.ts", "gen/b.ts"));
        assert!(!left_out("**/gen/*.ts", "gen/sub/b.ts"));
        assert!(left_out("docs/**/*.md", "docs/a/b/c.md"));
        assert!(left_out("docs/**/*.md", "docs/c.md"));
    }

    #[test]
    fn unusable_patterns_are_explained() {
        assert_eq!(tidy("  /dist/ "), Ok("dist/".to_string()));
        assert!(tidy("").is_err());
        assert!(tidy("!keep.lock").is_err());
        assert!(tidy("**").is_err());
        assert!(tidy("*/").is_err());
        assert!(tidy("(weird)[name].txt").is_ok());
        assert!(left_out("(weird)[name].txt", "a/(weird)[name].txt"));
    }

    #[test]
    fn split_keeps_git_order() {
        let patterns = [compile("*.lock").unwrap()];
        let files: IndexMap<String, String> = [("b.ts", "M"), ("Cargo.lock", "M"), ("a.ts", "A")]
            .into_iter()
            .map(|(path, status)| (path.to_string(), status.to_string()))
            .collect();
        let (kept, out) = split_by(&patterns, files);
        assert_eq!(kept.keys().collect::<Vec<_>>(), ["b.ts", "a.ts"]);
        assert_eq!(out.keys().collect::<Vec<_>>(), ["Cargo.lock"]);
    }
}
