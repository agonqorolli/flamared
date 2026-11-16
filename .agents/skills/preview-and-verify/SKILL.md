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
  Open http://127.0.0.1:1430 in your browser tool (the built-in browser pane in Claude's desktop app, or any browser). Regenerate the snapshot when its shape changes (a stale one crashes the page) or when temp files were cleared. `?license=ended|licensed|<days>` shows license states.
- Other examples in `app/src-tauri/examples/`: `timing.rs` (load time), `watch_probe.rs` (what the watcher counts), `license.rs` (keys; see the `license-keys` skill).

## Checks

- `cd app && npx tsc --noEmit -p .` after every frontend change.
- `cd app/src-tauri && cargo test --lib` after Rust changes.

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
