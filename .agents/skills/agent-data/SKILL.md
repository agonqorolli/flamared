---
name: agent-data
description: What coding agents record on disk and how the app turns it into Changes, Timeline and Map — Claude Code transcripts, Codex rollouts, git, the Rust data layer (src-tauri/src/data), linking sessions to a branch, grouping by imports, reading order, checks (tests, types, lint, build), effects outside the diff, rule flags, "still in final", live watching, branch views, caching, where agent folders are (Settings → Agents) and files left out of the review (Settings → Files). Use when changing anything under app/src-tauri/src/data, adding an agent adapter or a language's imports, or answering what the app can know about an agent's work.
---

# Agent data and the data layer

Everything is read-only: the app reads git and the agents' session files and never writes to either. No AI processing.

## Sources

| Source | Where | Notes |
|---|---|---|
| Claude Code transcript | `~/.claude/projects/<dir>/<session>.jsonl` | Internal, undocumented, changes between versions. Never rely on its format staying the same. |
| Claude Code checkpoints | `~/.claude/file-history/<session>/<hash>@vN` | Byte-identical file versions per turn. |
| Codex rollout | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | FileChange items with `unified_diff` (update) or `content` (add). Never read `~/.codex/auth.json`. |
| git | the repo | Ground truth for what will be committed. |

**Where the agent folders are** (`data/sessions/folders.rs`): a folder chosen in Settings → Agents, else the agent's own variable (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`), else `~/.claude` / `~/.codex`. An app opened from the Finder doesn't see shell variables, which is why the setting exists. The choice is saved in `agents.json` in the app's data folder (`agents.rs`), set in a process-wide `RwLock` at startup, and changing it emits `sources-changed`: the window re-watches and reloads, or looks for a repo again when none was open. Everything reads the folders through `folders::folder` / `sessions_dir`, never a hard-coded path. A picked folder is accepted when its sessions folder (`projects`, `sessions`) is inside it or is the folder itself; picking the default stores nothing.

Facts measured on real sessions:

