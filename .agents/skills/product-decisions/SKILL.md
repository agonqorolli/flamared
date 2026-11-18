---
name: product-decisions
description: What the product is, the decisions already made (and why), what's parked, what was tried and dropped, and research behind features — so new work fits and settled questions aren't reopened. Use when planning a feature, choosing wording or behavior, deciding scope, or when the user asks "why is it like this" or "what's next".
---

# Product decisions

**What it is**: a desktop app for checking the code changes AI coding agents make (Claude Code, Codex, more later) before you commit — what changed, grouped by logic, with the agent's own words next to each edit. Dark-first. No AI processing; your code and sessions never leave the machine.

## Settled

- **Desktop app, Tauri**, macOS first; Windows later from the same code (checklist below).
- **One-time purchase, offline license, 14-day trial** (see the `license-keys` skill). Reinstalling resets the trial — accepted. Seller (Paddle / Lemon Squeezy) not chosen yet.
- **Name: Flamared** (chosen Nov 2026; a made-up name, picked because the bare .com and .app were free and nothing in dev tools uses it). Keep it only in `app/src/brand.ts` plus `tauri.conf.json` (productName, window title). Bundle ID **`com.flamared`** — final; changing it after the first public build loses users' saved data and license.
- **Icon: a red flame whose lower half turns into lines of code**, one of them green (an added line), on the app's dark rounded square (chosen Nov 2026 after several rounds; the flame keeps its full outline, the lines only break inside). Drawn flat (redrawn 14 Nov 2026 because the first version looked dated): one flat red `#FF453A`, green `#3DDC84`, a flat `#17181B` tile, no gradients or edge highlight, and three thick lines instead of five thin ones so it still reads at 16–32px. The same day the outline was redrawn too: the bottom is an exact half circle, and the two tongues are larger and evenly weighted, but their edges stay S-curves (the main tip flicks, the inner edges curve into the notch). The two tips are rounded very slightly, so they still read as points but match the round line ends; clearly rounded tips were tried and read as fingers or a blob. The code lines and the gaps between them sit on a 32-unit grid (64 thick, 32 apart) so they land on whole pixels at every icon size; with 22-unit gaps the one above the green line blurred into the red line at 64px. An all-arc version with every edge bulging out was tried and read as leaves, not a flame. Source: `app/src-tauri/icons/app-icon.svg`; the command that rebuilds every size is in the comment at its top. Ships as one icon (`icon.icns`, no separate light/dark versions): it is already dark and follows Apple's older template, which macOS 26+ shows without the gray box. The loading screen draws the same flame in code (`components/loading/LogoLoader.tsx`, its outline and lines copied from the SVG), so a change to the icon's shape means updating it there too.
- **Live updates on** (reversed the earlier "no live updates"), with Live / Paused in the header.
- **Read-only**: never writes to the repo or the agents' files. Other branches are viewable read-only; the app never runs `git switch`. No accept/undo of hunks.
- **Agent-agnostic**: wording uses the agent's name per session; the AI color is shared.
- **Review marks are notes to yourself**: per file, three states — Looks good / Needs work / Not checked — reset when the agent changes the file again. Plain words on purpose, not Approve/Reject.
- **A reset mark keeps the lines you saw**: lines new since then get a blue bar in the diff, with a line above it like "3 lines changed since you marked it Looks good" (same for Needs work). It compares with the version you marked, so hand edits count too. Chosen over showing only the new edits: the reset stays, the bar shows how much to re-read.
- **Changes lists files in reading order inside each group**: each file after the group files it imports, tests after their source.
- **Timeline shows the checks the agent ran** (tests, types, lint, build) with pass or fail, plus a "Checks after this edit" card per edit. Other commands stay hidden. A per-edit "not tested since" tag was rejected as noisy in sessions that never run tests.
- **The Map's Checked lens** (key 4) colors each code file by the checks after the agent's last edit of it: *tested* (a test run passed; any one after the edit, even if lint ran last), *lint/types only* (checks passed, none ran tests), *failed* (the latest check failed), *no check*. Lint alone doesn't count as tested: agents almost always lint at the end, so it would turn everything green. "Tested" means tests ran and passed after the edit, not that they cover the file (no coverage data). Docs, config and assets stay gray; so does a file only you changed.
- **The Map's Reviewed lens** (key 5) colors files by your marks: Looks good, Needs work, changed since your mark (blue, as in the diff), not checked (gray). The overview counts "Reviewed 3 of 14" with how many need work or changed. Marks live in `Screens` (`useReview`) and are passed to Changes and Map, so a mark shows on the Map at once.
- **Map lens order**: Change size, Rework, Still in final, Checked, Reviewed, Flags (keys 1–6): the agent's work as it happened (changed, reworked, what survived, verified), then your review, then the rules' warnings last.
- **Outside the diff**: commands that change things the diff doesn't show (installs, deletes, git that throws work away, other git, network, databases) appear as rows in Timeline and in an "Outside the diff" card on the Map overview (latest 6). Throwing work away and deleting are red, installs, network and databases amber, plain git quiet. A failed command still shows, marked "failed" (it may not have happened).
- **Three screens**: Changes (what), Timeline (how/when), Map (where). No separate Review screen.
- **On launch**: the last repo, and if it can't be read any more (moved or deleted), the repo an agent worked in most recently; the error stays only when there is no other repo.
- **Commits and pushes** happen only when the user asks.
- **Distribution: direct download only**, not the Mac App Store. No Developer ID for now, so first launch needs System Settings → Privacy & Security → Open Anyway.
- **Updates: built in**, from the main repo's GitHub releases (so the repo goes public at launch). Checks on start, can be turned off in Settings → Updates; installs in the background, then "Restart to update" in the header. A check sends nothing about your code (see the `releases` skill). First public version: **1.0.0**.
- **Content Security Policy on** (`tauri.conf.json`): only the app's own files; `'unsafe-inline'` styles and `'wasm-unsafe-eval'` because the diff library needs them. Anything loaded from the web needs an entry there.
- **License: custom source-available** (`LICENSE` at the repo root). Public to read, audit and build for your own use. Not allowed: redistributing it, building a competing product from it, or getting around the license check. FSL and PolyForm Perimeter were rejected (one turns into open source after two years, the other allows redistribution).

