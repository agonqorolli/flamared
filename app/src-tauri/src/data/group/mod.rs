//! Group a change set "by logic" without AI.
//!
//! Logic groups = connected components of changed code files linked by imports.
//! Tests attach to the group of the source file with the same stem.
//! Everything else is grouped by kind (deps, config, infra, docs, assets).
mod go;
mod imports;
mod order;
mod rust;
mod symbols;
mod tsconfig;

use super::diff::{changed_files, diff_by_file, numstat};
use super::git::git_or_empty;
use super::paths::{basename, dirname, join, splitext};
use super::tree::At;
use imports::imports_of;
use indexmap::IndexMap;
use order::{reading_order, tests_in_order};
use regex::Regex;
use std::cell::RefCell;
use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::LazyLock;
use tsconfig::AliasCache;

const CODE_EXT: &[&str] = &[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs", ".go"];
/// A changed file imported by this many other changed files is "shared".
const HUB_MIN_IMPORTERS: usize = 3;
/// A changed file importing this many changed files is a "registry" (index, Root).
const REGISTRY_MIN_IMPORTS: usize = 4;

pub static TEST_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\.(test|spec)\.[^.]+$)|(^test_.*\.py$)|(_test\.py$)|(_test\.go$)").unwrap());
/// What a file that isn't code is, by its path. The first match wins; anything else is "other".
static KINDS: LazyLock<Vec<(&str, Regex)>> = LazyLock::new(|| {
    vec![
        ("deps", Regex::new(r"(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|Cargo\.(toml|lock)|go\.(mod|sum))$").unwrap()),
        ("infra", Regex::new(r"(^|/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|\.github/.*|Makefile)$").unwrap()),
        ("docs", Regex::new(r"(?i)\.(md|mdx|txt|rst)$").unwrap()),
        ("assets", Regex::new(r"(?i)\.(png|jpe?g|gif|webp|svg|ttf|otf|woff2?|wav|mp3|mp4|mov|pdf)$").unwrap()),
        ("config", Regex::new(r"(\.(json|ya?ml|toml|ini|cfg)$)|(^|/)\.env|\.config\.[^/]+$").unwrap()),
    ]
});

/// Changed code files that belong together, named after the most connected one.
pub struct Group {
    pub name: String,
    /// In reading order: each file after the files of the group it imports.
    pub files: Vec<String>,
    pub tests: Vec<String>,
    pub shared: bool,
    pub registry: bool,
    /// For a shared file: how many changed files import it.
    pub used_by: usize,
    /// For a registry: how many changed files it imports.
    pub imports: usize,
    /// The shared files this group imports, by name.
    pub uses: Vec<String>,
    /// name -> (kind '+' added, '-' removed, '~' changed; file it is in), in the order found
    pub symbols: IndexMap<String, (char, String)>,
    pub add: u64,
    pub rem: u64,
}

pub struct Grouping {
    /// changed path -> status letter, in git's order, untracked files last (as "A")
    pub files: IndexMap<String, String>,
    pub groups: Vec<Group>,
    pub loose_tests: Vec<String>,
    /// kind -> the changed files that aren't code
    pub support: BTreeMap<String, Vec<String>>,
    /// changed path -> (lines added, lines removed)
    pub stats: HashMap<String, (u64, u64)>,
    /// changed file -> changed files importing it
    pub importers: BTreeMap<String, Vec<String>>,
}

