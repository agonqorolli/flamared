//! Group a change set "by logic" without AI.
//!
//! Logic groups = connected components of changed code files linked by imports.
//! Tests attach to the group of the source file with the same stem.
//! Everything else is grouped by kind (deps, config, infra, docs, assets).
use super::git::{git, git_or_empty};
use super::paths::{basename, dirname, join, normpath, splitext};
use super::tree::At;
use indexmap::IndexMap;
use regex::Regex;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::LazyLock;

const CODE_EXT: &[&str] = &[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs", ".go"];
const HUB_MIN_IMPORTERS: usize = 3; // a changed file imported by this many other changed files is "shared"
const REGISTRY_MIN_IMPORTS: usize = 4; // a changed file importing this many changed files is a "registry" (index, Root)

static JS_IMPORT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap()
});
static PY_IMPORT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*(?:from\s+(\.+[\w.]*|[\w.]+)\s+import|import\s+([\w.]+))").unwrap());
pub static TEST_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\.(test|spec)\.[^.]+$)|(^test_.*\.py$)|(_test\.py$)|(_test\.go$)").unwrap());
// Top-level declarations only (Python methods one level deep), so locals don't show up. Covers JS/TS, Python,
// Rust (pub fn, struct, trait...) and Go (func, type, var).
static DECL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?: {4})?(?:export\s+)?(?:default\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(function|class|const|let|interface|type|enum|def|fn|struct|trait|mod|static|func|var)\s+([A-Za-z_]\w*)").unwrap()
});
static RUST_USE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);").unwrap());
static RUST_MOD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;").unwrap());
static GO_IMPORT_ONE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?m)^\s*import\s+(?:[\w.]+\s+)?"([^"]+)""#).unwrap());
static GO_IMPORT_BLOCK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?s)import\s*\((.*?)\)").unwrap());
static GO_SPEC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?m)^\s*(?:[\w.]+\s+)?"([^"]+)""#).unwrap());
static KINDS: LazyLock<Vec<(&str, Regex)>> = LazyLock::new(|| {
    vec![
        ("deps", Regex::new(r"(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|Cargo\.(toml|lock)|go\.(mod|sum))$").unwrap()),
        ("infra", Regex::new(r"(^|/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|\.github/.*|Makefile)$").unwrap()),
        ("docs", Regex::new(r"(?i)\.(md|mdx|txt|rst)$").unwrap()),
        ("assets", Regex::new(r"(?i)\.(png|jpe?g|gif|webp|svg|ttf|otf|woff2?|wav|mp3|mp4|mov|pdf)$").unwrap()),
        ("config", Regex::new(r"(\.(json|ya?ml|toml|ini|cfg)$)|(^|/)\.env|\.config\.[^/]+$").unwrap()),
    ]
});

pub struct Group {
    pub name: String,
    pub hub: String,
    pub files: Vec<String>,
    pub tests: Vec<String>,
    pub shared: bool,
    pub registry: bool,
    pub used_by: usize,
    pub imports: usize,
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
    pub support: BTreeMap<String, Vec<String>>,
    pub stats: HashMap<String, (u64, u64)>,
    /// changed file -> changed files importing it
    pub importers: BTreeMap<String, Vec<String>>,
}

pub fn changed_files(repo: &str, base: &str, at: &At) -> Result<IndexMap<String, String>, String> {
    let mut files = IndexMap::new();
    let mut args = vec!["diff", "--name-status", "-M"];
    args.extend(at.diff_args(base));
    for line in git(repo, &args)?.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if let (Some(st), Some(path)) = (parts.first(), parts.last()) {
            files.insert(path.to_string(), st.chars().next().unwrap_or('M').to_string());
        }
    }
    for p in at.untracked(repo) {
        files.insert(p, "A".into());
    }
    Ok(files)
}

pub fn read_text(repo: &str, path: &str) -> Option<String> {
    std::fs::read(join(repo, path))
        .ok()
        .map(|b| String::from_utf8_lossy(&b).into_owned())
}

