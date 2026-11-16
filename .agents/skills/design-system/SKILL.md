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
| `selection`, `selection-bg` | selected row, fresh dot, accents |
| `add` / `add-bg`, `rem` / `rem-bg` | added / removed lines, "Looks good" / "Needs work" |
| `warn` | flags, "not connected", partly kept |
| `ai`, `ai-foreground`, `ai-bg` | the agent's own color (agent-neutral violet) |
| `map-bg`, `map-tile`, `map-edge`, `map-folder` | treemap surfaces |
| `--lens-*` (size/rework low→high, kept, partly, gone, flag, none, text) | map data colors; used through `var()` in MapView's `LENS` |

Three themes, each defining every token: Light (`:root`), Dark (`.dark`), Gray (`.dark.gray`, only surfaces change). **Default: Gray, Normal density** (`DEFAULTS` in `src/lib/settings.tsx`, and `class="dark gray"` in `index.html` so the first paint matches). A new color token gets a value in Light and Dark (Gray inherits Dark unless it is a surface).

**Text sizes** — Tailwind's `xs` (12px) and up, plus three below it, named by use:

| Class | Size | Use |
|---|---|---|
| `text-micro` | 10px | uppercase labels, key badges, times, small tags |
| `text-mini` | 11px | counts ("8 files"), paths, notes under a value, status letters |
| `text-name` | 13px | a group's name in the Changes list |

`tracking-label` (0.06em) goes with uppercase labels — use `<Eyebrow>` rather than writing it out.

**Spacing and density** — everything is in spacing units (`p-3`, `gap-3`, `w-75`), never px, so Compact / Normal / Spacious (`--spacing` 0.2 / 0.25 / 0.3rem) scales the whole window. Text never scales with density.

**Layout widths** — `--list-w` (the left list, 300px at normal density) and `--side-w` (the right column: 26% of what is left beside the list, 200–220px). Both are used through components/classes below, never recomputed.

**Radius** — buttons, toggles, rows: 8px (`rounded-md`, shadcn's small sizes). Cards: `rounded-xl` (side column) / `rounded-lg` (list groups). Map tiles: 2px. Info buttons: full circle.

## Layout rules

- **12px everywhere**: the screen margin is `p-3` on all four sides; the header is `px-3`; gaps between columns and between cards are `gap-3`; notice banners `mx-3`. Content, header items, toggles and the side column all line up on that 12px edge.
- **Every screen has the same skeleton**: optional left list (`w-(--list-w)`, `border-r bg-sidebar`, toggle row `px-3 pt-3`) → main content → `<SideColumn>`. Switching screens must not move the toggle or the side column; check by measuring (see the `preview-and-verify` skill).
- Lists: section label (`<SectionLabel>`), then its cards 8px apart (`gap-2`), no extra gap between label and first card.

## Shared components (`app/src/components/`)

| Component | What it is |
|---|---|
| `Eyebrow` | the small uppercase label ("LOGIC GROUPS", "USES · 5", "1 OF 16"); `as="span" \| "h3"` |
| `SectionLabel` | an Eyebrow row over a list section, with optional ⓘ tip |
| `SideColumn` | the right column on every screen (`--side-w`) |
| `FileCard` | head card of the side column: "5 of 25" + ↑↓ (or "← Overview" on the Map), jump buttons, file name, agent's words |
| `MiniCard`, `MiniRow` | small titled card and its clickable rows (Uses, Used by, File history, map overview) |
| `Said` | an agent's or your message: who, when, text, 4 lines then click for all |
| `StatusLetter`, `Counts` | A/M/D… letter and +n −n |
| `SurvivalTag` | kept / partly rewritten / gone / undone |
| `KeyHint` | a button's shortcut badge, shown while ⌘ is held (see the `keyboard-shortcuts` skill) |
| `BranchEmpty` | the centered no-changes placeholder for every branch, whether read from a working folder or a preview |
| `settings/SectionHead` | title + one line under it, for a Settings section |

Jump buttons to other screens are `variant="outline" size="icon-xs"` with the nav icons: Changes `FileDiffIcon`, Timeline `ClockIcon`, Map `MapIcon`, in that order, top right of the card.

## shadcn components

- Add with `pnpm dlx shadcn@latest add <name>` from `app/` (see the shadcn skill). Pipe `echo n` to refuse overwriting files we changed (`button`, `toggle`, `toggle-group`, `kbd`).
- **After adding, change its `import { cn } from "cn"` to `"@/lib/utils"`.** `lib/utils.ts` configures `cn` with the app's theme names; the plain package reads `text-micro` as a color and drops it next to `text-faint`. Any new text size or tracking token must be added to that config too.
- Our changes to shadcn files: Button and Toggle are `relative` (for KeyHint); joined toggle-group ends use `rounded-*-md` (8px, like buttons); Command and Select items use `cursor-pointer` (shadcn sets `cursor-default`, which beats the global hand-cursor rule — check any new list-like component for the same); Command's built-in trailing check is `hidden` unless checked (it used to take space as an invisible extra line). Lists mark the current item like the selected row in the Changes and Timeline lists (`bg-selection-bg`, a 2px `--selection` bar on the left), not a checkmark or a badge; hover stays gray, and open with it as the keyboard position (`<Command defaultValue>`); the only badge in these rows is the agent session count on the right, filled with a see-through tint (`bg-foreground/10`) so it stays visible on the gray hover row (`bg-muted` would vanish into it).

## Repo and branch pickers (`Header.tsx`)

Repo row: name · **N changed files** badge (gray; uncommitted files, the same count the Changes screen shows above its list) / the folder (shortened in the middle). Branch row: name · a badge that says what is counted: **N changed files** for uncommitted edits (the checked-out branch, or a branch in another working folder), **N files vs main** for a branch compared since it split off, naming the real branch it is compared with (the default branch, or the checked-out one for the default branch itself; a short commit id when none is checked out). The badge truncates at `max-w-48`, full text in its tooltip. Its second line is the last commit's subject, bare (no label, no icon, no tooltip), on one truncated line. "Files", not "changes": changes are counted in lines elsewhere. The current one is highlighted like a selected list row.

## Wording

Plain words, no code-review or GitHub terms: "Looks good / Needs work / Not checked", not Approve / Reject. Say what something is for the person using it ("Used by no changed files"), not how it's computed. Sentence case. The product name only via `APP_NAME` in `src/brand.ts`.

Selecting a branch shows that branch's content. When it has no changes, show **"No changes on <branch>"** and "This branch has no file changes to show." No return CTA or explanation about the working folder in this empty state. Keep the distinction between a preview and the working folder in branch-picker help, not in the main content. Avoid "checkout" / "checked out" in user-facing copy, including tooltips, accessible labels, and fallbacks; a worktree is "another working folder". The branch picker changes what the app shows, not the files on disk. Git commands, internal field names, and technical comments can keep Git terminology.
