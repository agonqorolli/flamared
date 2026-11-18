---
name: agent-data
description: What coding agents record on disk and how the app turns it into Changes, Timeline and Map — Claude Code transcripts, Codex rollouts, git, the Rust data layer (src-tauri/src/data), linking sessions to a branch, grouping by imports, rule flags, "still in final", live watching, branch views, caching. Use when changing anything under app/src-tauri/src/data, adding an agent adapter or a language's imports, or answering what the app can know about an agent's work.
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

Facts measured on real sessions:

- Edit/Write results carry `structuredPatch` + `originalFile`. **48% of file changes came through Bash** (`toolUseResult.bashEditDiff`), so shell edits are essential.
- Only ~22% of edits have agent narration right before them; thinking text is mostly empty. Don't design around reasoning.
- Harness messages (`<task-notification>`…) look like user messages; filter them out of prompts.
- Since 2026-11, transcripts also hold `"type":"api-request-blob"` records that repeat earlier tool results without `toolUseResult`. Pair a tool call only with `type: "user"` records, or a later blob replaces the real result and the edit loses its diff (Timeline showed no edits).
- `userModified` was always 0: "you edited this" must come from git diff minus recorded edits.
- Test pass/fail is rarely parseable from output.
- Codex records its branch once per session (mid-session switches aren't seen); Codex session id = last 8 characters of the file stem (all stems start with `rollout-`).
- Other agents (planned adapters): Cursor (internal DB, `hooks.json`), Gemini CLI (`~/.gemini/tmp/…`, checkpoints), Agent Trace records. Any agent: git + file watching. One adapter per agent produces the same session → turn → events (message, edit with diff, command) model; everything else runs on that model.

## The Rust layer (`app/src-tauri/src/data/`)

- `snapshot/` — `build(top, base, at)` in `mod.rs` is one screen load; `view(repo, branch)` picks how to show a branch. One file per part: `timeline.rs` (which turns and edits belong to the change), `story.rs` (the Changes sections), `diffs.rs`, `flags.rs`, `map.rs`. `model.rs` declares everything sent to the window as typed structs; its mirror is `app/src/lib/types.ts`.
- `repos.rs`, `branches.rs` — the repo and branch pickers' data (`known_repos`, `repo_status`, `branches`, `branch_files`), and what a viewed branch is compared with (`split_off`).
- `tree.rs` — `At::Work` (working folder, uncommitted + untracked) or `At::Commit(rev)` (another branch, read via `git show` without touching the checkout).
- `git.rs`, `paths.rs`, `cache.rs` — git calls and the repeated questions (`current_branch`, `toplevel`, `worktrees`), path helpers, and remembering what was read from a file until it changes. Every git call runs with `core.quotePath=false`, so non-ASCII names ("café.ts") read the same from every command.
- `diff.rs` — what git says changed: the files, their line counts, and one whole-repo `git diff` split per file (`diff_by_file`).
- `group/` — grouping by imports: clustering in `mod.rs`, imports per language in `imports.rs` (TS/JS, Python), `tsconfig.rs` (tsconfig/jsconfig aliases), `rust.rs` (`use`/`mod`/`crate::`), `go.rs` (via go.mod; same-folder Go files are one package), and `symbols.rs`. Config files (tsconfig, `Cargo.toml`, `go.mod`) are read from the version being shown: the working folder or the viewed branch's commit.
- `sessions/` — the shared `Session` model in `mod.rs`, one parser per agent (`claude.rs`, `codex.rs`), and `codex_shell.rs`.
- Beside `data/`: `commands.rs` (the repo data commands, thin wrappers), `watch.rs` (live updates), `state.rs`, `license.rs`, `app_data.rs` (the app's own JSON files).

Performance: reload ≈0.4 s, first load ≈1.7 s on a 121-file change. Parsed session files and map line counts are cached by (mtime, size); the worktree list is read once per reload.

## Rules the screens depend on

- **What's shown**: everything that could be committed — every changed, deleted and untracked (not ignored) file of any type; it must match `git status` exactly. Binary = a NUL byte in the first 8 KB (as git), listed with no text diff.
- **Session ↔ branch**: an edit counts when (1) its turn ran in the repo or one of its worktrees (any recorded `cwd`), (2) the record's `gitBranch` is this branch — checked per edit, since a turn can switch branches; `HEAD` means unknown and matches by time and files only, (3) it's after the branch point, (4) it touches files still in the diff. Left-out counts are in the snapshot's `timeline.link` (`turns_kept`, `skipped`) but not shown in the window; check them with the `dump` example when the Timeline looks empty.
- **Grouping**: files imported by 3+ changed files are **shared building blocks**; files importing 4+ are **wiring**; both are cut out before clustering, giving 6–13 groups. Shared is a first-class group. Tests attach by name. A folder is "not connected" only when nothing in it links to anything.
- **Timeline**: turns split at agent messages (95% of edit groups have one right before). A turn sits at its latest edit. Times are compared as times (agents write UTC, git writes local offsets).
- **Still in final** (survival): kept / partly rewritten / gone / undone per edit.
- **Rule flags** (no AI; matched text is never returned): possible secret, possible secret (.env file), tests weakened, tests skipped, test deleted, debug leftovers, dependency file, infra file, not connected. Explained in the ⓘ next to "Flagged" (`FlagRules.tsx`).
- **Branch views**: checked-out branch → working folder vs HEAD; a branch checked out in another worktree → that folder; any other branch → its commits since merge-base with the default branch (origin/HEAD, else main/master), read-only. Map sizes for a commit view use stored size / 40. The branch list leaves out a remote branch that has a local branch of the same name.
- **Live**: FSEvents (`notify`, 0.7 s debounce) on the repo and worktrees plus `~/.claude/projects` and `~/.codex/sessions`. Counted: non-ignored working files, `.git/HEAD`, `refs/`, `packed-refs`, session files for this repo. Not counted: ignored files, the index, other repos' sessions. Emits `repo-changed`.

## Agent state now (`data/activity.rs`, built and tested, not shown anywhere yet)

Sessions written in the last 3 days, each with repo, branch, agent, last prompt, and a state read from the end of the file (last 512 KB), no AI:
- **Claude Code**: last message is a tool call with no result → `working` under 30 s, then `waiting` (probably an approval prompt; a slow command looks the same) until 6 h, then `finished`. `end_turn` → `finished`. A tool result or prompt → `working` under 2 min. "[Request interrupted" → `finished` (and that marker is never used as the prompt).
- **Codex**: `task_complete` / `turn_aborted` → `finished`; an `*approval*` event → `waiting`; otherwise `working` under 2 min.
Tested in `activity.rs`. Costs ~5 ms warm. The pickers tried it (Needs you / Working badges, last prompt, time in state) and went back to plain change counts; wire it into a snapshot again when it has a place.

## Known gaps

Renamed branches don't match their old name; removed worktrees aren't in `git worktree list`. Planned fix: a manual "link a session" setting. Paths assume macOS (`HOME`, `/` separators, `canonicalize` form) — see the `product-decisions` skill for the Windows checklist.
