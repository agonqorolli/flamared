//! Small path helpers with Python's os.path semantics, which the grouping rules were written against.
use std::path::Path;

pub fn dirname(p: &str) -> &str {
    p.rfind('/').map(|i| &p[..i]).unwrap_or("")
}

pub fn basename(p: &str) -> &str {
    p.rfind('/').map(|i| &p[i + 1..]).unwrap_or(p)
}

/// (stem, ext) like os.path.splitext: leading dots of the name don't start an extension.
pub fn splitext(p: &str) -> (&str, &str) {
    let name_start = p.rfind('/').map(|i| i + 1).unwrap_or(0);
    let name = &p[name_start..];
    let lead = name.len() - name.trim_start_matches('.').len();
    match name[lead..].rfind('.') {
        Some(i) => p.split_at(name_start + lead + i),
        None => (p, ""),
    }
}

pub fn join(a: &str, b: &str) -> String {
    if a.is_empty() || b.starts_with('/') {
        b.to_string()
    } else {
        format!("{}/{}", a.trim_end_matches('/'), b)
    }
}

/// os.path.normpath for relative repo paths: folds "." and "..".
pub fn normpath(p: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for part in p.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if matches!(out.last(), Some(l) if *l != "..") {
                    out.pop();
                } else if !p.starts_with('/') {
                    out.push("..");
                }
            }
            x => out.push(x),
        }
    }
    let s = out.join("/");
    if p.starts_with('/') {
        format!("/{s}")
    } else if s.is_empty() {
        ".".into()
    } else {
        s
    }
}

/// os.path.realpath: resolves links of the parts that exist (a deleted file still gets its folder resolved).
pub fn realpath(p: &str) -> String {
    if let Ok(r) = std::fs::canonicalize(p) {
        return r.to_string_lossy().into_owned();
    }
    let path = Path::new(p);
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) if !parent.as_os_str().is_empty() => Path::new(&realpath(&parent.to_string_lossy()))
            .join(name)
            .to_string_lossy()
            .into_owned(),
        _ => p.to_string(),
    }
}

/// The repo root (checkout or worktree) a path lives in, the longest match, or None.
pub fn root_of<'a>(path: &str, roots: &'a [String]) -> Option<&'a str> {
    roots
        .iter()
        .filter(|r| path == r.as_str() || path.starts_with(&format!("{r}/")))
        .max_by_key(|r| r.len())
        .map(|s| s.as_str())
}

pub fn relpath(path: &str, root: &str) -> String {
    path.strip_prefix(root)
        .map(|s| s.trim_start_matches('/').to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| ".".into())
}

pub fn home() -> String {
    std::env::var("HOME").unwrap_or_default()
}

/// First n characters (not bytes), like a Python slice.
pub fn take(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
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
