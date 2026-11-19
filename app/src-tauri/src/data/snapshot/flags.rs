//! Rule flags: fixed patterns read from the change itself (plain pattern matching, no AI).
//! The window explains each rule in app/src/components/map/FlagRules.tsx; keep the two in step.
use crate::data::group::{Grouping, TEST_RE};
use crate::data::paths::basename;
use regex::Regex;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::LazyLock;

static TEST_CASE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\b(it|test)\s*\(\s*['"`]|^\s*def test_|^\s*async def test_"#).unwrap());
static TEST_SKIP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\.(skip|only)\s*\(|\b(xit|xdescribe|xtest)\s*\(|@pytest\.mark\.skip|@unittest\.skip").unwrap()
});
static SECRET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"AKIA[0-9A-Z]{16}", // AWS access key
        r"|-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----",
        r"|\bsk-[A-Za-z0-9_-]{20,}",        // OpenAI/Anthropic-style keys
        r"|\bgh[pousr]_[A-Za-z0-9]{30,}",   // GitHub tokens
        r"|\bxox[baprs]-[A-Za-z0-9-]{10,}", // Slack tokens
        r#"|(?i:(api[_-]?key|secret|token|passw(or)?d)\s*[:=]\s*['"][^'"\s]{12,}['"])"#,
    ))
    .unwrap()
});
static DEBUG_ANYWHERE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bdebugger\b|\bbreakpoint\(\)|pdb\.set_trace\(|\bTODO\b|\bFIXME\b").unwrap());
static DEBUG_LOG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\bconsole\.log\(").unwrap());
/// Folders of command-line scripts, where printing to the console is the point.
static CLI_FOLDERS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(^|/)(scripts|bin|tools|cli)/").unwrap());
/// .env files that hold no real values.
const ENV_EXAMPLES: &[&str] = &[".example", ".sample", ".template"];

/// changed path -> its flags, for the files that have any. `diff_lines` holds every changed file's diff.
pub fn rule_flags(grouping: &Grouping, diff_lines: &HashMap<&String, Vec<String>>) -> BTreeMap<String, Vec<String>> {
    let support_kind: HashMap<&String, &str> = grouping
        .support
        .iter()
        .flat_map(|(kind, paths)| paths.iter().map(move |path| (path, kind.as_str())))
        .collect();
    // A code file alone in its group, importing nothing shared.
    let not_connected: HashSet<&String> = grouping
        .groups
        .iter()
        .filter(|group| group.files.len() == 1 && !group.shared && !group.registry && group.uses.is_empty())
        .map(|group| &group.files[0])
        .collect();
    let mut by_file = BTreeMap::new();
    // Left-out files are checked too: leaving out a folder must not hide a secret in it.
    for (path, status) in grouping.files.iter().chain(&grouping.left_out) {
        let mut flags: Vec<String> = Vec::new();
        if status == "D" && TEST_RE.is_match(basename(path)) {
            flags.push("test deleted".into());
        }
        match support_kind.get(path) {
            Some(&"deps") => flags.push("dependency file".into()),
            Some(&"infra") => flags.push("infra file".into()),
            _ => {}
        }
        if not_connected.contains(path) {
            flags.push("not connected".into());
        }
        flags.extend(diff_flags(path, &diff_lines[path])); // rules that read the diff itself
        if !flags.is_empty() {
            by_file.insert(path.clone(), flags);
        }
    }
    by_file
}

/// Flags for one file from its full diff. Never returns the matched text itself (it could be a secret).
fn diff_flags(path: &str, diff: &[String]) -> Vec<String> {
    let lines_starting = |sign: char| -> Vec<&str> {
        diff.iter()
            .filter(|line| line.starts_with(sign))
            .map(|line| &line[1..])
            .collect()
    };
    let (added, removed) = (lines_starting('+'), lines_starting('-'));
    let (mut flags, name) = (Vec::new(), basename(path));
    if TEST_RE.is_match(name) {
        let cases = |lines: &[&str]| lines.iter().filter(|line| TEST_CASE.is_match(line)).count() as i64;
        let lost = cases(&removed) - cases(&added);
        if lost > 0 {
            flags.push(format!(
                "tests weakened (−{lost} case{})",
                if lost > 1 { "s" } else { "" }
            ));
        }
        if added.iter().any(|line| TEST_SKIP.is_match(line)) {
            flags.push("tests skipped".into());
        }
    }
    let is_example = ENV_EXAMPLES.iter().any(|ending| name.ends_with(ending));
    if name == ".env" || (name.starts_with(".env.") && !is_example) {
        flags.push("possible secret (.env file)".into());
    } else if added.iter().any(|line| SECRET.is_match(line)) {
        flags.push("possible secret".into());
    }
    let mut debug_lines = added.iter().filter(|line| DEBUG_ANYWHERE.is_match(line)).count();
    if !CLI_FOLDERS.is_match(path) {
        debug_lines += added.iter().filter(|line| DEBUG_LOG.is_match(line)).count();
    }
    if debug_lines > 0 {
        flags.push(format!("debug leftovers ({debug_lines})"));
    }
    flags
}
