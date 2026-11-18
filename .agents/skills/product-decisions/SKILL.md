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
- **Icon: a red flame whose lower half turns into lines of code**, one of them green (an added line), on the app's dark rounded square (chosen Nov 2026 after several rounds; the flame keeps its full outline, the lines only break inside). Source: `app/src-tauri/icons/app-icon.svg`; the command that rebuilds every size is in the comment at its top. Ships as one icon (`icon.icns`, no separate light/dark versions): it is already dark and follows Apple's older template, which macOS 26+ shows without the gray box.
- **Live updates on** (reversed the earlier "no live updates"), with Live / Paused in the header.
- **Read-only**: never writes to the repo or the agents' files. Other branches are viewable read-only; the app never runs `git switch`. No accept/undo of hunks.
- **Agent-agnostic**: wording uses the agent's name per session; the AI color is shared.
- **Review marks are notes to yourself**: per file, three states — Looks good / Needs work / Not checked — reset when the agent changes the file again. Plain words on purpose, not Approve/Reject.
- **Three screens**: Changes (what), Timeline (how/when), Map (where). No separate Review screen.
- **Commits and pushes** happen only when the user asks.
- **Distribution: direct download only**, not the Mac App Store. No Developer ID for now, so first launch needs System Settings → Privacy & Security → Open Anyway.
- **Updates: built in**, from the main repo's GitHub releases (so the repo goes public at launch). Checks on start, can be turned off in Settings → Updates; installs in the background, then "Restart to update" in the header. A check sends nothing about your code (see the `releases` skill). First public version: **1.0.0**.
- **Content Security Policy on** (`tauri.conf.json`): only the app's own files; `'unsafe-inline'` styles and `'wasm-unsafe-eval'` because the diff library needs them. Anything loaded from the web needs an entry there.
- **License: custom source-available** (`LICENSE` at the repo root). Public to read, audit and build for your own use. Not allowed: redistributing it, building a competing product from it, or getting around the license check. FSL and PolyForm Perimeter were rejected (one turns into open source after two years, the other allows redistribution).

## Parked (decided not now)

- **A Liquid Glass icon** (macOS 26+): a layered `.icon` made in Icon Composer with Default, Dark and Mono looks, compiled with `actool`. Tauri doesn't support it natively (only `icon.icns`); the community tool `tauri-liquid-icon` does it, but it's untried. Polish before launch, not needed to ship. The SVG's layers (background, flame, lines) map onto Icon Composer's layers.
- More review inside Changes: "12 of 39 checked" progress, an unchecked-only filter, "changed since you checked" showing only the new edits (our edge: we know each edit after your mark, with the agent's words), "Copy for agent" notes, commit button when all checked.
- Settings candidates: base to compare against, grouping thresholds (shared 3+, wiring 4+), manually linking sessions to a branch, default filters, files to always leave out (user's choice only; nothing hidden by default).
- A fourth axis screen: Commits/ship (planned commits from groups) was the strongest candidate; Prompts overlaps Timeline; Compare (checkpoints) is heavier.

## Tried and dropped

- **Scroll past the end of a diff to open the next file**: five versions, all broke on real Mac trackpads (momentum events for 1–2 s, no swipe start/end signal). Previous/next is ↑↓ and J/K only. If revisited in the desktop app, use native gesture phases.
- **Hiding untracked non-code files**: hid real agent output (`upload.md`, `.srt`); now everything committable is shown.

## Research worth keeping

How others mark files as reviewed: GitHub/GitLab/Bitbucket/Superconductor/VS Code all clear the mark when the file changes and make you re-read the whole file; only Reviewable shows the delta since your review, and nobody does it for agent edits. Per-hunk marks exist only where the tool also accepts/reverts edits.

Hooks (Claude Code, documented, not verified live): `PostToolUse` has tool input/response; `MessageDisplay` streams text; `FileChanged` fires on any disk change. Can't: inject a message into or interrupt a running session from outside, rewind the conversation, stream edits character by character.

## Windows checklist (when it's time)

`HOME` → also `USERPROFILE` (paths.rs); normalize paths (`\`, drive letters, `\\?\` from canonicalize; ~9 places split on `/`); hide console windows on `git` calls (`CREATE_NO_WINDOW`); "this Mac" wording (3 places in license screens); ⌘ → Ctrl in shortcut labels and badges; build and sign on Windows/CI.
