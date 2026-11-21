---
name: keyboard-shortcuts
description: How keyboard shortcuts work in the app and how to add or change one — the single list in lib/keys.ts, useKeys, the hold-⌘ badges (KeyHint), Settings → Keyboard, which keys are free, and the ⌘-vs-plain-letter rule. Use when adding an action that deserves a key, changing a key, or touching key handling.
---

# Keyboard shortcuts

One list drives everything: `app/src/lib/keys.ts`.

- `KEYS` — every key by id (`next: { key: "k" }`, `goMap: { key: "3", mod: true }`).
- `SHORTCUT_ROWS` — what Settings → Keyboard shows, grouped Everywhere / Changes / Timeline / Map. A row can list several ids ("J / K").
- `useKeys(active, { id: action })` — a screen's handler. A falsy action leaves the key alone (`toMap: hasFile && (() => …)`). Registered fresh each render.
- `hint(id)` — "M", "⌘1" for hover text: `title={\`Show in Map (${hint("toMap")})\`}`.
- `useKeyHints()` (called once in App) — holding ⌘ ~250 ms sets `data-key-hints` on `<html>`; `<KeyHint id="toMap" />` inside a button shows its badge then. Released ⌘, any other key, a click or leaving the window hides them.

## Adding a shortcut

1. Add the id to `KEYS` and a row to `SHORTCUT_ROWS` (Settings → Keyboard updates itself).
2. Handle it with `useKeys` in the screen that owns the action (app-wide ones in `App.tsx`).
3. Put `<KeyHint id=… />` inside the button that does the same thing, and `hint(id)` in its title.
4. Test in the browser preview: dispatch on `document.body` (not `window`: the handler reads `e.target`), e.g. `document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true}))`.

## Rules

- **⌘ + key for app-level actions** (switch screen, reload, settings, open folder): Mac convention, and they work even while typing or with a dialog open.
- **Plain letters for actions inside a screen** (J/K, G/W, A, C/T/M, 1–4, S, Esc): faster for repeated use. `is()` ignores them while typing in a field or with a dialog/menu/listbox open.
- **Never ⌘ + a letter macOS owns**: ⌘W close, ⌘M minimize, ⌘H hide, ⌘Q quit, ⌘C/V/X/A/Z edit, ⌘T, ⌘G, ⌘K, ⌘F, ⌘P.
- A key's meaning is the same on every screen (M is always "Map", C "Changes", T "Timeline", J previous, K next).

## Current keys

Everywhere: ⌘1/2/3 screens · ⌘R reload · L Live/Paused (app only) · ⌘O open folder (app only) · ⌘, Settings · ? the shortcuts page · S split/unified diff (not on Map).
Changes: J/K previous/next file · G Looks good · W Needs work (then opens the next unreviewed file; again clears) · A agent messages · T/M jump.
Timeline: J/K previous/next edit · A agent messages · C/M jump (while the file is still changed).
Map: 1–4 lens · C/T jump selected file · Esc → the lens panel, then clears a shown prompt, then out of the zoom one level at a time.

Free letters: B, D, E, F, H, I, N, O, P, Q, R, U, V, X, Y, Z.

## Windows (not done; Mac first)

`is()` already accepts Ctrl for `mod`. Still Mac-only: labels say ⌘ (`keyParts`), and the badges follow Meta (the Windows key). To port: detect the platform once, show "Ctrl", hold Ctrl for badges, accept only ⌘ on Mac / only Ctrl elsewhere.
