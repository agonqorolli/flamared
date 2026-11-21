---
name: design-system
description: The app's design system — theme tokens (colors, text sizes, spacing, layout widths, map lens colors), the shared components (Eyebrow, SideColumn, FileCard, MiniCard, KeyHint…), layout and wording rules. Use before building or changing anything in app/src that people see: a screen, a card, a button, a label, a color, a margin, a new shadcn component.
---

# Design system

The window is shadcn/ui (Radix, "Nova" preset) on Tailwind CSS 4, with the app's own tokens in `app/src/index.css` and a few shared components. New UI is built from these; a raw value (a px size, a hex color, a width formula) is a sign something is missing from the system — add a token or component instead.

## Tokens (`app/src/index.css`)

**Colors** — always a token, never hex/hsl in components. shadcn's roles (`background`, `foreground`, `card`, `muted`, `border`, `primary`…) plus the app's:

| Token | Use |
|---|---|
| `panel`, `raised` | header/panel surface; hover and raised surfaces |
| `faint`, `subtle` | secondary text (labels, meta); quieter body text |
| `selection`, `selection-bg` | selected row, fresh dot, new lines since you marked a file (the bar in the diff), accents |
| `add` / `add-bg`, `rem` / `rem-bg` | added / removed lines, "Looks good" / "Needs work" |
| `warn` | flags, "not connected", partly kept |
| `ai`, `ai-foreground`, `ai-bg` | the agent's own color (agent-neutral violet) |
| `map-bg`, `map-tile`, `map-edge`, `map-folder` | treemap surfaces |
| `--lens-*` (size low→high, flag, tested, passed, failed, no-checks, approved, rejected, changed, none, text) | map data colors; used through `var()` in `LENSES` (`components/map/model.ts`) |
| `logo-flame`, `logo-line` | the logo's flat flame red and green code line, the same in every theme (copied from the app icon); only the loading logo uses them |

Three themes, each defining every token: Light (`:root`), Dark (`.dark`), Gray (`.dark.gray`, only surfaces change). The System setting is not a fourth set of tokens: it picks Gray or Light from macOS (`resolveTheme` in `settings.tsx`), and code that colors itself reads the resolved `theme` from `useSettings()`, not `settings.appearance.theme`. **Default: Gray, Normal density** (`DEFAULTS` in `src/lib/settings.tsx`, and `class="dark gray"` in `index.html` so the first paint matches). A new color token gets a value in Light and Dark (Gray inherits Dark unless it is a surface).

**Text sizes** — Tailwind's `xs` (12px) and up, plus three below it, named by use:

| Class | Size | Use |
|---|---|---|
| `text-micro` | 10px | uppercase labels, key badges, times, small tags |
| `text-mini` | 11px | counts ("8 files"), paths, notes under a value, status letters |
| `text-name` | 13px | a group's name in the Changes list |

`tracking-label` (0.06em) goes with uppercase labels — use `<Eyebrow>` rather than writing it out.

**Spacing and density** — everything is in spacing units (`p-3`, `gap-3`, `w-75`), never px, so Compact / Normal / Spacious (`--spacing` 3 / 4 / 5px) scales the whole window. Text never scales with density, so neither do the widths of the panes that hold it (below).

**Layout widths** — `--list-w` (the left list, 300px) and `--side-w` (the right column: 26% of what is left beside the list, 200–220px) are the defaults, in px at every density: the text in them doesn't scale, and a roomier density mustn't take the room from the diff. Dragging a `PaneHandle` sets that variable on `:root` and saves it (`lib/panes.ts`); double-click resets it. Both are used through components/classes below, never recomputed.