pub fn group(repo: &str, base: &str, at: &At) -> Result<Grouping, String> {
    let files = changed_files(repo, base, at)?;
    let mut stats = numstat(repo, base, at)?;
    let code = CodeFiles::among(&files);
    let texts: HashMap<String, String> = code
        .all
        .iter()
        .map(|path| (path.clone(), text_of(repo, path, &files[path], base, at)))
        .collect();
    for path in &code.all {
        if files[path] == "A" && !stats.contains_key(path) {
            stats.insert(path.clone(), (texts[path].lines().count() as u64, 0)); // untracked: numstat doesn't see it
        }
    }

    let mut links = Links::between(&Configs::new(repo, at), &code, &texts);
    // Widely imported files (theme, utils) would glue everything into one group.
    // Keep them as their own "shared" group and cut their edges before clustering.
    let hubs = Hubs::among(&code, &links);
    for hub in hubs.shared.iter().chain(&hubs.registries) {
        links.cut(hub);
    }
    let components = components(&code, &links);
    let (mut tests_of, loose_tests) = attach_tests(&code, &components, &links);

    let change = Change {
        stats: &stats,
        texts: &texts,
        declaration_diffs: diff_by_file(repo, at, &["-U0"], base),
        untracked: at.untracked(repo).into_iter().collect(),
        links: &links,
        hubs: &hubs,
    };
    let mut groups: Vec<Group> = components
        .iter()
        .enumerate()
        .map(|(i, files)| change.group(files, tests_of.remove(&i).unwrap_or_default()))
        .collect();
    groups.sort_by_key(|group| (Reverse(group.files.len()), Reverse(group.add + group.rem)));

    let mut support: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for path in files.keys().filter(|path| !code.known.contains(*path)) {
        support.entry(kind_of(path).to_string()).or_default().push(path.clone());
    }
    let importers = links
        .importers
        .iter()
        .map(|(file, by)| (file.clone(), by.iter().cloned().collect()))
        .collect();
    Ok(Grouping {
        files,
        groups,
        loose_tests,
        support,
        stats,
        importers,
    })
}

/// The changed code files, sorted into what the grouping asks about them.
struct CodeFiles {
    /// Every changed code file, in git's order.
    all: Vec<String>,
    /// The same as a set: an import only counts when it names one of these.
    known: BTreeSet<String>,
    tests: BTreeSet<String>,
    /// The ones that aren't tests, in git's order.
    sources: Vec<String>,
}

impl CodeFiles {
    fn among(files: &IndexMap<String, String>) -> CodeFiles {
        let all: Vec<String> = files
            .keys()
            .filter(|path| CODE_EXT.contains(&splitext(path).1))
            .cloned()
            .collect();
        let known = all.iter().cloned().collect();
        let tests: BTreeSet<String> = all
            .iter()
            .filter(|path| TEST_RE.is_match(basename(path)))
            .cloned()
            .collect();
        let sources = all.iter().filter(|path| !tests.contains(*path)).cloned().collect();
        CodeFiles {
            all,
            known,
            tests,
            sources,
        }
    }
}

/// A changed file's text: as it is now, or as it was at the base when the change deleted it.
fn text_of(repo: &str, path: &str, status: &str, base: &str, at: &At) -> String {
    if status == "D" {
        return git_or_empty(repo, &["show", &format!("{base}:{path}")]);
    }
    at.read(repo, path).unwrap_or_default()
}

/// The config files imports are resolved with (tsconfig/jsconfig, `Cargo.toml`, `go.mod`), read from the version
/// being shown: the working folder, or the viewed branch's commit. Each file is read once.
struct Configs<'a> {
    repo: &'a str,
    at: &'a At,
    texts: RefCell<HashMap<String, Option<String>>>,
}

impl<'a> Configs<'a> {
    fn new(repo: &'a str, at: &'a At) -> Configs<'a> {
        Configs {
            repo,
            at,
            texts: RefCell::new(HashMap::new()),
        }
    }

    /// A config file's text (repo-relative path); None when it doesn't exist in this version.
    fn read(&self, path: &str) -> Option<String> {
        self.texts
            .borrow_mut()
            .entry(path.to_string())
            .or_insert_with(|| self.at.read(self.repo, path))
            .clone()
    }
}

/// The nearest file called `name` in `dir` or in a folder above it: the folder it is in, and its text.
fn nearest(configs: &Configs, dir: &str, name: &str) -> Option<(String, String)> {
    let mut dir = dir.to_string();
    loop {
        if let Some(text) = configs.read(&join(&dir, name)) {
            return Some((dir, text));
        }
        if dir.is_empty() {
            return None;
        }
        dir = dirname(&dir).to_string();
    }
}

/// Import links between changed code files.
#[derive(Default)]
struct Links {
    /// file -> the files it is linked to, in either direction. Clustering follows these.
    neighbors: HashMap<String, BTreeSet<String>>,
    /// file -> the files importing it
    importers: HashMap<String, BTreeSet<String>>,
    /// file -> the files it imports
    imports: HashMap<String, BTreeSet<String>>,
}

