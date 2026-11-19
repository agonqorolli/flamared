---
name: preview-and-verify
description: How to run the app and check a change actually works — the desktop app (pnpm tauri dev), the browser preview from a saved snapshot, the Rust examples (dump, timing, watch_probe, license), tests, and the measuring tricks that catch layout drift (before/after style capture, alignment checks). Use whenever you change the app and need to see or prove the result.
---

# Running and checking the app

## Run

- **Desktop app** (real data, live updates, native dialogs): `cd app && pnpm tauri dev` — run it in the background, tee to a log. Rust changes rebuild by themselves. After hot-reload errors that make no sense (hook order, "needs a Provider", deleted module), restart it.
- **Browser preview** (no Rust side; reads one saved snapshot, no Live, no folder picker, license faked):
  ```bash
  cd app/src-tauri && cargo run -q --example dump -- /path/to/repo [base | --branch name] > /tmp/snapshot.json
  cd app && SNAPSHOT_FILE=/tmp/snapshot.json pnpm exec vite --port 1430 --strictPort --host 127.0.0.1
  ```
  Open http://127.0.0.1:1430 in your browser tool (the built-in browser pane in Claude's desktop app, or any browser). Regenerate the snapshot when its shape changes (a stale one crashes the page) or when temp files were cleared. `?license=ended|licensed|lapsed|renew|<days>` shows license states.
  `preview_start` with `app-web` (`.claude/launch.json`) reads the snapshot file named by `SNAPSHOT_FILE` in that config: back that file up, write yours there, and restore it afterwards. To test review marks without editing files, set `review:<repo path>:<branch>:<base>` in localStorage to marks with a `seen` list (see `lib/review.ts`).
  To bring earlier agent turns into view after a commit, dump against an older base (`dump -- /repo <older sha>`): only turns after the base commit's time are linked.
  Another session may already run `app-web` on port 1430 from the same snapshot file; `preview_start` then moves to 1431. Back up the file before overwriting it and restore it afterwards, or that session's preview changes under it.
- **Rust-backed screens in the preview** (Agents, About, Files): write a temporary `app/zz-*.html` (a copy of `index.html`) whose first script defines `window.__TAURI_INTERNALS__` with `invoke(cmd, args)` (answer `state_load`, `license_status`, `snapshot`/`repos` from the dev server's /__snapshot.json, `plugin:event|listen`, and the commands under test), `transformCallback` and `metadata.currentWindow.label`, then loads `/src/main.tsx`. Open that page (/zz-….html), test, then delete the file. Record calls in `window.__calls` to check what was invoked. A stand-in that ignores unlisten runs event handlers twice under React's dev double-mount; that's the stand-in, not the app.
- Other examples in `app/src-tauri/examples/`: `timing.rs` (load time), `watch_probe.rs` (what the watcher counts), `license.rs` (keys; see the `license-keys` skill).

## Checks

- `cd app && pnpm format && pnpm lint && npx tsc --noEmit -p .` after every frontend change (Prettier, ESLint, types).
- `cd app/src-tauri && cargo fmt && cargo clippy --all-targets && cargo test --lib` after Rust changes. Clippy must come back with no warnings.

## Seeing what's really on screen

- Screenshots are often one step stale. Read the DOM with JS (`getBoundingClientRect`, `getComputedStyle`, text) to confirm, and take a second screenshot if one looks wrong.
- Radix tabs switch on pointerdown, not `.click()`; switch screens with the ⌘1/2/3 keys instead: `document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'2',metaKey:true,bubbles:true}))`.
- Dispatch key events on `document.body`, not `window`.
- Close dialogs before testing the page behind them (a Radix dialog makes the rest inert).
- Clear any test marks/state you set (review marks live in localStorage in the preview).

## Proving a refactor changes nothing

Capture every visible element's box and key styles on each screen before the change, keep it in `sessionStorage`, and diff after:

```js
const cap = async () => { const out = {}; for (const [name, n] of [["Changes",1],["Timeline",2],["Map",3]]) {
  document.body.dispatchEvent(new KeyboardEvent('keydown',{key:String(n),metaKey:true,bubbles:true}));
  await new Promise(r => setTimeout(r, 600));
  out[name] = [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().width && !el.closest('svg')).map(el => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return [el.tagName, ...[r.x, r.y, r.width, r.height].map(Math.round), cs.fontSize, cs.lineHeight, cs.letterSpacing, cs.color, cs.backgroundColor, cs.borderTopLeftRadius].join('|'); });
} return out; };
```

Zero differing rows = no visible change. Do it at more than one window size when widths depend on the viewport (`resize_window`, then reset to desktop).

## Alignment checks

Things that must not move between screens: the top-left toggle (12px in, 12px below the header), the side column (12px from the right, same width), the header's left/right edges. Measure all three screens in one script and compare numbers rather than eyeballing screenshots. Also check Light and Gray when touching colors (remove `dark`/`gray` from `<html>` temporarily).
