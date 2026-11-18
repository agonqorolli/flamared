//! Each changed file's diff, as the lines the window shows: hunk headers and the +/- lines under them.
use crate::data::diff::{diff_by_file, hunks_start};
use crate::data::tree::{At, read_text};
use indexmap::IndexMap;
use std::collections::{HashMap, HashSet};

/// A longer diff is cut here, with a last line saying how many lines were left out.
const MAX_DIFF_LINES: usize = 400;

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

/// A diff as the text the window is sent, cut at `MAX_DIFF_LINES`.
pub fn shown_text(lines: &[String]) -> String {
    if lines.len() <= MAX_DIFF_LINES {
        return lines.join("\n");
    }
    let mut shown = lines[..MAX_DIFF_LINES].to_vec();
    shown.push(format!("… {} more lines", lines.len() - MAX_DIFF_LINES));
    shown.join("\n")
}
