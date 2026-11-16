# The desktop app

Tauri 2 (Rust) with a React + TypeScript window, Tailwind CSS 4, shadcn/ui (Radix) and @pierre/diffs for diffs.

- `src-tauri/src/data/`: the data layer. Reads git and the agent session files (Claude Code, Codex); never writes to either. `snapshot::build` returns everything a screen load needs.
- `src/`: the window. `components/changes/` is the Changes screen; Timeline and Map come next.
- `src/brand.ts`: the product name.

```bash
pnpm install
pnpm tauri dev          # the app, with the Rust side
```

Print a repo's snapshot as JSON:

```bash
cd src-tauri && cargo run --example dump -- /path/to/repo [base] > rust.json
```

Preview the window in a plain browser (no Rust side) from a saved snapshot:

```bash
SNAPSHOT_FILE=rust.json pnpm exec vite --port 1430
```