fn read(repo: &str, path: &str, base: &str, status: &str, at: &At) -> String {
    if status == "D" {
        return git_or_empty(repo, &["show", &format!("{base}:{path}")]);
    }
    at.read(repo, path).unwrap_or_default()
}

/// One `git diff` for the whole change, split into each file's lines (keyed by its new path). Starting git once
/// instead of once per file is most of what makes a reload fast.
pub fn diff_by_file(repo: &str, args: &[&str]) -> HashMap<String, Vec<String>> {
    let mut out: HashMap<String, Vec<String>> = HashMap::new();
    let mut full = vec!["-c", "core.quotePath=false"];
    full.extend_from_slice(args);
    let text = git_or_empty(repo, &full);
    let mut chunk: Vec<&str> = Vec::new();
    let mut flush = |chunk: &mut Vec<&str>| {
        if let Some(path) = chunk_path(chunk) {
            out.insert(path, chunk.iter().map(|l| l.to_string()).collect());
        }
        chunk.clear();
    };
    for line in text.lines() {
        if line.starts_with("diff --git ") {
            flush(&mut chunk);
        }
        chunk.push(line);
    }
    flush(&mut chunk);
    out
}

/// The file a diff chunk is about: its new path, or the old one for a deletion.
fn chunk_path(chunk: &[&str]) -> Option<String> {
    let header = chunk.first()?.strip_prefix("diff --git a/")?;
    for l in chunk.iter().take_while(|l| !l.starts_with("@@")) {
        if let Some(p) = l.strip_prefix("+++ b/") {
            return Some(p.to_string());
        }
        if let Some(p) = l.strip_prefix("rename to ") {
            return Some(p.to_string());
        }
    }
    if let Some(p) = chunk.iter().find_map(|l| l.strip_prefix("--- a/")) {
        return Some(p.to_string()); // deleted: "+++ /dev/null"
    }
    // Binary or mode-only changes have no ---/+++ lines: "a/<p> b/<p>" with the same path twice.
    let n = header.len().checked_sub(3)? / 2;
    (header.get(n..n + 3) == Some(" b/") && header[..n] == header[n + 3..]).then(|| header[..n].to_string())
}

/// The changed file a path means, trying the usual extensions and index files; None when it isn't a changed file.
fn pick(cand: &str, known: &BTreeSet<String>) -> Option<String> {
    let mut cands = vec![cand.to_string()];
    cands.extend(CODE_EXT.iter().map(|e| format!("{cand}{e}")));
    cands.extend(CODE_EXT.iter().map(|e| format!("{cand}/index{e}")));
    cands.push(format!("{cand}/__init__.py"));
    if let Some(c) = cands.into_iter().find(|c| known.contains(c)) {
        return Some(c);
    }
    // strip a .js extension written for a .ts source
    let (stem, _) = splitext(cand);
    CODE_EXT
        .iter()
        .map(|e| format!("{stem}{e}"))
        .find(|c| known.contains(c))
}

/// Import aliases from a tsconfig.json / jsconfig.json, like "@/*" -> "./src/*". Paths are repo-relative.
#[derive(Default, Clone)]
pub struct Aliases {
    base_url: Option<String>,                  // folder bare imports may be relative to ("baseUrl")
    paths: Vec<(String, String, Vec<String>)>, // (prefix before *, suffix after *, targets with * in them)
}

static TRAILING_COMMA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r",(\s*[}\]])").unwrap());

/// tsconfig files allow comments and trailing commas; strip both so it parses as JSON.
fn strip_jsonc(text: &str) -> String {
    let (mut out, mut chars, mut in_str) = (String::new(), text.chars().peekable(), false);
    while let Some(c) = chars.next() {
        if in_str {
            out.push(c);
            if c == '\\' {
                out.extend(chars.next());
            } else if c == '"' {
                in_str = false;
            }
        } else if c == '"' {
            in_str = true;
            out.push(c);
        } else if c == '/' && chars.peek() == Some(&'/') {
            for c in chars.by_ref() {
                if c == '\n' {
                    out.push('\n');
                    break;
                }
            }
        } else if c == '/' && chars.peek() == Some(&'*') {
            chars.next();
            let mut prev = ' ';
            for c in chars.by_ref() {
                if prev == '*' && c == '/' {
                    break;
                }
                prev = c;
            }
        } else {
            out.push(c);
        }
    }
    TRAILING_COMMA.replace_all(&out, "$1").into_owned()
}