**Radius** — buttons, toggles, rows: 8px (`rounded-md`, shadcn's small sizes). Cards: `rounded-xl` (side column) / `rounded-lg` (list groups). Map tiles: 2px. Info buttons: full circle.

## Layout rules

- **12px everywhere**: the screen margin is `p-3` on all four sides; the header is `px-3` (in the Mac app it is also the title bar: `pl-[88px]` leaves room for the window buttons, the same 14px after them as before them, in px so density doesn't move it, and its empty space drags the window); gaps between columns and between cards are `gap-3`; notice banners `mx-3`. Content, header items, toggles and the side column all line up on that 12px edge.
- **Every screen has the same skeleton**: optional left list (`w-(--list-w)`, `border-r bg-sidebar`, toggle row `px-3 pt-3`) → main content → `<SideColumn>`. Switching screens must not move the toggle or the side column; check by measuring (see the `preview-and-verify` skill).
- Screen tabs in the header have no focus ring: Radix focuses a tab on click and WebKit then shows the ring on every click; the underline marks the screen.
- Lists: section label (`<SectionLabel>`), then its cards 8px apart (`gap-2`), no extra gap between label and first card.

## Shared components (`app/src/components/`)

| Component | What it is |
|---|---|
| `Eyebrow` | the small uppercase label ("LOGIC GROUPS", "USES · 5", "1 OF 16"); `as="span" \| "h3"` |
| `SectionLabel` | an Eyebrow row over a list section, with optional ⓘ tip |
| `ListPane`, `AgentToggle` | the left list of Changes and Timeline (`--list-w`): the toggle row, the scrolling list, the drag edge; and its "Files / Files + Agent" toggle |
| `ListRow`, `FreshDot` | one row of a left list, highlighted and scrolled into view when selected (`SELECTED_ROW` is that look, for other lists; `ROW_LAYOUT` is its size and spacing, for rows that are only shown, like a check in Timeline); the "new since you looked" dot |
| `SideColumn` | the right column on every screen (`--side-w`) |
| `PaneHandle` | the drag edge of the left list or the side column; saves the width, double-click resets |
| `FileCard` | head card of the side column: "5 of 25" (or "← Overview" on the Map), jump buttons, file name, agent's words; previous/next are `StepButtons` above it |
| `StepButtons` | previous / next across the full width of the side column, above its first card (J / K); only the arrows when the column is narrow |
| `FoldButton` | the bare chevron that folds a card in a left list (a group in Changes, a turn in Timeline); open it points at its rows, folded it points right; `useFold(selected, holds, startFolded)` can start a card folded (the "Left out" card in Changes) |
| `JumpButton` | the icon button that shows the same file on another screen (`to="timeline"`) |
| `InfoButton` | the small ⓘ; wrap it in a tooltip's or popover's trigger |
| `MiniCard`, `MiniRow` | small titled card and its rows (Uses, Used by, File history, Checks after this edit, map overview); a `MiniRow` without `onClick` is display-only |
| `DiffView` | a diff in a card that scrolls inside itself; `newLines` puts a `selection` bar beside given lines through the library's `unsafeCSS` (it renders in a shadow DOM; rows are `[data-gutter]` / `[data-content] > [data-line-type]` with `data-column-number` / `data-line`); drawn by the library's `CodeView` with the diff as its one item, told the row height (`itemMetrics.lineHeight`, from the font size: it must match `--diffs-line-height` or long diffs jump), so only the rows in view are drawn; colored by the library's Highlights engine (`preferredHighlighter` in `diffOptions`, shared with the Settings preview); a new `id` starts at the top, new text for the same id (Show all, a live edit) is swapped in where you are (the item's `version` is a hash of the text); `footer` sits under the last line (`renderCodeViewFooter`, Show all). The `diffs` skill documents the library |
| `timeline/CheckResult` | a check the agent ran: ✓ / ✗ in the status-letter slot, its kinds ("Lint + types"), the passed count |
| `timeline/EffectResult`, `EffectIcon` | a command with effects outside the diff: its most serious effect's icon (red for discard/delete, amber for install/network/database, quiet for git) in the status-letter slot, what it changed ("Deleted files + git"), "failed" |
| `Said` | an agent's or your message: who, when, text, 4 lines then click for all |
| `StatusLetter`, `Counts` | A/M/D… letter and +n −n |
| `SurvivalTag` | kept / partly rewritten / gone / undone |
| `KeyHint` | a button's shortcut badge, shown while ⌘ is held (see the `keyboard-shortcuts` skill) |
| `BranchEmpty` | the centered no-changes placeholder for every branch, whether read from a working folder or a preview |
| `loading/LoadingHints` | the loading screen while a repo or branch opens: one hint, kept on screen until it has been read (`useLoadingScreen`); a failed load shows its error at once; laid out with shadcn `Empty`, like `BranchEmpty` and the error screen |
| `loading/LogoLoader` | the animated logo on the loading and first-load screens, in place of a spinner: the flame stands still while green types across its code lines one after another (`animate-logo-type`); with reduced motion it is the still icon, fading gently |
| `settings/SectionHead` | title + one line under it, for a Settings section |
| `settings/SettingRow` | `SettingRow` (a setting's name and line on the left, its control on the right), `Choice` (a few values side by side), `SettingsBody`, `ResetButton` |
| `settings/SettingsDialog` | the menu (`SECTIONS`): Appearance, Diff style, Agents, Files, Flags, Keyboard, License, About (last, as in Mac apps). A section is `SectionHead` + `SettingsBody` + `SettingRow`s; one that needs the Rust side shows a line saying so in the browser preview |

Jump buttons to other screens (`JumpButton`) are `variant="outline" size="icon-xs"` with the nav icons from `lib/views.ts`: Changes `FileDiffIcon`, Timeline `ClockIcon`, Map `MapIcon`, in that order, top right of the card.

## shadcn components

- Add with `pnpm dlx shadcn@latest add <name>` from `app/` (see the shadcn skill). Pipe `echo n` to refuse overwriting files we changed (`button`, `toggle`, `toggle-group`, `kbd`).
- **After adding, change its `import { cn } from "cn"` to `"@/lib/utils"`.** `lib/utils.ts` configures `cn` with the app's theme names; the plain package reads `text-micro` as a color and drops it next to `text-faint`. Any new text size or tracking token must be added to that config too.
- Our changes to shadcn files: Button and Toggle are `relative` (for KeyHint); joined toggle-group ends use `rounded-*-md` (8px, like buttons); Command and Select items use `cursor-pointer` (shadcn sets `cursor-default`, which beats the global hand-cursor rule — check any new list-like component for the same); Command's built-in trailing check is `hidden` unless checked (it used to take space as an invisible extra line). Lists mark the current item like the selected row in the Changes and Timeline lists (`bg-selection-bg` only; the 2px edge bar was dropped in Nov 2026 everywhere, Looks good / Needs work rows included), not a checkmark or a badge; hover stays gray, and open with it as the keyboard position (`<Command defaultValue>`); the only badge in these rows is the agent session count on the right, filled with a see-through tint (`bg-foreground/10`) so it stays visible on the gray hover row (`bg-muted` would vanish into it).

## Repo and branch pickers (`components/header/`)

Repo row: name · **N changed files** badge (gray; uncommitted files, the same count the Changes screen shows above its list) / the folder (shortened in the middle). Branch row: name · a badge that says what is counted: **N changed files** for uncommitted edits (the checked-out branch, or a branch in another working folder), **N files vs main** for a branch compared since it split off, naming the real branch it is compared with (the default branch, or the checked-out one for the default branch itself; a short commit id when none is checked out). The badge truncates at `max-w-48`, full text in its tooltip. Its second line is the last commit's subject, bare (no label, no icon, no tooltip), on one truncated line. "Files", not "changes": changes are counted in lines elsewhere. The current one is highlighted like a selected list row.

## Wording

Plain words, no code-review or GitHub terms: "Looks good / Needs work / Not reviewed", not Approve / Reject. "Check" is only for what the agent ran (tests, types, lint, build); what you do is "review". Say what something is for the person using it ("Used by no changed files"), not how it's computed. Sentence case. The product name only via `APP_NAME` in `src/brand.ts`.

Selecting a branch shows that branch's content. When it has no changes, show **"No changes on <branch>"** and "This branch has no file changes to show." No return CTA or explanation about the working folder in this empty state. When the first repo can't be read, the screen shows "Couldn't read this repository" with Retry and **Open folder…**, since the header has no repo picker yet. Before any repo is found, the screen says "No repository yet" with **Agent folders…**, which opens Settings → Agents. Keep the distinction between a preview and the working folder in branch-picker help, not in the main content. Git terms ("check out", "worktree") are fine in user-facing copy when they are the clearest word. The branch picker changes what the app shows, not the files on disk. Git commands, internal field names, and technical comments can keep Git terminology.
