//! Group a change set "by logic" without AI.
//!
//! Logic groups = connected components of changed code files linked by imports.
//! Tests attach to the group of the source file with the same stem.
//! Everything else is grouped by kind (deps, config, infra, docs, assets).
use super::git::{git, git_or_empty};
use super::paths::{basename, dirname, join, normpath, splitext};
use indexmap::IndexMap;
use regex::Regex;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::LazyLock;

const CODE_EXT: &[&str] = &[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"];
const HUB_MIN_IMPORTERS: usize = 3; // a changed file imported by this many other changed files is "shared"
const REGISTRY_MIN_IMPORTS: usize = 4; // a changed file importing this many changed files is a "registry" (index, Root)

static JS_IMPORT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap()
});
static PY_IMPORT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*(?:from\s+(\.+[\w.]*|[\w.]+)\s+import|import\s+([\w.]+))").unwrap());
pub static TEST_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\.(test|spec)\.[^.]+$)|(^test_.*\.py$)|(_test\.py$)").unwrap());
// Top-level declarations only (Python methods one level deep), so locals don't show up.
static DECL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?: {4})?(?:export\s+)?(?:default\s+)?(?:async\s+)?(function|class|const|let|interface|type|enum|def)\s+([A-Za-z_]\w*)").unwrap()
});
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

pub fn changed_files(repo: &str, base: &str) -> Result<IndexMap<String, String>, String> {
    let mut files = IndexMap::new();
    for line in git(repo, &["diff", "--name-status", "-M", base])?.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if let (Some(st), Some(path)) = (parts.first(), parts.last()) {
            files.insert(path.to_string(), st.chars().next().unwrap_or('M').to_string());
        }
    }
    for p in git(repo, &["ls-files", "--others", "--exclude-standard"])?.lines() {
        files.insert(p.to_string(), "A".into());
    }
    Ok(files)
}

pub fn read_text(repo: &str, path: &str) -> Option<String> {
    std::fs::read(join(repo, path)).ok().map(|b| String::from_utf8_lossy(&b).into_owned())
}

fn read(repo: &str, path: &str, base: &str, status: &str) -> String {
    if status == "D" {
        return git_or_empty(repo, &["show", &format!("{base}:{path}")]);
    }
    read_text(repo, path).unwrap_or_default()
}

/// Map an import specifier to a changed file path, if it is one.
fn resolve(spec: &str, importer: &str, known: &BTreeSet<String>) -> Option<String> {
    let py = importer.ends_with(".py");
    let cand = if spec.starts_with('.') {
        if py {
            let dots = spec.len() - spec.trim_start_matches('.').len();
            let mut base = dirname(importer).to_string();
            for _ in 0..dots.saturating_sub(1) {
                base = dirname(&base).to_string();
            }
            let rest = spec.trim_start_matches('.').replace('.', "/");
            if rest.is_empty() { base } else { normpath(&join(&base, &rest)) }
        } else {
            normpath(&join(dirname(importer), spec))
        }
    } else if py {
        spec.replace('.', "/")
    } else {
        return None; // bare package import
    };
    let mut cands = vec![cand.clone()];
    cands.extend(CODE_EXT.iter().map(|e| format!("{cand}{e}")));
    cands.extend(CODE_EXT.iter().map(|e| format!("{cand}/index{e}")));
    cands.push(format!("{cand}/__init__.py"));
    if let Some(c) = cands.into_iter().find(|c| known.contains(c)) {
        return Some(c);
    }
    // strip a .js extension written for a .ts source
    let (stem, _) = splitext(&cand);
    if let Some(c) = CODE_EXT.iter().map(|e| format!("{stem}{e}")).find(|c| known.contains(c)) {
        return Some(c);
    }
    // python absolute imports may be relative to any parent dir
    if py {
        let tail = format!("/{cand}.py");
        return known.iter().find(|k| k.ends_with(&tail)).cloned();
    }
    None
}

