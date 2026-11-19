//! Each changed file's diff, as the lines the window shows: hunk headers and the +/- lines under them.
use crate::data::diff::{diff_by_file, hunks_start};
use crate::data::tree::{At, read_text};
use indexmap::IndexMap;
use std::collections::{HashMap, HashSet};

/// A longer diff is cut here, with a last line saying how many lines were left out and a short hash of the whole
/// diff, so two cut diffs are the same text only when the whole diffs are: review marks, Live and the "new" dots
/// compare diffs as text, and must see an edit past the cut. The window asks for the whole diff (`whole_text`) when
/// you want to read it.
const MAX_DIFF_LINES: usize = 2000;

/// path -> its whole diff as lines, for every changed file.
pub fn lines_by_file<'a>(
    top: &str,
    base: &str,
    at: &At,
    changed: &'a IndexMap<String, String>,
    untracked: &HashSet<String>,
) -> HashMap<&'a String, Vec<String>> {
    let tracked = diff_by_file(top, at, &["-M"], base);
    let lines_of = |path: &String| {
        if untracked.contains(path) {
            return untracked_lines(top, path);
        }
        // The file's header says which file it is; the window shows that itself.
        let Some(chunk) = tracked.get(path) else {
            return vec![];
        };
        chunk[hunks_start(chunk)..].to_vec()
    };
    changed.keys().map(|path| (path, lines_of(path))).collect()
}

/// A file git doesn't track yet has no diff: every line of it counts as added. Binary files have no text diff
/// (empty; the window says so).
fn untracked_lines(top: &str, path: &str) -> Vec<String> {
    if At::Work.is_binary(top, path) {
        return vec![];
    }
    // Untracked files only exist in the working folder.
    let Some(text) = read_text(top, path) else {
        return vec![];
    };
    let content: Vec<&str> = text.lines().collect();
    let mut lines = vec![format!("@@ -0,0 +1,{} @@", content.len())];
    lines.extend(content.iter().map(|line| format!("+{line}")));
    lines
}

/// A diff as the text the window is sent, cut at `MAX_DIFF_LINES`: "… 520 more lines · 3f9a…" ends a cut one.
pub fn shown_text(lines: &[String]) -> String {
    if lines.len() <= MAX_DIFF_LINES {
        return lines.join("\n");
    }
    let mut shown = lines[..MAX_DIFF_LINES].to_vec();
    shown.push(format!(
        "… {} more lines · {:016x}",
        lines.len() - MAX_DIFF_LINES,
        fingerprint(lines)
    ));
    shown.join("\n")
}

/// One file's whole diff, uncut, for Show all.
pub fn whole_text(top: &str, base: &str, at: &At, path: &str, untracked: &HashSet<String>) -> String {
    let changed: IndexMap<String, String> = [(path.to_string(), String::new())].into_iter().collect();
    lines_by_file(top, base, at, &changed, untracked)
        .into_values()
        .next()
        .unwrap_or_default()
        .join("\n")
}

/// FNV-1a over the lines: stable across builds (marks are saved), unlike std's hasher.
fn fingerprint(lines: &[String]) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0100_0000_01b3;
    lines
        .iter()
        .flat_map(|line| line.bytes().chain(*b"\n"))
        .fold(OFFSET, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(PRIME))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(count: usize, last: &str) -> Vec<String> {
        let mut lines: Vec<String> = (0..count).map(|n| format!("+line {n}")).collect();
        lines.push(last.to_string());
        lines
    }

    #[test]
    fn a_short_diff_is_sent_whole() {
        assert_eq!(shown_text(&lines(2, "+end")), "+line 0\n+line 1\n+end");
    }

    #[test]
    fn a_cut_diff_changes_when_lines_past_the_cut_do() {
        let before = shown_text(&lines(MAX_DIFF_LINES + 10, "+end"));
        let after = shown_text(&lines(MAX_DIFF_LINES + 10, "+end, changed"));
        assert_eq!(before.lines().count(), MAX_DIFF_LINES + 1);
        assert!(before.lines().last().unwrap().starts_with("… 11 more lines · "));
        assert_ne!(before, after);
        assert_eq!(before, shown_text(&lines(MAX_DIFF_LINES + 10, "+end")));
    }
}
