//! Which shell commands change things the diff doesn't show: installed packages, deleted files, git operations
//! (some of which throw work away), network calls and databases. No AI: each program the command runs
//! (command.rs) is matched against known tools. Read-only commands (`git status`, `ls`) are not effects.
use super::command::parts;
use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;

/// What a command did outside the diff.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    /// Added, removed or installed packages (node_modules, the virtualenv, the toolchain).
    Install,
    /// Deleted files: ignored or untracked ones leave no trace in the diff.
    Delete,
    /// A git operation that throws work away: `reset --hard`, `checkout -- .`, `restore`, `stash`, `clean`,
    /// deleting a branch, a forced push.
    Discard,
    /// Any other git operation that changes the repo: commit (which takes changes out of this view), push, merge,
    /// rebase, switching branches.
    Git,
    /// Talked to the network: downloads, remote shells, the GitHub CLI, publishing.
    Network,
    /// Ran a database client or a migration.
    Database,
}

/// Package-manager commands, as in checks.rs.
const MANAGER: &str = r"(?:npm|pnpm|yarn|bun)";

static EFFECTS: LazyLock<Vec<(Effect, Regex)>> = LazyLock::new(|| {
    let kind = |pattern: String| Regex::new(&format!(r"^(?:{pattern})(?:\s|$)")).unwrap();
    vec![
        (
            Effect::Install,
            kind(format!(
                r"{MANAGER} (?:add|install|i|remove|rm|uninstall|update|up|upgrade)|pip3? (?:install|uninstall)|uv (?:add|remove|sync|pip install)|poetry (?:add|remove|install)|cargo (?:add|remove|install)|go (?:get|install)|brew (?:install|uninstall|upgrade)|gem install|bundle (?:install|add)|composer (?:require|install)"
            )),
        ),
        (Effect::Delete, kind(r"rm|rmdir|unlink|trash|find .* -delete".into())),
        (
            Effect::Network,
            kind(format!(
                r"curl|wget|ssh|scp|sftp|rsync|gh|{MANAGER} publish|cargo publish|twine upload|docker push"
            )),
        ),
        (
            Effect::Database,
            kind(
                r"psql|mysql|sqlite3|mongosh|mongo|redis-cli|prisma (?:migrate|db)|alembic (?:upgrade|downgrade)|(?:bin/)?(?:rails|rake) db:\S*|python3? manage\.py (?:migrate|flush|loaddata)|drizzle-kit (?:push|migrate)|knex migrate\S*|sequelize db:\S*|supabase db"
                    .into(),
            ),
        ),
    ]
});
/// `git` with its global options (`-C dir`) taken off, and the subcommand with its arguments.
static GIT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^git(?:\s+-C\s+\S+)?\s+(\S+)\s*(.*)$").unwrap());

/// The effects a command has, each kind once in the order it first comes, and the parts of the command that have
/// them (`rm -rf dist`, `git stash`). Both are empty for a command with no effect outside the diff.
#[derive(Debug, Default, PartialEq)]
pub struct Effects {
    pub kinds: Vec<Effect>,
    pub parts: Vec<String>,
}

/// What `cmd` changes outside the diff.
pub fn effects_in(cmd: &str) -> Effects {
    let mut found = Effects::default();
    for part in parts(cmd) {
        let Some(effect) = effect_of(&part.program) else {
            continue;
        };
        if !found.kinds.contains(&effect) {
            found.kinds.push(effect);
        }
        found.parts.push(part.shown);
    }
    found
}

fn effect_of(program: &str) -> Option<Effect> {
    if let Some(git) = GIT.captures(program) {
        return git_effect(&git[1], &git[2]);
    }
    EFFECTS
        .iter()
        .find(|(_, pattern)| pattern.is_match(program))
        .map(|(effect, _)| *effect)
}

/// What a git subcommand does outside the diff; None for the ones that only read (status, diff, log, show…).
fn git_effect(subcommand: &str, args: &str) -> Option<Effect> {
    let has = |flag: &str| args.split_whitespace().any(|arg| arg == flag);
    match subcommand {
        "reset" if has("--hard") || has("--merge") || has("--keep") => Some(Effect::Discard),
        "checkout" if has("--") || has(".") || has("-f") => Some(Effect::Discard),
        "restore" if !has("--staged") => Some(Effect::Discard),
        "stash" => match args.split_whitespace().next() {
            Some("list" | "show") => None,
            Some("pop" | "apply") => Some(Effect::Git), // brings stashed work back
            _ => Some(Effect::Discard),                 // takes the changes out of the working folder
        },
        "clean" => Some(Effect::Discard),
        "branch" if has("-D") || has("-d") || has("--delete") => Some(Effect::Discard),
        "push" if has("--force") || has("-f") || has("--force-with-lease") => Some(Effect::Discard),
        "rm" => Some(Effect::Delete),
        "commit" | "push" | "pull" | "merge" | "rebase" | "cherry-pick" | "revert" | "switch" | "checkout"
        | "reset" | "tag" | "am" | "apply" | "worktree" => Some(Effect::Git),
        "branch" if !args.is_empty() && !args.starts_with('-') => Some(Effect::Git),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(cmd: &str) -> Vec<Effect> {
        effects_in(cmd).kinds
    }

    #[test]
    fn known_tools_by_kind() {
        assert_eq!(kinds("pnpm add zod"), [Effect::Install]);
        assert_eq!(kinds("cd app && pip install -r requirements.txt"), [Effect::Install]);
        assert_eq!(kinds("rm -rf dist"), [Effect::Delete]);
        assert_eq!(kinds("curl -s https://example.com | jq ."), [Effect::Network]);
        assert_eq!(kinds("gh pr create --fill"), [Effect::Network]);
        assert_eq!(kinds("npx prisma migrate dev"), [Effect::Database]);
        assert_eq!(kinds("python manage.py migrate"), [Effect::Database]);
    }

    #[test]
    fn git_that_throws_work_away() {
        for cmd in [
            "git reset --hard HEAD~1",
            "git checkout -- src/a.ts",
            "git checkout .",
            "git restore src/a.ts",
            "git stash",
            "git clean -fd",
            "git branch -D old",
            "git push --force",
            "git -C /repo reset --hard",
        ] {
            assert_eq!(kinds(cmd), [Effect::Discard], "{cmd}");
        }
    }

    #[test]
    fn other_git_that_changes_the_repo() {
        for cmd in [
            "git commit -m 'x'",
            "git push",
            "git switch main",
            "git checkout -b new",
            "git stash pop",
        ] {
            assert_eq!(kinds(cmd), [Effect::Git], "{cmd}");
        }
    }

    #[test]
    fn reading_is_not_an_effect() {
        for cmd in [
            "git status",
            "git diff --stat",
            "git log --oneline -5",
            "git stash list",
            "git restore --staged a.ts",
            "git branch",
            "git branch -a",
            "ls -la",
            "cat package.json",
            "grep -rn 'rm -rf' .",
            "pnpm lint",
            "rmate file",
        ] {
            assert_eq!(effects_in(cmd), Effects::default(), "{cmd}");
        }
    }

    #[test]
    fn several_effects_in_the_order_they_come() {
        let found = effects_in("rm -rf node_modules && pnpm install && git add -A && git commit -m wip");
        assert_eq!(found.kinds, [Effect::Delete, Effect::Install, Effect::Git]);
        assert_eq!(
            found.parts,
            ["rm -rf node_modules", "pnpm install", "git commit -m wip"]
        );
    }
}