impl Links {
    fn between(configs: &Configs, code: &CodeFiles, texts: &HashMap<String, String>) -> Links {
        let mut links = Links::default();
        let mut alias_cache = AliasCache::new(); // tsconfig/jsconfig aliases per folder
        for file in &code.all {
            for target in imports_of(configs, file, &texts[file], &code.known, &mut alias_cache) {
                if &target != file {
                    links.add(file, target);
                }
            }
        }
        links
    }

    fn add(&mut self, importer: &str, target: String) {
        self.neighbors
            .entry(importer.to_string())
            .or_default()
            .insert(target.clone());
        self.neighbors
            .entry(target.clone())
            .or_default()
            .insert(importer.to_string());
        self.imports
            .entry(importer.to_string())
            .or_default()
            .insert(target.clone());
        self.importers.entry(target).or_default().insert(importer.to_string());
    }

    /// Takes a file out of the clustering: it is nobody's neighbor any more. Who imports whom stays.
    fn cut(&mut self, file: &str) {
        for neighbor in self.neighbors.remove(file).unwrap_or_default() {
            if let Some(theirs) = self.neighbors.get_mut(&neighbor) {
                theirs.remove(file);
            }
        }
    }
}

/// How many of `files` are not in `left_out`.
fn count_outside(files: Option<&BTreeSet<String>>, left_out: &BTreeSet<String>) -> usize {
    files.map_or(0, |files| files.difference(left_out).count())
}

/// The widely connected files, which are grouped on their own.
struct Hubs {
    /// Imported by many changed files (tests don't count).
    shared: BTreeSet<String>,
    /// Importing many changed files (shared ones don't count).
    registries: BTreeSet<String>,
}

impl Hubs {
    fn among(code: &CodeFiles, links: &Links) -> Hubs {
        let is_shared = |file: &&String| count_outside(links.importers.get(*file), &code.tests) >= HUB_MIN_IMPORTERS;
        let shared: BTreeSet<String> = code.sources.iter().filter(is_shared).cloned().collect();
        let is_registry = |file: &&String| {
            !shared.contains(*file) && count_outside(links.imports.get(*file), &shared) >= REGISTRY_MIN_IMPORTS
        };
        let registries = code.sources.iter().filter(is_registry).cloned().collect();
        Hubs { shared, registries }
    }
}

/// Connected components over source files (tests excluded so they attach by name), in git's order.
fn components(code: &CodeFiles, links: &Links) -> Vec<Vec<String>> {
    let mut seen = HashSet::new();
    let mut components: Vec<Vec<String>> = Vec::new();
    for start in &code.sources {
        if !seen.insert(start.clone()) {
            continue;
        }
        let (mut todo, mut component) = (vec![start.clone()], Vec::new());
        while let Some(file) = todo.pop() {
            for neighbor in links.neighbors.get(&file).into_iter().flatten() {
                if !code.tests.contains(neighbor) && seen.insert(neighbor.clone()) {
                    todo.push(neighbor.clone());
                }
            }
            component.push(file);
        }
        components.push(component);
    }
    components
}

/// Puts each test with a component: the one holding the source file of the same name, else one the test is linked
/// to. Returns each component's tests (by the component's position) and the tests that fit nowhere.
fn attach_tests(
    code: &CodeFiles,
    components: &[Vec<String>],
    links: &Links,
) -> (HashMap<usize, Vec<String>>, Vec<String>) {
    let component_of: HashMap<&String, usize> = components
        .iter()
        .enumerate()
        .flat_map(|(i, files)| files.iter().map(move |file| (file, i)))
        .collect();
    let mut attached: HashMap<usize, Vec<String>> = HashMap::new();
    let mut loose = Vec::new();
    for test in &code.tests {
        let name = stem(test);
        let same_name = code.sources.iter().find(|source| stem(source) == name);
        let by_name = same_name.and_then(|source| component_of.get(source).copied());
        let by_import = || {
            let linked = links.neighbors.get(test).into_iter().flatten();
            linked.into_iter().find_map(|file| component_of.get(file).copied())
        };
        match by_name.or_else(by_import) {
            Some(i) => attached.entry(i).or_default().push(test.clone()),
            None => loose.push(test.clone()),
        }
    }
    (attached, loose)
}