fn symbols(repo: &str, path: &str, base: &str, status: &str) -> IndexMap<String, char> {
    let mut res = IndexMap::new();
    if status == "A" && !git_or_empty(repo, &["ls-files", path]).lines().any(|l| l == path) {
        for line in read(repo, path, base, status).lines() {
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
    for line in git_or_empty(repo, &["diff", "-U0", base, "--", path]).lines() {
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

pub fn numstat(repo: &str, base: &str) -> Result<HashMap<String, (u64, u64)>, String> {
    let mut stats = HashMap::new();
    for line in git(repo, &["diff", "--numstat", "-M", base])?.lines() {
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
    splitext(&b).0.to_string()
}

pub fn group(repo: &str, base: &str) -> Result<Grouping, String> {
    let files = changed_files(repo, base)?;
    let mut stats = numstat(repo, base)?;
    let code: Vec<String> = files.keys().filter(|p| CODE_EXT.contains(&splitext(p).1)).cloned().collect();
    let known: BTreeSet<String> = code.iter().cloned().collect();
    let tests: BTreeSet<String> = code.iter().filter(|p| TEST_RE.is_match(basename(p))).cloned().collect();
    let src: Vec<String> = code.iter().filter(|p| !tests.contains(*p)).cloned().collect();

    let mut adj: HashMap<String, BTreeSet<String>> = HashMap::new();
    let mut importers: HashMap<String, BTreeSet<String>> = HashMap::new();
    for p in &code {
        let text = read(repo, p, base, &files[p]);
        if files[p] == "A" && !stats.contains_key(p) {
            stats.insert(p.clone(), (text.lines().count() as u64, 0)); // untracked: numstat doesn't see it
        }
        let rx = if p.ends_with(".py") { &*PY_IMPORT } else { &*JS_IMPORT };
        for caps in rx.captures_iter(&text) {
            for s in caps.iter().skip(1).flatten() {
                if let Some(t) = resolve(s.as_str(), p, &known) {
                    if &t != p {
                        adj.entry(p.clone()).or_default().insert(t.clone());
                        adj.entry(t.clone()).or_default().insert(p.clone());
                        importers.entry(t).or_default().insert(p.clone());
                    }
                }
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
        .filter(|p| !shared.contains(*p) && imports_of.get(*p).map_or(0, |s| s.difference(&shared).count()) >= REGISTRY_MIN_IMPORTS)
        .cloned()
        .collect();
    let used_by: HashMap<&String, Vec<String>> =
        shared.iter().map(|h| (h, importers.get(h).map(|s| s.iter().cloned().collect()).unwrap_or_default())).collect();
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

    let comp_of: HashMap<&String, usize> = comps.iter().enumerate().flat_map(|(i, c)| c.iter().map(move |p| (p, i))).collect();
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
                let key = (adj.get(p).map_or(0, |s| s.iter().filter(|m| cset.contains(m)).count()), lines(p));
                match best {
                    Some((_, bk)) if bk >= key => best,
                    _ => Some((p, key)),
                }
            })
            .map(|(p, _)| p.clone())
            .unwrap();
        let mut syms = IndexMap::new();
        for p in c {
            for (n, k) in symbols(repo, p, base, &files[p]) {
                syms.insert(n, (k, p.clone()));
            }
        }
        let mut files_sorted = c.clone();
        files_sorted.sort();
        let mut tests_sorted = attached.get(&i).cloned().unwrap_or_default();
        tests_sorted.sort();
        let uses: BTreeSet<String> =
            shared.iter().filter(|h| c.iter().any(|p| used_by[h].contains(p))).map(|h| stem(h)).collect();
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
            imports: if registries.contains(&hub) { imports_of.get(&hub).map_or(0, |s| s.difference(&shared).count()) } else { 0 },
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
    let importers = importers.into_iter().map(|(t, ps)| (t, ps.into_iter().collect())).collect();
    Ok(Grouping { files, groups, loose_tests, support, stats, importers })
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
    fn renames() {
        assert_eq!(rename_target("src/{old => new}/f.ts"), "src/new/f.ts");
        assert_eq!(rename_target("a.ts => b.ts"), "b.ts");
        assert_eq!(rename_target("src/{ => sub}/f.ts"), "src/sub/f.ts");
    }
}