- Edit/Write results carry `structuredPatch` + `originalFile`. **48% of file changes came through Bash** (`toolUseResult.bashEditDiff`), so shell edits are essential.
- Only ~22% of edits have agent narration right before them; thinking text is mostly empty. Don't design around reasoning.
- Harness messages (`<task-notification>`…) look like user messages; filter them out of prompts.
- Since 2026-11, transcripts also hold `"type":"api-request-blob"` records that repeat earlier tool results without `toolUseResult`. Pair a tool call only with `type: "user"` records, or a later blob replaces the real result and the edit loses its diff (Timeline showed no edits).
- `userModified` was always 0: "you edited this" must come from git diff minus recorded edits.
- Pass/fail comes from the exit status plus failure text in the output (`test result: FAILED`, `error TS…`, `2 errors`), since `cargo test | tail` exits 0. Test counts show only when the output states them.
- Codex records its branch once per session (mid-session switches aren't seen); Codex session id = last 8 characters of the file stem (all stems start with `rollout-`).
- Other agents (planned adapters): Cursor (internal DB, `hooks.json`), Gemini CLI (`~/.gemini/tmp/…`, checkpoints), Agent Trace records. Any agent: git + file watching. One adapter per agent produces the same session → turn → events (message, edit with diff, command) model; everything else runs on that model.

## The Rust layer (`app/src-tauri/src/data/`)

- `snapshot/` — `build(top, base, at)` in `mod.rs` is one screen load; `view(repo, branch)` picks how to show a branch. One file per part: `timeline.rs` (which turns and edits belong to the change), `story.rs` (the Changes sections), `diffs.rs`, `flags.rs`, `map.rs`. `model.rs` declares everything sent to the window as typed structs; its mirror is `app/src/lib/types.ts`.
- `repos.rs`, `branches.rs` — the repo and branch pickers' data (`known_repos`, `repo_status`, `branches`, `branch_files`), and what a viewed branch is compared with (`split_off`).
- `tree.rs` — `At::Work` (working folder, uncommitted + untracked) or `At::Commit(rev)` (another branch, read via `git show` without touching the checkout).
- `git.rs`, `paths.rs`, `cache.rs` — git calls and the repeated questions (`current_branch`, `toplevel`, `worktrees`), path helpers, and remembering what was read from a file until it changes. Every git call runs with `core.quotePath=false`, so non-ASCII names ("café.ts") read the same from every command.
- `diff.rs` — what git says changed: the files, their line counts, and one whole-repo `git diff` split per file (`diff_by_file`).
- `group/` — grouping by imports: clustering in `mod.rs`, imports per language in `imports.rs` (TS/JS, Python), `tsconfig.rs` (tsconfig/jsconfig aliases), `rust.rs` (`use`/`mod`/`crate::`), `go.rs` (via go.mod; same-folder Go files are one package), `symbols.rs`, and `order.rs` (reading order inside a group). Config files (tsconfig, `Cargo.toml`, `go.mod`) are read from the version being shown: the working folder or the viewed branch's commit.
- `sessions/` — the shared `Session` model in `mod.rs`, one parser per agent (`claude.rs`, `codex.rs`), `codex_shell.rs`, `command.rs` (a shell command split into the programs it runs), `checks.rs` (which commands are checks, and whether they failed) and `effects.rs` (which commands change things outside the diff).
- Beside `data/`: `commands.rs` (the repo data commands, thin wrappers), `watch.rs` (live updates), `state.rs`, `license.rs`, `agents.rs` (Settings → Agents), `left_out.rs` (Settings → Files), `about.rs` (Settings → About), `app_data.rs` (the app's own JSON files).

Performance: reload ≈0.4 s, first load ≈1.7 s on a 121-file change. Parsed session files and map line counts are cached by (mtime, size); the worktree list is read once per reload.

## Rules the screens depend on

- **What's shown**: everything that could be committed — every changed, deleted and untracked (not ignored) file of any type; it must match `git status` exactly. Binary = a NUL byte in the first 8 KB (as git), listed with no text diff. Files matching the person's patterns in Settings → Files (`data/left_out.rs`, saved in `left-out.json` by `left_out.rs`, none by default) are split off in `group()` into `Grouping.left_out`: still in `stats`, `diffs` and the rule flags (a left-out folder must not hide a secret), listed as `story.left_out`, but not grouped, not linked to agent edits (Timeline) and not in the Map's lenses. Patterns read like .gitignore lines (no `/`: a name at any depth; a `/` inside: from the top; trailing `/`: folders; `**` any folders; no `!`). Changing them emits `sources-changed`, like an agent folder change.
- **Session ↔ branch**: an edit counts when (1) its turn ran in the repo or one of its worktrees (any recorded `cwd`), (2) the record's `gitBranch` is this branch — checked per edit, since a turn can switch branches; `HEAD` means unknown and matches by time and files only, (3) it's after the branch point, (4) it touches files still in the diff. A turn with a command that has effects outside the diff is kept without (4), even with no edits, when it started on this branch: a `git reset --hard` throws its edits out of the diff. Left-out counts are in the snapshot's `timeline.link` (`turns_kept`, `skipped`) but not shown in the window; check them with the `dump` example when the Timeline looks empty.
- **Grouping**: files imported by 3+ changed files are **shared building blocks**; files importing 4+ are **wiring**; both are cut out before clustering, giving 6–13 groups. Shared is a first-class group. Tests attach by name. A folder is "not connected" only when nothing in it links to anything.
- **Reading order** (`app/src-tauri/src/data/group/order.rs`): files inside a group come after the group files they import, ties go by name, and in a loop of imports the file waiting on the fewest goes first. Tests follow their source file. Group order is unchanged (biggest first).
- **Timeline**: a turn is one prompt of yours and everything the agent did for it. Inside a turn, edits are split into *steps* at agent messages (95% of edit groups have one right before). A turn sits at its latest edit or command, so a turn that only ran commands (a commit, a `git reset`) sits at the last one. Times are compared as times (agents write UTC, git writes local offsets).
- **Checks** (`app/src-tauri/src/data/sessions/checks.rs`): a command counts as a check when one of its parts runs a known test, type check, lint or build tool. Splitting is shared with effects in `command.rs`: at `&&`, `|`, `;` and newlines, heredoc bodies skipped, prefixes like `npx`, `uv run` and `FOO=1` dropped. A run carries `checks` (every kind, in order) and `check_cmd` (only the check parts, without redirections). Timeline shows checks and commands with effects, and hides the rest. A shown command that also edited files (format, then lint) stays as its own row after those edits.
- **Effects** (`app/src-tauri/src/data/sessions/effects.rs`): commands that change things the diff doesn't show — `install` (package managers), `delete` (`rm`, `git rm`, `find -delete`), `discard` (git that throws work away: `reset --hard`, `checkout -- / .`, `restore` without `--staged`, `stash` other than list/show/pop/apply, `clean`, `branch -d/-D`, forced push), `git` (commit, push, merge, rebase, switch, `stash pop`…), `network` (`curl`, `ssh`, `gh`, publish), `database` (clients and migrations). Read-only git (`status`, `diff`, `log`) is not an effect. A run carries `effects` and `effect_cmd`; `git checkout <path>` without `--` can't be told from a branch switch and counts as `git`.
- **Still in final** (survival): kept / partly rewritten / gone / undone per edit.
- **Rule flags** (no AI; matched text is never returned): possible secret, possible secret (.env file), tests weakened, tests skipped, test deleted, debug leftovers, dependency file, infra file, not connected. Explained in the ⓘ next to "Flagged" (`FlagRules.tsx`); the rule list, the window's copy of the flag texts and their matching live in `app/src/lib/flags.ts` (keep in step with `flags.rs`). Settings → Flags turns a rule off in the window only (`settings.flags.off`): the Rust side still computes it; `flagsOn` drops its flags on the Map, and "not connected" off also drops the note and amber border in Changes.
- **Branch views**: checked-out branch → working folder vs HEAD; a branch checked out in another worktree → that folder; any other branch → its commits since merge-base with the default branch (origin/HEAD, else main/master), read-only. Map sizes for a commit view use stored size / 40. The branch list leaves out a remote branch that has a local branch of the same name.
- **Live**: FSEvents (`notify`, 0.7 s debounce) on the repo and worktrees plus the agents' session folders (`projects` / `sessions` inside the folders above). Counted: non-ignored working files, `.git/HEAD`, `refs/`, `packed-refs`, session files for this repo. Not counted: ignored files, the index, other repos' sessions. Emits `repo-changed`.

## Agent state now (`data/activity.rs`, built and tested, not shown anywhere yet)

Sessions written in the last 3 days, each with repo, branch, agent, last prompt, and a state read from the end of the file (last 512 KB), no AI:
- **Claude Code**: last message is a tool call with no result → `working` under 30 s, then `waiting` (probably an approval prompt; a slow command looks the same) until 6 h, then `finished`. `end_turn` → `finished`. A tool result or prompt → `working` under 2 min. "[Request interrupted" → `finished` (and that marker is never used as the prompt).
- **Codex**: `task_complete` / `turn_aborted` → `finished`; an `*approval*` event → `waiting`; otherwise `working` under 2 min.
Tested in `activity.rs`. Costs ~5 ms warm. The pickers tried it (Needs you / Working badges, last prompt, time in state) and went back to plain change counts; wire it into a snapshot again when it has a place.

## Known gaps

Renamed branches don't match their old name; removed worktrees aren't in `git worktree list`. Planned fix: a manual "link a session" setting. Paths assume macOS (`HOME`, `/` separators, `canonicalize` form) — see the `product-decisions` skill for the Windows checklist.