/// A file's name without its extension and without what marks it as a test, so a test and its source match.
fn stem(path: &str) -> String {
    let mut name = basename(path).to_string();
    for marker in [".test.", ".spec."] {
        if let Some(i) = name.find(marker) {
            name.replace_range(i..i + marker.len() - 1, "");
        }
    }
    if let Some(rest) = name.strip_prefix("test_") {
        name = rest.to_string();
    }
    if let Some(rest) = name.strip_suffix("_test.py") {
        name = format!("{rest}.py");
    }
    if let Some(rest) = name.strip_suffix("_test.go") {
        name = format!("{rest}.go");
    }
    splitext(&name).0.to_string()
}

fn kind_of(path: &str) -> &'static str {
    KINDS
        .iter()
        .find(|(_, pattern)| pattern.is_match(path))
        .map_or("other", |(kind, _)| kind)
}

/// What describing a group draws on.
struct Change<'a> {
    stats: &'a HashMap<String, (u64, u64)>,
    /// Each changed code file's text.
    texts: &'a HashMap<String, String>,
    /// Each file's `git diff -U0` lines: just the changed lines, for the declarations they touch.
    declaration_diffs: HashMap<String, Vec<String>>,
    untracked: HashSet<String>,
    links: &'a Links,
    hubs: &'a Hubs,
}

impl Change<'_> {
    /// One component and its tests as a group.
    fn group(&self, files: &[String], tests: Vec<String>) -> Group {
        let hub = self.hub_of(files);
        let (shared, registry) = (self.hubs.shared.contains(hub), self.hubs.registries.contains(hub));
        let imports_shared = |shared: &&String| files.iter().any(|file| self.imports(file, shared));
        let uses: BTreeSet<String> = self
            .hubs
            .shared
            .iter()
            .filter(imports_shared)
            .map(|shared| stem(shared))
            .collect();
        let sorted_files = reading_order(files, &self.links.imports);
        let tests = tests_in_order(&tests, &sorted_files, stem);
        let (add, rem) = files.iter().chain(&tests).fold((0, 0), |(add, rem), file| {
            let (added, removed) = self.stats.get(file).copied().unwrap_or((0, 0));
            (add + added, rem + removed)
        });
        Group {
            name: stem(hub),
            shared,
            registry,
            used_by: if shared {
                self.links.importers.get(hub).map_or(0, |importers| importers.len())
            } else {
                0
            },
            imports: if registry {
                count_outside(self.links.imports.get(hub), &self.hubs.shared)
            } else {
                0
            },
            uses: uses.into_iter().collect(),
            symbols: self.symbols_of(files),
            files: sorted_files,
            tests,
            add,
            rem,
        }
    }

    fn imports(&self, file: &String, target: &String) -> bool {
        self.links
            .importers
            .get(target)
            .is_some_and(|importers| importers.contains(file))
    }

    /// The file a group is named after: the one linked to most of the others, then the one with most changed
    /// lines. The first one wins a tie.
    fn hub_of<'f>(&self, files: &'f [String]) -> &'f String {
        let in_group: BTreeSet<&String> = files.iter().collect();
        let mut best: Option<(&String, (usize, u64))> = None;
        for file in files {
            let neighbors = self.links.neighbors.get(file);
            let links_inside = neighbors.map_or(0, |all| all.iter().filter(|other| in_group.contains(other)).count());
            let lines_changed = self.stats.get(file).map_or(0, |(added, removed)| added + removed);
            let score = (links_inside, lines_changed);
            if best.is_none_or(|(_, top)| score > top) {
                best = Some((file, score));
            }
        }
        best.expect("a component has at least one file").0
    }

    /// name -> (added, removed or changed; the file it is in) for what the group's files declare.
    fn symbols_of(&self, files: &[String]) -> IndexMap<String, (char, String)> {
        let mut all = IndexMap::new();
        for file in files {
            let declared = if self.untracked.contains(file) {
                symbols::all_added(self.texts.get(file).map_or("", String::as_str))
            } else {
                symbols::changed(self.declaration_diffs.get(file).map_or(&[], Vec::as_slice))
            };
            for (name, kind) in declared {
                all.insert(name, (kind, file.clone()));
            }
        }
        all
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stems() {
        assert_eq!(stem("src/a/Button.test.tsx"), "Button");
        assert_eq!(stem("tests/test_parser.py"), "parser");
        assert_eq!(stem("parser_test.py"), "parser");
        assert_eq!(stem("x/index.ts"), "index");
    }
}
