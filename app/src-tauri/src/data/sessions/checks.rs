//! Which shell commands check the code (tests, type checks, lint, builds), and whether a check failed. No AI: each
//! program the command runs (command.rs) is matched against known tools.
use super::command::parts;
use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;

/// What a command checks.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Check {
    Test,
    Types,
    Lint,
    Build,
}

/// Package-manager script names: `pnpm test`, `npm run lint`, `yarn build`.
const SCRIPT: &str = r"(?:npm|pnpm|yarn|bun)(?: run)?";

static CHECKS: LazyLock<Vec<(Check, Regex)>> = LazyLock::new(|| {
    let kind = |pattern: String| Regex::new(&format!(r"^(?:{pattern})(?:\s|$|:)")).unwrap();
    vec![
        (
            Check::Test,
            kind(format!(
                r"pytest|jest|vitest|mocha|rspec|phpunit|go test|cargo test|cargo nextest|deno test|swift test|mix test|xcodebuild test|{SCRIPT} test"
            )),
        ),
        (
            Check::Types,
            kind(format!(
                r"tsc|vue-tsc|mypy|pyright|cargo check|{SCRIPT} (?:typecheck|type-check|check-types|tsc)"
            )),
        ),
        (
            Check::Lint,
            kind(format!(
                r"eslint|biome (?:check|lint)|ruff|flake8|pylint|golangci-lint|cargo clippy|swiftlint|prettier (?:--check|-c)|{SCRIPT} lint"
            )),
        ),
        (
            Check::Build,
            kind(format!(
                r"cargo build|go build|vite build|next build|swift build|xcodebuild|make|{SCRIPT} build"
            )),
        ),
    ]
});
/// Output that says a check failed even when the command exited 0 (its output piped through `tail`, say).
static FAILURE_OUTPUT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?m)^test result: FAILED|\b[1-9]\d*\s+(?:failed|failing|errors?)\b|^error(?:\[E\d+\])?:|error TS\d+:|^(?:--- )?FAIL\b|npm ERR!|ELIFECYCLE",
    )
    .unwrap()
});
static PASSED_COUNT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)(\d+)\s+(passed|passing)").unwrap());

/// The checks a command runs, each kind once in the order it first runs, and the parts of the command that run
/// them (`pnpm lint`, `npx tsc --noEmit`). Both are empty for a command that checks nothing.
#[derive(Debug, Default, PartialEq)]
pub struct Checks {
    pub kinds: Vec<Check>,
    pub parts: Vec<String>,
}

/// The known test, type check, lint and build tools that `cmd` runs.
pub fn checks_in(cmd: &str) -> Checks {
    let mut found = Checks::default();
    for part in parts(cmd) {
        let Some((check, _)) = CHECKS.iter().find(|(_, pattern)| pattern.is_match(&part.program)) else {
            continue;
        };
        if !found.kinds.contains(check) {
            found.kinds.push(*check);
        }
        found.parts.push(part.shown);
    }
    found
}

/// Whether a check's output reports a failure.
pub fn failed_in_output(output: &str) -> bool {
    FAILURE_OUTPUT.is_match(output)
}

/// How many tests passed, when a test command's output says so.
pub fn passed_count(output: &str) -> Option<u64> {
    PASSED_COUNT.captures(output).and_then(|found| found[1].parse().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(cmd: &str) -> Vec<Check> {
        checks_in(cmd).kinds
    }

    #[test]
    fn known_tools_by_kind() {
        assert_eq!(kinds("cargo test --lib"), [Check::Test]);
        assert_eq!(kinds("cd app && pnpm test:unit"), [Check::Test]);
        assert_eq!(kinds("uv run pytest -q"), [Check::Test]);
        assert_eq!(kinds("npx tsc --noEmit -p ."), [Check::Types]);
        assert_eq!(kinds("npm run lint"), [Check::Lint]);
        assert_eq!(kinds("cargo clippy --all-targets 2>&1 | tail -5"), [Check::Lint]);
        assert_eq!(kinds("CI=1 pnpm build"), [Check::Build]);
    }

    #[test]
    fn several_checks_in_the_order_they_run() {
        let found = checks_in("cd app && pnpm format && pnpm lint 2>&1 && npx tsc --noEmit -p . && pnpm lint");
        assert_eq!(found.kinds, [Check::Lint, Check::Types]);
        assert_eq!(found.parts, ["pnpm lint", "npx tsc --noEmit -p .", "pnpm lint"]);
    }

    #[test]
    fn heredoc_text_is_not_commands() {
        let cmd = "python3 - <<'EOF'\nr\"pytest|jest\"\npnpm test\nEOF\ncargo test --lib";
        assert_eq!(checks_in(cmd).parts, ["cargo test --lib"]);
    }

    #[test]
    fn mentioning_a_tool_is_not_running_it() {
        for cmd in [
            "grep -rn 'cargo test' docs",
            "cat package.json",
            "echo pnpm test",
            "ls tests",
            "makeup --now",
        ] {
            assert_eq!(checks_in(cmd), Checks::default(), "{cmd}");
        }
    }

    #[test]
    fn failures_in_output() {
        assert!(failed_in_output("test result: FAILED. 26 passed; 1 failed"));
        assert!(failed_in_output("src/a.ts(3,1): error TS2304: Cannot find name 'x'."));
        assert!(failed_in_output("error[E0425]: cannot find value `y`"));
        assert!(failed_in_output("✖ 3 problems (2 errors, 1 warning)"));
        assert!(!failed_in_output("test result: ok. 27 passed; 0 failed"));
        assert!(!failed_in_output("Found 0 errors."));
        assert!(!failed_in_output("test handles_errors ... ok"));
    }

    #[test]
    fn passed_counts() {
        assert_eq!(passed_count("test result: ok. 27 passed; 0 failed"), Some(27));
        assert_eq!(passed_count("Tests  12 passed (12)"), Some(12));
        assert_eq!(passed_count("ok"), None);
    }
}