/// Aliases from one config file (repo-relative path), following "references" when it has none of its own.
fn read_aliases(repo: &str, config: &str, depth: u8) -> Option<Aliases> {
    let json: serde_json::Value = serde_json::from_str(&strip_jsonc(&read_text(repo, config)?)).ok()?;
    let dir = dirname(config);
    let opts = json.get("compilerOptions");
    let base_url = opts
        .and_then(|o| o.get("baseUrl"))
        .and_then(|b| b.as_str())
        .map(|b| normpath(&join(dir, b)));
    let root = base_url
        .clone()
        .unwrap_or_else(|| if dir.is_empty() { ".".into() } else { dir.to_string() });
    let mut paths = Vec::new();
    for (pattern, targets) in opts
        .and_then(|o| o.get("paths"))
        .and_then(|p| p.as_object())
        .into_iter()
        .flatten()
    {
        let (prefix, suffix) = pattern.split_once('*').unwrap_or((pattern.as_str(), ""));
        let targets: Vec<String> = targets
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|t| t.as_str())
            .map(|t| normpath(&join(&root, t)))
            .collect();
        paths.push((prefix.to_string(), suffix.to_string(), targets));
    }
    if base_url.is_some() || !paths.is_empty() || depth > 2 {
        return Some(Aliases { base_url, paths });
    }
    // Vite-style setups keep the aliases in a referenced tsconfig.app.json.
    let refs = json
        .get("references")
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();
    refs.iter()
        .filter_map(|r| r.get("path").and_then(|p| p.as_str()))
        .map(|p| normpath(&join(dir, p)))
        .map(|p| {
            if p.ends_with(".json") {
                p
            } else {
                join(&p, "tsconfig.json")
            }
        })
        .find_map(|p| read_aliases(repo, &p, depth + 1).filter(|a| a.base_url.is_some() || !a.paths.is_empty()))
        .or(Some(Aliases::default()))
}

/// The aliases that apply to a file: from the nearest tsconfig.json or jsconfig.json above it. Cached per folder.
fn aliases_for<'a>(repo: &str, file: &str, cache: &'a mut HashMap<String, Aliases>) -> &'a Aliases {
    let start = dirname(file).to_string();
    if !cache.contains_key(&start) {
        let mut dir = start.clone();
        let found = loop {
            if let Some(a) = ["tsconfig.json", "jsconfig.json"]
                .iter()
                .find_map(|n| read_aliases(repo, &join(&dir, n), 0))
            {
                break a;
            }
            if dir.is_empty() {
                break Aliases::default();
            }
            dir = dirname(&dir).to_string();
        };
        cache.insert(start.clone(), found);
    }
    &cache[&start]
}

// --- Rust: `use crate::a::b`, `use super::x`, `use self::y::{z, w}`, `mod name;`, and the crate's own name from
// examples and tests. A path resolves to the longest prefix that is a changed file (the rest names items).

