---
name: code-patterns
description: How code is written in this repo, with examples — the patterns for the Rust side (data layer, Tauri commands), the React + TypeScript window, and Tailwind/shadcn use, plus the formatters and linters that enforce part of them. Use whenever writing or changing any code under app/ (app/src or app/src-tauri) — a new function, component, command or file, a rename, a split, a bug fix.
---

# Code patterns

The aim behind every pattern: a reader understands a piece without reading the rest. Follow the pattern the code around you already uses; when you add one, add it here.

## Checks (run before calling a change done)

```bash
cd app && pnpm format && pnpm lint && npx tsc --noEmit -p .
cd app/src-tauri && cargo fmt && cargo clippy --all-targets && cargo test --lib
```

Prettier and rustfmt format at 120 columns. ESLint and Clippy must come back with nothing. `src/components/ui/` (shadcn) is left out of both window checks.

## Everywhere

- **Names say what the value is.** One-letter names only in one-line closures. `tool_result`, not `tur`; `stats`, not `x2`.
- **A comment says what the thing is for**, in plain words: `//!` at the top of each Rust file, `///` on functions, one line above each component. Never one that restates the code.
- **A number with a meaning gets a name**: `MAX_DIFF_LINES`, `HINT_DELAY_MS`, `FOLDER_LABEL_HEIGHT`.
- **A fact asked in two places gets one helper**, next to what it is about.
- **Behavior and data shape are not a refactor's to change.** The JSON the window gets is declared in `src-tauri/src/data/snapshot/model.rs` and mirrored in `src/lib/types.ts`; change the two together.

## Rust (`app/src-tauri/src`)

**One job per function, one topic per file.** A function that needs `// --- section` markers is several functions; a file with several topics is a folder. `snapshot::build` reads as its steps:

```rust
let grouping = group(top, base, at)?;
let linked = timeline::link(&Scope { top, at, branch: &branch, base_time, roots: &roots, changed });
let files = Files::new(&grouping, &stats, &binary, &linked.words);
let diff_lines = diffs::lines_by_file(top, base, at, changed, &untracked);
```

**Typed structs for everything sent to the window**, never `json!` maps. Rename in serde, not in the name:

```rust
#[derive(Serialize)]
#[serde(tag = "k", rename_all = "lowercase")]
pub enum Event {
    Say {
        #[serde(rename = "t")]
        text: String,
    },
    Edit(EditEvent),
    Run(RunEvent),
}
```

**Ask git and the file system through the shared helpers**: `git::{git, git_line, current_branch, toplevel, worktrees, repo_roots}`, `cache::cached` (remember what was read until the file changes), `app_data::{read, write}` (the app's own JSON files).

**Leave early.** `let … else { return/continue }`, `?`, and let chains instead of nested `if let`:

```rust
if let Ok(folder) = serde_json::from_str::<String>(&format!("\"{}\"", &found[1]))
    && !folders.contains(&folder)
{
    folders.push(folder);
}
```

**A regex is a `static NAME: LazyLock<Regex>` at the top of its file**, compiled once.

**A struct instead of a tuple** once it has more than two parts or crosses a function: `PathAlias { prefix, suffix, targets }`, `SplitOff { tip, base, against }`.

## Tauri commands

**A command is a thin typed wrapper; the work is in its module.** Repo data commands are in `commands.rs`; `watch.rs`, `state.rs`, `license.rs`, `agents.rs`, `left_out.rs` and `about.rs` hold their own. Anything that reads git or session files goes through `blocking`:

```rust
#[tauri::command]
pub async fn repo_status(repos: Vec<String>) -> Result<Vec<RepoStatus>, String> {
    blocking(move || status_of_each(&repos)).await
}
```

**The window calls Rust only in `src/lib/api.ts`**: one typed function per command, and the only file that imports `@tauri-apps` (lint enforces it). A module with a browser-preview stand-in checks `inTauri` from there.

Adding a command: the function and its `#[tauri::command]`, its name in `generate_handler!` (`lib.rs`), a function in `api.ts`, and its types in `model.rs` / `types.ts`.

**The window runs under a Content Security Policy** (`app.security.csp` in `tauri.conf.json`): scripts, fonts and images from the app itself only. Styles allow `'unsafe-inline'` (the diff library writes `style` attributes and `<style>` nodes; `dangerousDisableAssetCspModification` keeps Tauri's nonces from cancelling that) and scripts allow `'wasm-unsafe-eval'` (its highlighter). Loading anything from the web means adding it there.

## React (`app/src`)

**Every screen has the same file set**: `XView.tsx` (state and keys), `XList.tsx` (the left list), the detail beside it, and `model.ts` (what is worked out from the snapshot). Components render; `model.ts` and `lib/` compute:

```ts
// components/timeline/model.ts
export function fileHistory(edits: TimelineEdit[], path: string): PlacedEdit[] { … }
```

**UI that appears twice is a shared component** (the `design-system` skill lists them): `JumpButton`, `InfoButton`, `ListPane` + `AgentToggle`, `ListRow` + `FreshDot`, `MiniCard`, and in Settings `SettingRow`, `Choice`, `SettingsBody`.

```tsx
<JumpButton to="timeline" onClick={onShowInTimeline} />
<SettingRow label="Long lines" description="Scroll sideways, or wrap onto the next line.">
  <Choice value={diff.longLines} options={LONG_LINES} onChange={(longLines) => setDiff({ longLines })} />
</SettingRow>
```

**One component per file once it has state or is more than a few lines**; small parts of one thing share its file (`MiniCard` + `MiniRow`). An exported component, or one with more than three props, gets an `interface Props` above it.

**Shared state is a context with a hook that throws without its provider** (`useSettings`, `useLicense`); saved values go through `lib/store.ts` (`getJson` / `setJson`).

**State the three screens share for one repo view is made once in `Screens.tsx` and passed down as props**: the timeline (`buildTimeline`) and the review marks (`useReview`, set in Changes, shown on the Map). A context is for app-wide state (settings, license).

## TypeScript

**Named fields, not positions**: tables are objects (`SURVIVAL[state].label`, `TIPS[tip].title`), never tuples read by index.

**Plain statements, not tricks.** No comma expressions, no `return void (x = y)`, no `!` to quiet the type checker (lint enforces all three). Type the value so it can't be missing:

```ts
type Entry =
  | { at: number; kind: "turn"; session: TimelineSession; turn: TimelineTurn; index: number }
  | { at: number; kind: "commit"; commit: TimelineCommit };
```

A chain of nested ternaries is a function with early returns (`headline` in `lib/waiting.ts`).

**`function` for anything with a body; an arrow `const` for a one-expression helper** and for callbacks.

**Imports in one block**: packages, then `@/…`, then relative (lint sorts them). React types are imported by name (`type ReactNode`), not written `React.ReactNode`.

## Tailwind and shadcn

**A class string that repeats gets one home**: a shared component, or a named constant beside its users (`SELECTED_ROW` in `components/ListRow.tsx`, `PICKER_GROUP` in `components/header/PickerItem.tsx`).

**`components/ui/` stays as shadcn generated it**, apart from the changes the `design-system` skill lists; app styling goes in our own components, merged with `cn` from `@/lib/utils`.

**Tokens and spacing units as the `design-system` skill says.** Where a px value is right (the map's layout, the title bar), it is a named constant with the reason.
