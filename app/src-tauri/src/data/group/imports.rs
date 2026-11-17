//! Which changed files a changed file imports. Rust and Go have their own rules (rust.rs, go.rs); JS/TS and Python
//! imports are read with one pattern each and matched against the changed files here.
use super::tsconfig::{AliasCache, Aliases, aliases_for};
use super::{CODE_EXT, go, rust};
use crate::data::paths::{dirname, join, normpath, splitext};
use regex::Regex;
use std::collections::BTreeSet;
use std::sync::LazyLock;

static JS_IMPORT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap()
});
static PY_IMPORT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*(?:from\s+(\.+[\w.]*|[\w.]+)\s+import|import\s+([\w.]+))").unwrap());

/// The changed files (`known`) that `file` imports. Imports of anything else don't count.
pub(super) fn imports_of(
    repo: &str,
    file: &str,
    text: &str,
    known: &BTreeSet<String>,
    alias_cache: &mut AliasCache,
) -> Vec<String> {
    if file.ends_with(".rs") {
        return rust::imports(repo, file, text, known);
    }
    if file.ends_with(".go") {
        return go::imports(repo, file, text, known);
    }
    let python = file.ends_with(".py");
    let no_aliases = Aliases::default();
    let (pattern, aliases) = if python {
        (&*PY_IMPORT, &no_aliases)
    } else {
        (&*JS_IMPORT, aliases_for(repo, file, alias_cache))
    };
    // Each match holds the imported name in whichever group its form of import uses.
    let specs = pattern.captures_iter(text).flat_map(|found| {
        found
            .iter()
            .skip(1)
            .flatten()
            .map(|spec| spec.as_str().to_string())
            .collect::<Vec<_>>()
    });
    specs.filter_map(|spec| resolve(&spec, file, known, aliases)).collect()
}

/// Map an import specifier to a changed file path, if it is one.
fn resolve(spec: &str, importer: &str, known: &BTreeSet<String>, aliases: &Aliases) -> Option<String> {
    if importer.ends_with(".py") {
        python_target(spec, importer, known)
    } else {
        js_target(spec, importer, known, aliases)
    }
}

fn js_target(spec: &str, importer: &str, known: &BTreeSet<String>, aliases: &Aliases) -> Option<String> {
    if spec.starts_with('.') {
        return pick(&normpath(&join(dirname(importer), spec)), known);
    }
    // Not relative: an alias from tsconfig/jsconfig ("@/components/x"), a path from its baseUrl, or a package.
    for alias in &aliases.paths {
        let Some(rest) = spec
            .strip_prefix(alias.prefix.as_str())
            .and_then(|rest| rest.strip_suffix(alias.suffix.as_str()))
        else {
            continue;
        };
        let targets = alias
            .targets
            .iter()
            .map(|target| normpath(&target.replacen('*', rest, 1)));
        if let Some(file) = targets.into_iter().find_map(|target| pick(&target, known)) {
            return Some(file);
        }
    }
    aliases
        .base_url
        .as_ref()
        .and_then(|base_url| pick(&normpath(&join(base_url, spec)), known))
}

fn python_target(spec: &str, importer: &str, known: &BTreeSet<String>) -> Option<String> {
    let candidate = if spec.starts_with('.') {
        // Relative: one dot is the importer's folder, each further dot one folder up.
        let dots = spec.len() - spec.trim_start_matches('.').len();
        let mut folder = dirname(importer).to_string();
        for _ in 0..dots.saturating_sub(1) {
            folder = dirname(&folder).to_string();
        }
        let rest = spec.trim_start_matches('.').replace('.', "/");
        if rest.is_empty() {
            folder
        } else {
            normpath(&join(&folder, &rest))
        }
    } else {
        spec.replace('.', "/")
    };
    if let Some(file) = pick(&candidate, known) {
        return Some(file);
    }
    // python absolute imports may be relative to any parent dir
    let tail = format!("/{candidate}.py");
    known.iter().find(|file| file.ends_with(&tail)).cloned()
}

/// The changed file a path means, trying the usual extensions and index files; None when it isn't a changed file.
fn pick(path: &str, known: &BTreeSet<String>) -> Option<String> {
    let mut candidates = vec![path.to_string()];
    candidates.extend(CODE_EXT.iter().map(|ext| format!("{path}{ext}")));
    candidates.extend(CODE_EXT.iter().map(|ext| format!("{path}/index{ext}")));
    candidates.push(format!("{path}/__init__.py"));
    if let Some(file) = candidates.into_iter().find(|candidate| known.contains(candidate)) {
        return Some(file);
    }
    // strip a .js extension written for a .ts source
    let (without_ext, _) = splitext(path);
    CODE_EXT
        .iter()
        .map(|ext| format!("{without_ext}{ext}"))
        .find(|candidate| known.contains(candidate))
}

#[cfg(test)]
mod tests {
    use super::super::tsconfig::PathAlias;
    use super::*;

    #[test]
    fn aliases() {
        let known: BTreeSet<String> = [
            "app/src/components/Said.tsx",
            "app/src/lib/utils.ts",
            "app/src/lib/index.ts",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let at_sign = PathAlias {
            prefix: "@/".into(),
            suffix: "".into(),
            targets: vec!["app/src/*".into()],
        };
        let a = Aliases {
            base_url: None,
            paths: vec![at_sign],
        };
        assert_eq!(
            resolve("@/components/Said", "app/src/App.tsx", &known, &a).as_deref(),
            Some("app/src/components/Said.tsx")
        );
        assert_eq!(
            resolve("@/lib", "app/src/App.tsx", &known, &a).as_deref(),
            Some("app/src/lib/index.ts")
        );
        assert_eq!(resolve("react", "app/src/App.tsx", &known, &a), None);
        let b = Aliases {
            base_url: Some("app/src".into()),
            paths: vec![],
        };
        assert_eq!(
            resolve("lib/utils", "app/src/App.tsx", &known, &b).as_deref(),
            Some("app/src/lib/utils.ts")
        );
    }
}