/// The crate a file is in: its src folder and the names other code uses for it (package and lib name).
fn rust_crate(repo: &str, file: &str) -> Option<(String, Vec<String>)> {
    let mut dir = dirname(file).to_string();
    loop {
        if let Some(toml) = read_text(repo, &join(&dir, "Cargo.toml")) {
            let names = Regex::new(r#"(?m)^\s*name\s*=\s*"([^"]+)""#)
                .unwrap()
                .captures_iter(&toml)
                .map(|m| m[1].replace('-', "_"))
                .collect();
            return Some((join(&dir, "src"), names));
        }
        if dir.is_empty() {
            return None;
        }
        dir = dirname(&dir).to_string();
    }
}

/// A file's module path inside its crate (src/data/group.rs -> [data, group]; lib.rs, main.rs -> []); None outside src.
fn rust_module(file: &str, src: &str) -> Option<Vec<String>> {
    let rel = file.strip_prefix(&format!("{src}/"))?.strip_suffix(".rs")?;
    let mut segs: Vec<String> = rel.split('/').map(String::from).collect();
    if segs.last().is_some_and(|l| l == "mod") || (segs.len() == 1 && (segs[0] == "lib" || segs[0] == "main")) {
        segs.pop();
    }
    Some(segs)
}

/// The changed file for a module path: src/a/b.rs or src/a/b/mod.rs (the crate root for an empty path).
fn rust_file(src: &str, segs: &[String], known: &BTreeSet<String>) -> Option<String> {
    let cands = if segs.is_empty() {
        vec![join(src, "lib.rs"), join(src, "main.rs")]
    } else {
        let path = join(src, &segs.join("/"));
        vec![format!("{path}.rs"), join(&path, "mod.rs")]
    };
    cands.into_iter().find(|c| known.contains(c))
}

/// `a::{b, c::{d, e}}` -> a::b, a::c::d, a::c::e
fn expand_use(tree: &str) -> Vec<String> {
    let tree = tree.trim();
    let Some(open) = tree.find('{') else {
        return vec![tree.to_string()];
    };
    let prefix = tree[..open].trim_end_matches(':').trim();
    let inner = &tree[open + 1..tree.rfind('}').unwrap_or(tree.len())];
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
        .filter(|p| !p.trim().is_empty())
        .flat_map(expand_use)
        .map(|p| if prefix.is_empty() { p } else { format!("{prefix}::{p}") })
        .collect()
}

fn rust_imports(repo: &str, file: &str, text: &str, known: &BTreeSet<String>) -> Vec<String> {
    let Some((src, names)) = rust_crate(repo, file) else {
        return vec![];
    };
    let here = rust_module(file, &src);
    let mut out = Vec::new();
    // `use` lines, plus paths written inline like `crate::data::git::git(…)` or `app_lib::run()`.
    // Inline matches skip lines that are comments, and `a::{…}` (those come from `use` lines, expanded above).
    let code: String = text
        .lines()
        .filter(|l| !l.trim_start().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    let mut paths: Vec<String> = RUST_USE.captures_iter(text).flat_map(|m| expand_use(&m[1])).collect();
    for root in std::iter::once("crate".to_string()).chain(names.iter().cloned()) {
        let rx = Regex::new(&format!(r"\b({}(?:::\w+)+)(::\{{)?", regex::escape(&root))).unwrap();
        paths.extend(
            rx.captures_iter(&code)
                .filter(|m| m.get(2).is_none())
                .map(|m| m[1].to_string()),
        );
    }
    {
        for path in paths {
            let path = path.split(" as ").next().unwrap_or(&path).trim().to_string();
            let mut segs: Vec<String> = path
                .split("::")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty() && s != "*")
                .collect();
            let mut base: Vec<String> = match segs.first().map(String::as_str) {
                Some("crate") => vec![],
                Some(n) if names.iter().any(|x| x == n) => vec![],
                Some("self") => match &here {
                    Some(h) => h.clone(),
                    None => continue,
                },
                Some("super") => match &here {
                    Some(h) => h.clone(),
                    None => continue,
                },
                _ => continue, // std or another crate
            };
            let lead = segs.remove(0);
            if lead == "super" {
                base.pop();
                while segs.first().is_some_and(|s| s == "super") {
                    segs.remove(0);
                    base.pop();
                }
            }
            segs.retain(|s| s != "self");
            if segs.is_empty() {
                continue; // `use super::*` in a test module: the parent's own items, not another file
            }
            base.extend(segs);
            // Longest prefix that is a file; the crate root (lib.rs) when the item is defined there.
            if let Some(hit) = (0..=base.len()).rev().find_map(|n| rust_file(&src, &base[..n], known)) {
                out.push(hit);
            }
        }
    }
    if let Some(h) = &here {
        for m in RUST_MOD.captures_iter(text) {
            let mut segs = h.clone();
            segs.push(m[1].to_string());
            out.extend(rust_file(&src, &segs, known));
        }
    }
    out
}

// --- Go: imports name a package (a folder) under the module path from go.mod; every changed .go file in that
// folder counts. Files in the same folder are one package, so they count as connected too.

fn go_imports(repo: &str, file: &str, text: &str, known: &BTreeSet<String>) -> Vec<String> {
    let mut dir = dirname(file).to_string();
    let (mod_dir, module) = loop {
        if let Some(gomod) = read_text(repo, &join(&dir, "go.mod")) {
            match Regex::new(r"(?m)^module\s+(\S+)").unwrap().captures(&gomod) {
                Some(m) => break (dir.clone(), m[1].to_string()),
                None => return vec![],
            }
        }
        if dir.is_empty() {
            return vec![];
        }
        dir = dirname(&dir).to_string();
    };
    let mut specs: Vec<String> = GO_IMPORT_ONE.captures_iter(text).map(|m| m[1].to_string()).collect();
    for block in GO_IMPORT_BLOCK.captures_iter(text) {
        specs.extend(GO_SPEC.captures_iter(&block[1]).map(|m| m[1].to_string()));
    }
    let package_files = |pkg: &str| -> Vec<String> {
        known
            .iter()
            .filter(|k| k.ends_with(".go") && !k.ends_with("_test.go") && dirname(k) == pkg)
            .cloned()
            .collect()
    };
    let mut out = package_files(dirname(file)); // same package
    for spec in specs {
        if let Some(rest) = spec.strip_prefix(&format!("{module}/")) {
            out.extend(package_files(&normpath(&join(&mod_dir, rest))));
        } else if spec == module {
            out.extend(package_files(&mod_dir));
        }
    }
    out
}

/// Map an import specifier to a changed file path, if it is one.
fn resolve(spec: &str, importer: &str, known: &BTreeSet<String>, aliases: &Aliases) -> Option<String> {
    let py = importer.ends_with(".py");
    let cand = if spec.starts_with('.') {
        if py {
            let dots = spec.len() - spec.trim_start_matches('.').len();
            let mut base = dirname(importer).to_string();
            for _ in 0..dots.saturating_sub(1) {
                base = dirname(&base).to_string();
            }
            let rest = spec.trim_start_matches('.').replace('.', "/");
            if rest.is_empty() {
                base
            } else {
                normpath(&join(&base, &rest))
            }
        } else {
            normpath(&join(dirname(importer), spec))
        }
    } else if py {
        spec.replace('.', "/")
    } else {
        // Not relative: an alias from tsconfig/jsconfig ("@/components/x"), a path from its baseUrl, or a package.
        for (prefix, suffix, targets) in &aliases.paths {
            if let Some(mid) = spec
                .strip_prefix(prefix.as_str())
                .and_then(|r| r.strip_suffix(suffix.as_str()))
            {
                if let Some(hit) = targets
                    .iter()
                    .find_map(|t| pick(&normpath(&t.replacen('*', mid, 1)), known))
                {
                    return Some(hit);
                }
            }
        }
        return aliases
            .base_url
            .as_ref()
            .and_then(|b| pick(&normpath(&join(b, spec)), known));
    };
    if let Some(hit) = pick(&cand, known) {
        return Some(hit);
    }
    // python absolute imports may be relative to any parent dir
    if py {
        let tail = format!("/{cand}.py");
        return known.iter().find(|k| k.ends_with(&tail)).cloned();
    }
    None
}

/// Declarations a file's change adds (+), removes (-) or touches (~). `diff` is the file's `git diff -U0` lines;
/// a file git doesn't track yet has none, so every declaration in it counts as added.
fn symbols(text: impl Fn() -> String, diff: Option<&Vec<String>>, untracked: bool) -> IndexMap<String, char> {
    let mut res = IndexMap::new();
    if untracked {
        for line in text().lines() {
            if let Some(m) = DECL.captures(line) {
                res.insert(m[2].to_string(), '+');
            }
        }
        return res;
    }
    let (mut plus, mut minus, mut order) = (HashSet::new(), HashSet::new(), Vec::new());
    let note = |n: &str, order: &mut Vec<String>| {
        if !order.iter().any(|o| o == n) {
            order.push(n.to_string());
        }
    };
    for line in diff.into_iter().flatten() {
        if line.starts_with("@@") {
            if let Some(m) = line.rsplit("@@").next().and_then(|ctx| DECL.captures(ctx)) {
                note(&m[2], &mut order);
            }
        } else if line.starts_with('+') && !line.starts_with("+++") {
            if let Some(m) = DECL.captures(&line[1..]) {
                plus.insert(m[2].to_string());
                note(&m[2], &mut order);
            }
        } else if line.starts_with('-') && !line.starts_with("---") {
            if let Some(m) = DECL.captures(&line[1..]) {
                minus.insert(m[2].to_string());
                note(&m[2], &mut order);
            }
        }
    }
    for n in order {
        let k = match (plus.contains(&n), minus.contains(&n)) {
            (true, false) => '+',
            (false, true) => '-',
            _ => '~',
        };
        res.insert(n, k);
    }
    res
}

/// "dir/{old => new}/f.ts" or "old.ts => new.ts" -> the new path
fn rename_target(p: &str) -> String {
    if let (Some(a), Some(b)) = (p.find('{'), p.find('}')) {
        let inner = &p[a + 1..b];
        let new = inner.split(" => ").last().unwrap_or(inner);
        return format!("{}{}{}", &p[..a], new, &p[b + 1..]).replace("//", "/");
    }
    p.split(" => ").last().unwrap_or(p).to_string()
}

pub fn numstat(repo: &str, base: &str, at: &At) -> Result<HashMap<String, (u64, u64)>, String> {
    let mut stats = HashMap::new();
    let mut args = vec!["diff", "--numstat", "-M"];
    args.extend(at.diff_args(base));
    for line in git(repo, &args)?.lines() {
        let mut it = line.splitn(3, '\t');
        if let (Some(a), Some(d), Some(p)) = (it.next(), it.next(), it.next()) {
            stats.insert(rename_target(p), (a.parse().unwrap_or(0), d.parse().unwrap_or(0)));
        }
    }
    Ok(stats)
}

pub fn stem(p: &str) -> String {
    let mut b = basename(p).to_string();
    for t in [".test.", ".spec."] {
        if let Some(i) = b.find(t) {
            b.replace_range(i..i + t.len() - 1, "");
        }
    }
    if let Some(s) = b.strip_prefix("test_") {
        b = s.to_string();
    }
    if let Some(s) = b.strip_suffix("_test.py") {
        b = format!("{s}.py");
    }
    if let Some(s) = b.strip_suffix("_test.go") {
        b = format!("{s}.go");
    }
    splitext(&b).0.to_string()
}

pub fn group(repo: &str, base: &str, at: &At) -> Result<Grouping, String> {
    let files = changed_files(repo, base, at)?;
    let mut stats = numstat(repo, base, at)?;
    let untracked: HashSet<String> = at.untracked(repo).into_iter().collect();
    let mut u0_args = vec!["diff", "-U0"];
    u0_args.extend(at.diff_args(base));
    let u0 = diff_by_file(repo, &u0_args);
    let mut texts: HashMap<String, String> = HashMap::new(); // each changed code file's text, read once
    let mut alias_cache: HashMap<String, Aliases> = HashMap::new(); // tsconfig/jsconfig aliases per folder
    let code: Vec<String> = files
        .keys()
        .filter(|p| CODE_EXT.contains(&splitext(p).1))
        .cloned()
        .collect();
    let known: BTreeSet<String> = code.iter().cloned().collect();
    let tests: BTreeSet<String> = code.iter().filter(|p| TEST_RE.is_match(basename(p))).cloned().collect();
    let src: Vec<String> = code.iter().filter(|p| !tests.contains(*p)).cloned().collect();

    let mut adj: HashMap<String, BTreeSet<String>> = HashMap::new();
    let mut importers: HashMap<String, BTreeSet<String>> = HashMap::new();
    for p in &code {
        let text = texts
            .entry(p.clone())
            .or_insert_with(|| read(repo, p, base, &files[p], at))
            .clone();
        if files[p] == "A" && !stats.contains_key(p) {
            stats.insert(p.clone(), (text.lines().count() as u64, 0)); // untracked: numstat doesn't see it
        }
        let targets: Vec<String> = if p.ends_with(".rs") {
            rust_imports(repo, p, &text, &known)
        } else if p.ends_with(".go") {
            go_imports(repo, p, &text, &known)
        } else {
            let rx = if p.ends_with(".py") { &*PY_IMPORT } else { &*JS_IMPORT };
            let aliases = if p.ends_with(".py") {
                Aliases::default()
            } else {
                aliases_for(repo, p, &mut alias_cache).clone()
            };
            rx.captures_iter(&text)
                .flat_map(|caps| {
                    caps.iter()
                        .skip(1)
                        .flatten()
                        .map(|s| s.as_str().to_string())
                        .collect::<Vec<_>>()
                })
                .filter_map(|s| resolve(&s, p, &known, &aliases))
                .collect()
        };
        for t in targets {
            if &t != p {
                adj.entry(p.clone()).or_default().insert(t.clone());
                adj.entry(t.clone()).or_default().insert(p.clone());
                importers.entry(t).or_default().insert(p.clone());
            }
        }
    }

    // Widely imported files (theme, utils) would glue everything into one group.
    // Keep them as their own "shared" group and cut their edges before clustering.
    let shared: BTreeSet<String> = src
        .iter()
        .filter(|p| importers.get(*p).map_or(0, |s| s.difference(&tests).count()) >= HUB_MIN_IMPORTERS)
        .cloned()
        .collect();
    let mut imports_of: HashMap<String, BTreeSet<String>> = HashMap::new();
    for (t, ps) in &importers {
        for p in ps {
            imports_of.entry(p.clone()).or_default().insert(t.clone());
        }
    }
    let registries: BTreeSet<String> = src
        .iter()
        .filter(|p| {
            !shared.contains(*p)
                && imports_of.get(*p).map_or(0, |s| s.difference(&shared).count()) >= REGISTRY_MIN_IMPORTS
        })
        .cloned()
        .collect();
    let used_by: HashMap<&String, Vec<String>> = shared
        .iter()
        .map(|h| {
            (
                h,
                importers
                    .get(h)
                    .map(|s| s.iter().cloned().collect())
                    .unwrap_or_default(),
            )
        })
        .collect();
    for h in shared.iter().chain(registries.iter()) {
        for m in adj.remove(h).unwrap_or_default() {
            if let Some(s) = adj.get_mut(&m) {
                s.remove(h);
            }
        }
    }

    // connected components over source files (tests excluded so they attach by name)
    let mut seen = HashSet::new();
    let mut comps: Vec<Vec<String>> = Vec::new();
    for p in &src {
        if !seen.insert(p.clone()) {
            continue;
        }
        let (mut stack, mut comp) = (vec![p.clone()], Vec::new());
        while let Some(n) = stack.pop() {
            for m in adj.get(&n).into_iter().flatten() {
                if !tests.contains(m) && seen.insert(m.clone()) {
                    stack.push(m.clone());
                }
            }
            comp.push(n);
        }
        comps.push(comp);
    }

    let comp_of: HashMap<&String, usize> = comps
        .iter()
        .enumerate()
        .flat_map(|(i, c)| c.iter().map(move |p| (p, i)))
        .collect();
    let mut attached: HashMap<usize, Vec<String>> = HashMap::new();
    let mut loose_tests = Vec::new();
    for t in &tests {
        let st = stem(t);
        let hit = src
            .iter()
            .find(|s| stem(s) == st)
            .and_then(|s| comp_of.get(s).copied())
            .or_else(|| adj.get(t).into_iter().flatten().find_map(|m| comp_of.get(m).copied())); // fall back to imports
        match hit {
            Some(i) => attached.entry(i).or_default().push(t.clone()),
            None => loose_tests.push(t.clone()),
        }
    }

    let lines = |p: &String| stats.get(p).map_or(0, |(a, d)| a + d);
    let mut groups = Vec::new();
    for (i, c) in comps.iter().enumerate() {
        let cset: BTreeSet<&String> = c.iter().collect();
        // first of the best, like Python's max()
        let hub = c
            .iter()
            .fold(None::<(&String, (usize, u64))>, |best, p| {
                let key = (
                    adj.get(p).map_or(0, |s| s.iter().filter(|m| cset.contains(m)).count()),
                    lines(p),
                );
                match best {
                    Some((_, bk)) if bk >= key => best,
                    _ => Some((p, key)),
                }
            })
            .map(|(p, _)| p.clone())
            .unwrap();
        let mut syms = IndexMap::new();
        for p in c {
            let text = || texts.get(p).cloned().unwrap_or_default();
            for (n, k) in symbols(text, u0.get(p), untracked.contains(p)) {
                syms.insert(n, (k, p.clone()));
            }
        }
        let mut files_sorted = c.clone();
        files_sorted.sort();
        let mut tests_sorted = attached.get(&i).cloned().unwrap_or_default();
        tests_sorted.sort();
        let uses: BTreeSet<String> = shared
            .iter()
            .filter(|h| c.iter().any(|p| used_by[h].contains(p)))
            .map(|h| stem(h))
            .collect();
        let all = c.iter().chain(tests_sorted.iter());
        let (add, rem) = all.fold((0, 0), |(a, d), p| {
            let (x, y) = stats.get(p).copied().unwrap_or((0, 0));
            (a + x, d + y)
        });
        groups.push(Group {
            name: stem(&hub),
            shared: shared.contains(&hub),
            registry: registries.contains(&hub),
            used_by: used_by.get(&hub).map_or(0, |v| v.len()),
            imports: if registries.contains(&hub) {
                imports_of.get(&hub).map_or(0, |s| s.difference(&shared).count())
            } else {
                0
            },
            hub,
            files: files_sorted,
            tests: tests_sorted,
            uses: uses.into_iter().collect(),
            symbols: syms,
            add,
            rem,
        });
    }
    groups.sort_by_key(|g| (std::cmp::Reverse(g.files.len()), std::cmp::Reverse(g.add + g.rem)));

    let mut support: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for p in files.keys().filter(|p| !known.contains(*p)) {
        let kind = KINDS.iter().find(|(_, rx)| rx.is_match(p)).map_or("other", |(k, _)| k);
        support.entry(kind.to_string()).or_default().push(p.clone());
    }
    let importers = importers
        .into_iter()
        .map(|(t, ps)| (t, ps.into_iter().collect()))
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
        let a = Aliases {
            base_url: None,
            paths: vec![("@/".into(), "".into(), vec!["app/src/*".into()])],
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
            rust_module("app/src/data/group.rs", "app/src"),
            Some(vec!["data".into(), "group".into()])
        );
        assert_eq!(rust_module("app/src/data/mod.rs", "app/src"), Some(vec!["data".into()]));
        assert_eq!(rust_module("app/src/lib.rs", "app/src"), Some(vec![]));
        assert_eq!(rust_module("app/examples/dump.rs", "app/src"), None);
    }
    #[test]
    fn jsonc() {
        let t = "{\n // c\n \"a\": \"//not a comment\", /* b */ \"x\": [1,],\n}";
        let v: serde_json::Value = serde_json::from_str(&strip_jsonc(t)).unwrap();
        assert_eq!(v["a"], "//not a comment");
        assert_eq!(v["x"][0], 1);
    }
    #[test]
    fn renames() {
        assert_eq!(rename_target("src/{old => new}/f.ts"), "src/new/f.ts");
        assert_eq!(rename_target("a.ts => b.ts"), "b.ts");
        assert_eq!(rename_target("src/{ => sub}/f.ts"), "src/sub/f.ts");
    }
}
