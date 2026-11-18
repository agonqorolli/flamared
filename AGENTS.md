# Flamared

A desktop app for checking the uncommitted code changes AI coding agents (Claude Code, Codex) make. Tauri 2 (Rust) with a React + TypeScript window. Everything runs locally; the app reads git and agent session files and never writes to them.

Detailed project knowledge lives in skills under `.agents/skills/` (`.claude/skills` links there). Load the matching skill before working in its area:

| Working on | Load |
| --- | --- |
| Writing or changing any code in `app/` (Rust or the window) | `code-patterns` |
| Anything people see in `app/src` (screens, cards, labels, colors, spacing, a new shadcn component) | `design-system` (and `shadcn` for the components themselves) |
| `app/src-tauri/src/data/`, agent adapters, imports per language, live watching | `agent-data` |
| Adding or changing a keyboard shortcut | `keyboard-shortcuts` |
| License keys, the trial, `license.rs`, `lib/license.tsx` | `license-keys` |
| Running the app or proving a change works | `preview-and-verify` |
| The version, building and publishing a release, the updater and its signing key | `releases` |
| Scope, wording, behavior, "why is it like this", what's next | `product-decisions` |
| Keeping the skills true after main moves | `skill-upkeep` |

## Layout

- `app/`: the desktop app. `src/` is the window (`components/changes/`, `components/timeline/`, `components/map/` are the three screens); `src-tauri/src/` is the Rust side (`data/` is the data layer).

## Commands

Use `pnpm`, not npm or yarn.

```bash
cd app && pnpm install
cd app && pnpm tauri dev                 # the app, with the Rust side
cd app && pnpm format && pnpm lint && npx tsc --noEmit -p .                       # after every frontend change
cd app/src-tauri && cargo fmt && cargo clippy --all-targets && cargo test --lib   # after Rust changes
```

The browser preview (no Rust side, from a saved snapshot) is in the `preview-and-verify` skill.

## Rules

- Work on `main`; no branch is needed. Commit only when asked.
- Never print, paste or commit the license signing key (`~/.flamared-keys/`).
- Commit messages: one short imperative line in plain words, like the existing history ("Add live updates: watch the repo and agent sessions").
- Settled product questions are in `product-decisions`; check there before reopening one.