## Parked (decided not now)

- **A Liquid Glass icon** (macOS 26+): a layered `.icon` made in Icon Composer with Default, Dark and Mono looks, compiled with `actool`. Tauri doesn't support it natively (only `icon.icns`); the community tool `tauri-liquid-icon` does it, but it's untried. Polish before launch, not needed to ship. The SVG's layers (background, flame, lines) map onto Icon Composer's layers.
- More review inside Changes: "12 of 39 checked" progress, an unchecked-only filter, "Copy for agent" notes, commit button when all checked.
- Settings candidates: base to compare against, grouping thresholds (shared 3+, wiring 4+), manually linking sessions to a branch, default filters, files to always leave out (user's choice only; nothing hidden by default).
- A fourth axis screen: Commits/ship (planned commits from groups) was the strongest candidate; Prompts overlaps Timeline; Compare (checkpoints) is heavier.
- Trust ideas built from the transcript (no AI), in this order: *what changed at the edges* (new packages, env vars, endpoints, changed exports, from the diffs), *leftovers from abandoned approaches* (edits from before an interrupt still in the final diff; interrupts are recorded reliably), *struggle* (weigh failed checks into Rework).
- Timeline: "fold all to prompts" with a summary line per turn (files, edits, failed checks, edits gone). Not "chapters by prompt": each card is already one prompt.

## Tried and dropped

- **Scroll past the end of a diff to open the next file**: five versions, all broke on real Mac trackpads (momentum events for 1–2 s, no swipe start/end signal). Previous/next is ↑↓ and J/K only. If revisited in the desktop app, use native gesture phases.
- **Asked vs done** (files never named in your prompts): real prompts are too vague to match ("continue", "lets implement 1 first"), so nearly every file would be flagged.
- **Blind edits** (edited without reading): Claude Code's Edit tool refuses a file the agent hasn't read, so it only happens through shell edits, which the Timeline already shows as made by a command.
- **Hiding untracked non-code files**: hid real agent output (`upload.md`, `.srt`); now everything committable is shown.

## Research worth keeping

How others mark files as reviewed: GitHub/GitLab/Bitbucket/Superconductor/VS Code all clear the mark when the file changes and make you re-read the whole file; only Reviewable shows the delta since your review, and nobody does it for agent edits. Per-hunk marks exist only where the tool also accepts/reverts edits.

Hooks (Claude Code, documented, not verified live): `PostToolUse` has tool input/response; `MessageDisplay` streams text; `FileChanged` fires on any disk change. Can't: inject a message into or interrupt a running session from outside, rewind the conversation, stream edits character by character.

## Windows checklist (when it's time)

`HOME` → also `USERPROFILE` (paths.rs); normalize paths (`\`, drive letters, `\\?\` from canonicalize; ~9 places split on `/`); hide console windows on `git` calls (`CREATE_NO_WINDOW`); "this Mac" wording (3 places in license screens); ⌘ → Ctrl in shortcut labels and badges; build and sign on Windows/CI.
