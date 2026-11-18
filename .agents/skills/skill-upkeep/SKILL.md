---
name: skill-upkeep
description: Keep the project skills true after main moves — read what changed on main since the last review, find what in .agents/skills is now stale, missing or no longer needed, and recommend precise updates (update, add, remove) for the user to approve. Use when a hook says main moved, after a commit, merge or push to main, or when the user asks to check or refresh the skills.
---

# Skill upkeep

Project knowledge lives in `.agents/skills/` (`.claude/skills` is a symlink to it, so Claude Code finds them; no notes files). Code moves faster than skills, so after main moves, review the new commits and recommend what the skills should say now. **Recommend first; edit only after the user says which recommendations to apply.**

## 1. The range

- From the hook message (`main moved: <old>..<new>`), or:
- `last=$(cat "$(git rev-parse --git-common-dir)/skill-upkeep-last" 2>/dev/null)`; new = local `main` when it is ahead of `origin/main` (after `git fetch -q origin main`), else `origin/main`.
- No marker: review the last merge into main (`git log --merges -1 main`) or ask the user how far back.

## 2. What changed

```bash
git log --oneline --no-merges <old>..<new>
git diff --stat <old>..<new>
git diff <old>..<new> -- <area>        # read the areas that matter, not the whole diff blindly
```

Commit messages carry decisions ("drop X", "reverse Y", "rename Z") — those matter as much as code.

## 3. Which skills it touches

| Changed path | Skill |
|---|---|
| `app/src/index.css`, `app/src/components/**` (not `ui/`), `app/src/lib/utils.ts`, wording in UI strings | `design-system` |
| `app/src/components/ui/**`, `components.json` | `design-system` (shadcn notes), `shadcn` is external — never edit it |
| `app/src/lib/keys.ts`, `KeyHint`, `useKeys` callers | `keyboard-shortcuts` |
| `app/src-tauri/src/license.rs`, `examples/license.rs`, `app/src/lib/license.tsx`, `components/license/**`, `src/brand.ts` (`BUY_URL`) | `license-keys` |
| `app/src-tauri/src/data/**`, `watch.rs`, `state.rs`, `app/src/lib/types.ts` | `agent-data` |
| `app/src-tauri/examples/**`, `vite.config.ts`, `package.json` scripts, `.claude/launch.json`, test setup | `preview-and-verify` |
| `app/src/lib/updates.tsx`, `app/scripts/latest-json.mjs`, the version and `plugins.updater` in `app/src-tauri/tauri.conf.json`, `app/src-tauri/capabilities/` | `releases` |
| `app/src/brand.ts`, `app/src-tauri/icons/**`, the `[[bin]]` name in `app/src-tauri/Cargo.toml` | `product-decisions` |
| product scope, pricing, platforms, names, anything a commit message calls a decision | `product-decisions` |
| `AGENTS.md`, `.agents/skills/**`, `.claude/skills` symlink, `.claude/settings.json`, `.claude/hooks/**` | `skill-upkeep` (this one) |

Something with no row and no home (a new subsystem, a new screen, a new external service) → candidate for a **new skill** or a new section.

## 4. Check each affected skill

Read the whole skill, then for every claim the change could have touched:

- **Names and paths** still exist: run `.agents/skills/skill-upkeep/check-paths.sh` (lists backticked paths in skills that no longer exist), and grep identifiers (`rg -n 'SideColumn|--side-w' app/src`).
- **Values** still match: keys, token names, sizes, thresholds (shared 3+ / wiring 4+), counts, commands. Re-run a quoted command if cheap.
- **Behavior** described is what the code now does (read the diff, not just names).
- **Decisions**: a reversed decision gets rewritten, not appended to ("~~old~~ → new" only if the history is the point).

Classify each finding:

- **Stale** — says something now false → replace it.
- **Missing** — the change added a rule, token, component, key, command or decision someone will need → add it in the skill that owns that area (keep the skill's existing structure).
- **Obsolete** — describes something removed, or detail nobody will need again → remove it.
- **Split / merge** — a skill grew past ~150 lines or two skills now overlap → propose the split or merge.

Also refresh a skill's `description` when what it covers changed — that's what decides when it loads.

## 5. Report

One short list, by skill, most important first:

```
design-system — update
  · Stale: "side column 200–220px" → now 220–260px (index.css --side-w changed in a1b2c3d)
  · Missing: new `text-caption` size (12px, used in Timeline headers)
license-keys — no change
NEW skill? release-builds — the commits add a signing/notarizing pipeline with no home
```

Quote the exact replacement text for each stale or missing item so the user can approve it as written. Say plainly when nothing needs changing. Then ask which to apply.

## 6. Apply and record

- Apply only what was approved, on the current working branch (never commit straight to main); commit only if the user asks.
- After the review is done (applied or declined), record the reviewed tip so the hook stops reminding:
  `git rev-parse <new> > "$(git rev-parse --git-common-dir)/skill-upkeep-last"`

## How the reminder works

`.claude/hooks/main-moved.sh` (wired in `.claude/settings.json`) runs at session start (after a quick `git fetch` of main, so merges made on GitHub count) and after `git commit`, `git push` and `gh pr merge`. It compares the newer of `origin/main` and local `main` with `skill-upkeep-last` in the git folder (per clone, never committed) and, when main moved, asks Claude to run this skill. The first time, it only records the tip.
