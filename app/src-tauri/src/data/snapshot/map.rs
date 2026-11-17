//! The Map screen's data: every file in the repo with a size, so the layout follows the folder tree (stable day
//! to day) and changed files can be lit up on it.
use crate::data::cache::{Stamped, cached};
use crate::data::paths::join;
use crate::data::tree::At;
use indexmap::IndexMap;
use std::collections::BTreeMap;
use std::sync::LazyLock;

/// Lines are counted in this much of a file; the map needs proportions, not exact sizes.
const COUNTED_BYTES: u64 = 2_000_000;
/// A NUL byte in this much of the start means a binary file, which gets a small fixed size.
const BINARY_CHECK_BYTES: usize = 4096;
const BINARY_SIZE: u64 = 10;

static LINE_COUNTS: LazyLock<Stamped<u64>> = LazyLock::new(Default::default);

/// (path, size) for every file in the repo, by path. `removed_lines` gives a deleted file's size.
pub fn files_sized(
    top: &str,
    at: &At,
    changed: &IndexMap<String, String>,
    removed_lines: impl Fn(&str) -> u64,
) -> Vec<(String, u64)> {
    let mut sizes: BTreeMap<String, u64> = at.files_sized(top, |path| line_count(top, path)).into_iter().collect();
    // Untracked and deleted files are part of the change too.
    for (path, status) in changed {
        let size_of = || {
            if status != "D" {
                line_count(top, path)
            } else {
                removed_lines(path).max(1)
            }
        };
        sizes.entry(path.clone()).or_insert_with(size_of);
    }
    sizes.into_iter().collect()
}

/// A file's line count for the map, remembered by size and modification time: a reload only reads the files that
/// changed since, which matters in repos with thousands of files.
fn line_count(top: &str, path: &str) -> u64 {
    let file = join(top, path);
    *cached(&LINE_COUNTS, &file, || count_lines(&file))
}

fn count_lines(file: &str) -> u64 {
    use std::io::Read;
    let mut start = Vec::new();
    let read = std::fs::File::open(file).and_then(|opened| opened.take(COUNTED_BYTES).read_to_end(&mut start));
    if read.is_err() {
        return 0;
    }
    if start[..start.len().min(BINARY_CHECK_BYTES)].contains(&0) {
        return BINARY_SIZE;
    }
    (start.iter().filter(|byte| **byte == b'\n').count() as u64).max(1)
}
