//! Import aliases from tsconfig.json / jsconfig.json, like "@/*" -> "./src/*".
use crate::data::paths::{dirname, join, normpath};
use crate::data::tree::read_text;
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

static TRAILING_COMMA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r",(\s*[}\]])").unwrap());

/// How many "references" deep a config is followed looking for aliases.
const MAX_REFERENCE_DEPTH: u8 = 2;

/// The aliases one config file sets. Paths are repo-relative.
#[derive(Default, Clone)]
pub(super) struct Aliases {
    /// The folder bare imports may be relative to ("baseUrl").
    pub(super) base_url: Option<String>,
    pub(super) paths: Vec<PathAlias>,
}

/// One "paths" entry: an import written `prefix<something>suffix` means each target with `*` replaced by that
/// something.
#[derive(Clone)]
pub(super) struct PathAlias {
    pub(super) prefix: String,
    pub(super) suffix: String,
    pub(super) targets: Vec<String>,
}

impl Aliases {
    fn is_empty(&self) -> bool {
        self.base_url.is_none() && self.paths.is_empty()
    }
}

/// The aliases already read, by the folder of the importing file.
pub(super) type AliasCache = HashMap<String, Aliases>;

/// The aliases that apply to a file: from the nearest tsconfig.json or jsconfig.json above it. Cached per folder.
pub(super) fn aliases_for<'a>(repo: &str, file: &str, cache: &'a mut AliasCache) -> &'a Aliases {
    let folder = dirname(file).to_string();
    if !cache.contains_key(&folder) {
        cache.insert(folder.clone(), nearest_aliases(repo, &folder));
    }
    &cache[&folder]
}

fn nearest_aliases(repo: &str, folder: &str) -> Aliases {
    let mut dir = folder.to_string();
    loop {
        let configs = ["tsconfig.json", "jsconfig.json"];
        if let Some(aliases) = configs.iter().find_map(|name| read_aliases(repo, &join(&dir, name), 0)) {
            return aliases;
        }
        if dir.is_empty() {
            return Aliases::default();
        }
        dir = dirname(&dir).to_string();
    }
}

/// Aliases from one config file (repo-relative path), following "references" when it has none of its own. None
/// when the file is missing or isn't valid JSON.
fn read_aliases(repo: &str, config: &str, depth: u8) -> Option<Aliases> {
    let json: serde_json::Value = serde_json::from_str(&strip_jsonc(&read_text(repo, config)?)).ok()?;
    let dir = dirname(config);
    let options = json.get("compilerOptions");
    let base_url = options
        .and_then(|o| o.get("baseUrl"))
        .and_then(|b| b.as_str())
        .map(|b| normpath(&join(dir, b)));
    // "paths" targets are relative to baseUrl, or to the config's folder without one.
    let root = base_url
        .clone()
        .unwrap_or_else(|| if dir.is_empty() { ".".into() } else { dir.to_string() });
    let mut paths = Vec::new();
    for (pattern, targets) in options
        .and_then(|o| o.get("paths"))
        .and_then(|p| p.as_object())
        .into_iter()
        .flatten()
    {
        let (prefix, suffix) = pattern.split_once('*').unwrap_or((pattern.as_str(), ""));
        let targets = targets
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|target| target.as_str());
        paths.push(PathAlias {
            prefix: prefix.to_string(),
            suffix: suffix.to_string(),
            targets: targets.map(|target| normpath(&join(&root, target))).collect(),
        });
    }
    let aliases = Aliases { base_url, paths };
    if !aliases.is_empty() || depth > MAX_REFERENCE_DEPTH {
        return Some(aliases);
    }
    // Vite-style setups keep the aliases in a referenced tsconfig.app.json.
    let references = json
        .get("references")
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();
    references
        .iter()
        .filter_map(|reference| reference.get("path").and_then(|path| path.as_str()))
        .map(|path| normpath(&join(dir, path)))
        .map(|path| {
            if path.ends_with(".json") {
                path
            } else {
                join(&path, "tsconfig.json")
            }
        })
        .find_map(|path| read_aliases(repo, &path, depth + 1).filter(|found| !found.is_empty()))
        .or(Some(Aliases::default()))
}

/// tsconfig files allow comments and trailing commas; strip both so it parses as JSON.
fn strip_jsonc(text: &str) -> String {
    let (mut out, mut chars, mut in_string) = (String::new(), text.chars().peekable(), false);
    while let Some(c) = chars.next() {
        if in_string {
            out.push(c);
            if c == '\\' {
                out.extend(chars.next());
            } else if c == '"' {
                in_string = false;
            }
        } else if c == '"' {
            in_string = true;
            out.push(c);
        } else if c == '/' && chars.peek() == Some(&'/') {
            // A line comment: skip to the end of the line, which stays.
            for c in chars.by_ref() {
                if c == '\n' {
                    out.push('\n');
                    break;
                }
            }
        } else if c == '/' && chars.peek() == Some(&'*') {
            // A block comment: skip past its closing "*/".
            chars.next();
            let mut previous = ' ';
            for c in chars.by_ref() {
                if previous == '*' && c == '/' {
                    break;
                }
                previous = c;
            }
        } else {
            out.push(c);
        }
    }
    TRAILING_COMMA.replace_all(&out, "$1").into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jsonc() {
        let t = "{\n // c\n \"a\": \"//not a comment\", /* b */ \"x\": [1,],\n}";
        let v: serde_json::Value = serde_json::from_str(&strip_jsonc(t)).unwrap();
        assert_eq!(v["a"], "//not a comment");
        assert_eq!(v["x"][0], 1);
    }
}
