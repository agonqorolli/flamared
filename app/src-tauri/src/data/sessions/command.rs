//! A shell command split into the programs it runs, for recognizing what it does (checks.rs, effects.rs). No AI:
//! the command is split at `&&`, `|`, `;` and newlines, heredoc text is left out, and each part's program is
//! what remains after prefixes like `FOO=1`, `npx` or `uv run`.
use regex::Regex;
use std::sync::LazyLock;

/// Where a shell command splits into separate programs.
static SEPARATORS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"&&|\|\||[;|\n]").unwrap());
/// What can come before the program itself: `FOO=1`, `npx`, `pnpm exec`, `uv run`, `python -m`, `time`.
static PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:\w+=\S*\s+|(?:npx|bunx|pnpm (?:exec|dlx)|yarn dlx|uv run|poetry run|python3? -m|time|sudo)\s+)+")
        .unwrap()
});
/// Output redirections, left out of the part shown: `2>&1`, `> /dev/null`.
static REDIRECT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+\d*>&?\s*\S+").unwrap());
/// The start of a heredoc (`<<'EOF'`, `<<-EOF`) and the word that ends it.
static HEREDOC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"<<-?\s*['"]?(\w+)['"]?"#).unwrap());

/// One program of a command.
pub struct Part {
    /// The part as shown: as written, without output redirections (`pnpm lint`, `npx tsc --noEmit`).
    pub shown: String,
    /// The program and its arguments, without prefixes (`tsc --noEmit`): what tools are matched against.
    pub program: String,
}

/// The programs `cmd` runs, in order.
pub fn parts(cmd: &str) -> Vec<Part> {
    SEPARATORS
        .split(&without_heredocs(cmd))
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| Part {
            shown: REDIRECT.replace_all(part, "").into_owned(),
            program: PREFIX.replace(part, "").into_owned(),
        })
        .collect()
}

/// `cmd` without the text of its heredocs: a script fed to `python3 - <<'EOF'` is not commands.
fn without_heredocs(cmd: &str) -> String {
    let mut kept = Vec::new();
    let mut ends_at: Option<String> = None;
    for line in cmd.lines() {
        if let Some(word) = &ends_at {
            if line.trim() == word {
                ends_at = None;
            }
            continue;
        }
        ends_at = HEREDOC.captures(line).map(|found| found[1].to_string());
        kept.push(line);
    }
    kept.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn programs(cmd: &str) -> Vec<String> {
        parts(cmd).into_iter().map(|part| part.program).collect()
    }

    #[test]
    fn splits_into_programs_without_prefixes() {
        assert_eq!(
            programs("cd app && CI=1 npx tsc --noEmit 2>&1 | tail -5"),
            ["cd app", "tsc --noEmit 2>&1", "tail -5"]
        );
        assert_eq!(parts("pnpm lint 2>&1")[0].shown, "pnpm lint");
    }

    #[test]
    fn heredoc_text_is_left_out() {
        let cmd = "python3 - <<'EOF'\nr\"pytest|jest\"\nrm -rf x\nEOF\ncargo test --lib";
        assert_eq!(programs(cmd), ["python3 - <<'EOF'", "cargo test --lib"]);
    }
}
