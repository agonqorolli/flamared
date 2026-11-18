//! Go imports: an import names a package (a folder) under the module path from go.mod; every changed .go file in
//! that folder counts. Files in the same folder are one package, so they count as connected too.
use super::{Configs, nearest};
use crate::data::paths::{dirname, join, normpath};
use regex::Regex;
use std::collections::BTreeSet;
use std::sync::LazyLock;

static MODULE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^module\s+(\S+)").unwrap());
static IMPORT_ONE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?m)^\s*import\s+(?:[\w.]+\s+)?"([^"]+)""#).unwrap());
static IMPORT_BLOCK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?s)import\s*\((.*?)\)").unwrap());
static IMPORT_IN_BLOCK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?m)^\s*(?:[\w.]+\s+)?"([^"]+)""#).unwrap());

/// The changed files a Go file imports, with the other files of its own package.
pub(super) fn imports(configs: &Configs, file: &str, text: &str, known: &BTreeSet<String>) -> Vec<String> {
    let Some((module_dir, go_mod)) = nearest(configs, dirname(file), "go.mod") else {
        return vec![];
    };
    let Some(module) = MODULE.captures(&go_mod).map(|found| found[1].to_string()) else {
        return vec![];
    };
    let mut imported: Vec<String> = IMPORT_ONE
        .captures_iter(text)
        .map(|found| found[1].to_string())
        .collect();
    for block in IMPORT_BLOCK.captures_iter(text) {
        imported.extend(
            IMPORT_IN_BLOCK
                .captures_iter(&block[1])
                .map(|found| found[1].to_string()),
        );
    }
    let package_files = |package: &str| -> Vec<String> {
        let in_package =
            |path: &&String| path.ends_with(".go") && !path.ends_with("_test.go") && dirname(path) == package;
        known.iter().filter(in_package).cloned().collect()
    };
    let mut targets = package_files(dirname(file)); // same package
    for package in imported {
        if let Some(folder) = package.strip_prefix(&format!("{module}/")) {
            targets.extend(package_files(&normpath(&join(&module_dir, folder))));
        } else if package == module {
            targets.extend(package_files(&module_dir));
        }
    }
    targets
}
