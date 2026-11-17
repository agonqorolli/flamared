//! Rust imports: `use crate::a::b`, `use super::x`, `use self::y::{z, w}`, `mod name;`, and the crate's own name from
//! examples and tests. A path resolves to the longest prefix that is a changed file (the rest names items).
use super::nearest;
use crate::data::paths::{dirname, join};
use regex::Regex;
use std::collections::BTreeSet;
use std::sync::LazyLock;

static USE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);").unwrap());
static MOD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;").unwrap());
static CRATE_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?m)^\s*name\s*=\s*"([^"]+)""#).unwrap());

/// The crate a file is in: its src folder and the names other code uses for it (package and lib name).
struct Crate {
    src: String,
    names: Vec<String>,
}

impl Crate {
    fn of(repo: &str, file: &str) -> Option<Crate> {
        let (dir, cargo_toml) = nearest(repo, dirname(file), "Cargo.toml")?;
        let names = CRATE_NAME
            .captures_iter(&cargo_toml)
            .map(|found| found[1].replace('-', "_"))
            .collect();
        Some(Crate {
            src: join(&dir, "src"),
            names,
        })
    }
}

/// The changed files a Rust file imports.
pub(super) fn imports(repo: &str, file: &str, text: &str, known: &BTreeSet<String>) -> Vec<String> {
    let Some(this_crate) = Crate::of(repo, file) else {
        return vec![];
    };
    let here = module_of(file, &this_crate.src);
    let mut targets = Vec::new();
    for path in written_paths(text, &this_crate.names) {
        let Some(module) = module_from_root(&path, &this_crate.names, here.as_deref()) else {
            continue;
        };
        // Longest prefix that is a file; the crate root (lib.rs) when the item is defined there.
        let mut prefix_lengths = (0..=module.len()).rev();
        if let Some(target) = prefix_lengths.find_map(|n| file_of(&this_crate.src, &module[..n], known)) {
            targets.push(target);
        }
    }
    // `mod name;` names a file of this module.
    if let Some(here) = &here {
        for found in MOD.captures_iter(text) {
            let mut module = here.clone();
            module.push(found[1].to_string());
            targets.extend(file_of(&this_crate.src, &module, known));
        }
    }
    targets
}

/// Every module path a file writes: in its `use` lines (with `{…}` groups expanded), and inline, like
/// `crate::data::git::git(…)` or `app_lib::run()`.
fn written_paths(text: &str, crate_names: &[String]) -> Vec<String> {
    let mut paths: Vec<String> = USE
        .captures_iter(text)
        .flat_map(|found| expand_use(&found[1]))
        .collect();
    // Inline matches skip lines that are comments, and `a::{…}` (those come from `use` lines, expanded above).
    let code: String = text
        .lines()
        .filter(|line| !line.trim_start().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    let roots = std::iter::once("crate").chain(crate_names.iter().map(String::as_str));
    let inline_paths: Vec<Regex> = roots
        .map(|root| Regex::new(&format!(r"\b({}(?:::\w+)+)(::\{{)?", regex::escape(root))).unwrap())
        .collect();
    for pattern in &inline_paths {
        let found = pattern.captures_iter(&code).filter(|found| found.get(2).is_none());
        paths.extend(found.map(|found| found[1].to_string()));
    }
    paths
}

/// `a::{b, c::{d, e}}` -> a::b, a::c::d, a::c::e
fn expand_use(tree: &str) -> Vec<String> {
    let tree = tree.trim();
    let Some(open) = tree.find('{') else {
        return vec![tree.to_string()];
    };
    let prefix = tree[..open].trim_end_matches(':').trim();
    let inner = &tree[open + 1..tree.rfind('}').unwrap_or(tree.len())];
    // Split the group at its own commas, not the ones inside nested groups.
    let (mut parts, mut depth, mut start) = (Vec::new(), 0, 0);
    for (i, c) in inner.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&inner[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&inner[start..]);
    parts
        .into_iter()
        .filter(|part| !part.trim().is_empty())
        .flat_map(expand_use)
        .map(|path| {
            if prefix.is_empty() {
                path
            } else {
                format!("{prefix}::{path}")
            }
        })
        .collect()
}

/// The module a written path means, counted from the crate root: `self` and `super` are worked out from `here`,
/// the module of the file it is written in. None for std and other crates, and for a path that names no module.
fn module_from_root(path: &str, crate_names: &[String], here: Option<&[String]>) -> Option<Vec<String>> {
    let path = path.split(" as ").next().unwrap_or(path).trim();
    let mut segments: Vec<String> = path
        .split("::")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "*")
        .collect();
    let mut module: Vec<String> = match segments.first().map(String::as_str) {
        Some("crate") => vec![],
        Some(name) if crate_names.iter().any(|crate_name| crate_name == name) => vec![],
        Some("self") | Some("super") => here?.to_vec(),
        _ => return None, // std or another crate
    };
    let lead = segments.remove(0);
    if lead == "super" {
        module.pop();
        while segments.first().is_some_and(|segment| segment == "super") {
            segments.remove(0);
            module.pop();
        }
    }
    segments.retain(|segment| segment != "self");
    if segments.is_empty() {
        return None; // `use super::*` in a test module: the parent's own items, not another file
    }
    module.extend(segments);
    Some(module)
}

/// A file's module path inside its crate (src/data/group.rs -> [data, group]; lib.rs, main.rs -> []); None outside src.
fn module_of(file: &str, src: &str) -> Option<Vec<String>> {
    let relative = file.strip_prefix(&format!("{src}/"))?.strip_suffix(".rs")?;
    let mut segments: Vec<String> = relative.split('/').map(String::from).collect();
    let is_crate_root = segments.len() == 1 && (segments[0] == "lib" || segments[0] == "main");
    if segments.last().is_some_and(|last| last == "mod") || is_crate_root {
        segments.pop();
    }
    Some(segments)
}

/// The changed file for a module path: src/a/b.rs or src/a/b/mod.rs (the crate root for an empty path).
fn file_of(src: &str, module: &[String], known: &BTreeSet<String>) -> Option<String> {
    let candidates = if module.is_empty() {
        vec![join(src, "lib.rs"), join(src, "main.rs")]
    } else {
        let path = join(src, &module.join("/"));
        vec![format!("{path}.rs"), join(&path, "mod.rs")]
    };
    candidates.into_iter().find(|candidate| known.contains(candidate))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn use_trees() {
        assert_eq!(
            expand_use("crate::data::{git, paths::{realpath, join}}"),
            vec![
                "crate::data::git",
                "crate::data::paths::realpath",
                "crate::data::paths::join"
            ]
        );
        assert_eq!(expand_use("super::git::git_or_empty"), vec!["super::git::git_or_empty"]);
    }

    #[test]
    fn rust_modules() {
        assert_eq!(
            module_of("app/src/data/group.rs", "app/src"),
            Some(vec!["data".into(), "group".into()])
        );
        assert_eq!(module_of("app/src/data/mod.rs", "app/src"), Some(vec!["data".into()]));
        assert_eq!(module_of("app/src/lib.rs", "app/src"), Some(vec![]));
        assert_eq!(module_of("app/examples/dump.rs", "app/src"), None);
    }
}
