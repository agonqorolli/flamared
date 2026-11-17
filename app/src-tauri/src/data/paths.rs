//! Small path helpers on plain strings, named after and behaving like Python's os.path; the grouping rules rely on
//! those rules (what counts as an extension, how ".." folds).
use std::path::Path;

pub fn dirname(path: &str) -> &str {
    path.rfind('/').map(|slash| &path[..slash]).unwrap_or("")
}

pub fn basename(path: &str) -> &str {
    path.rfind('/').map(|slash| &path[slash + 1..]).unwrap_or(path)
}

/// (stem, ext) like os.path.splitext: leading dots of the name don't start an extension.
pub fn splitext(path: &str) -> (&str, &str) {
    let name_start = path.rfind('/').map(|slash| slash + 1).unwrap_or(0);
    let name = &path[name_start..];
    let leading_dots = name.len() - name.trim_start_matches('.').len();
    match name[leading_dots..].rfind('.') {
        Some(dot) => path.split_at(name_start + leading_dots + dot),
        None => (path, ""),
    }
}

/// `path` inside `folder`; an absolute `path` (or no folder) stays as it is.
pub fn join(folder: &str, path: &str) -> String {
    if folder.is_empty() || path.starts_with('/') {
        path.to_string()
    } else {
        format!("{}/{}", folder.trim_end_matches('/'), path)
    }
}

/// os.path.normpath for relative repo paths: folds "." and "..".
pub fn normpath(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if matches!(parts.last(), Some(last) if *last != "..") {
                    parts.pop();
                } else if !path.starts_with('/') {
                    parts.push("..");
                }
            }
            name => parts.push(name),
        }
    }
    let folded = parts.join("/");
    if path.starts_with('/') {
        format!("/{folded}")
    } else if folded.is_empty() {
        ".".into()
    } else {
        folded
    }
}

/// os.path.realpath: resolves links of the parts that exist (a deleted file still gets its folder resolved).
pub fn realpath(path: &str) -> String {
    if let Ok(real) = std::fs::canonicalize(path) {
        return real.to_string_lossy().into_owned();
    }
    let given = Path::new(path);
    match (given.parent(), given.file_name()) {
        (Some(parent), Some(name)) if !parent.as_os_str().is_empty() => {
            let real_parent = realpath(&parent.to_string_lossy());
            Path::new(&real_parent).join(name).to_string_lossy().into_owned()
        }
        _ => path.to_string(),
    }
}

/// The repo root (checkout or worktree) a path lives in, the longest match, or None.
pub fn root_of<'a>(path: &str, roots: &'a [String]) -> Option<&'a str> {
    let holding = roots
        .iter()
        .filter(|root| path == root.as_str() || path.starts_with(&format!("{root}/")));
    holding.max_by_key(|root| root.len()).map(|root| root.as_str())
}

/// `path` as seen from `root`; "." for the root itself.
pub fn relpath(path: &str, root: &str) -> String {
    let inside = path.strip_prefix(root).map(|rest| rest.trim_start_matches('/'));
    inside.filter(|rest| !rest.is_empty()).unwrap_or(".").to_string()
}

pub fn home() -> String {
    std::env::var("HOME").unwrap_or_default()
}

/// First n characters (not bytes), like a Python slice.
pub fn take(text: &str, n: usize) -> String {
    text.chars().take(n).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn os_path_semantics() {
        assert_eq!(splitext("a/b.test.ts"), ("a/b.test", ".ts"));
        assert_eq!(splitext(".env"), (".env", ""));
        assert_eq!(splitext("a/.eslintrc.json"), ("a/.eslintrc", ".json"));
        assert_eq!(normpath("src/a/../b/./c"), "src/b/c");
        assert_eq!(normpath("../x"), "../x");
        assert_eq!(dirname("x.ts"), "");
        assert_eq!(join("", "b"), "b");
    }
}
