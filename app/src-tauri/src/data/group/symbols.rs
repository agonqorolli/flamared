//! The functions, types and constants a change declares, read from the text with one pattern (no parser).
use crate::data::diff::hunks_start;
use indexmap::IndexMap;
use regex::Regex;
use std::sync::LazyLock;

// Top-level declarations only (Python methods one level deep), so locals don't show up. Covers JS/TS, Python,
// Rust (pub fn, struct, trait...) and Go (func, type, var).
static DECLARATION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?: {4})?(?:export\s+)?(?:default\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(function|class|const|let|interface|type|enum|def|fn|struct|trait|mod|static|func|var)\s+([A-Za-z_]\w*)").unwrap()
});

fn declared_name(line: &str) -> Option<String> {
    DECLARATION.captures(line).map(|found| found[2].to_string())
}

/// Every declaration in a file git doesn't track yet: it has no diff, so each one counts as added (+).
pub(super) fn all_added(text: &str) -> IndexMap<String, char> {
    text.lines().filter_map(declared_name).map(|name| (name, '+')).collect()
}

/// Declarations a file's change adds (+), removes (-) or touches (~), in the order found. `diff` is the file's
/// `git diff -U0` lines.
pub(super) fn changed(diff: &[String]) -> IndexMap<String, char> {
    // name -> (declared on an added line, declared on a removed line)
    let mut found: IndexMap<String, (bool, bool)> = IndexMap::new();
    for line in &diff[hunks_start(diff)..] {
        let (text, added, removed) = if line.starts_with("@@") {
            // A hunk header ends with the declaration the change sits inside.
            (line.rsplit("@@").next().unwrap_or(""), false, false)
        } else if let Some(added) = line.strip_prefix('+') {
            (added, true, false)
        } else if let Some(removed) = line.strip_prefix('-') {
            (removed, false, true)
        } else {
            continue;
        };
        if let Some(name) = declared_name(text) {
            let lines = found.entry(name).or_default();
            lines.0 |= added;
            lines.1 |= removed;
        }
    }
    let kind = |(added, removed)| match (added, removed) {
        (true, false) => '+',
        (false, true) => '-',
        _ => '~',
    };
    found.into_iter().map(|(name, lines)| (name, kind(lines))).collect()
}
