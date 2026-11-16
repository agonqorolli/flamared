# Flamared

A desktop app for checking the uncommitted code changes AI coding agents (Claude Code, Codex) make: what changed, grouped by logic, with the agent's own words next to each edit. Free of AI processing; everything stays on your machine.

The app lives in `app/` (Tauri + React). See [app/README.md](app/README.md).

Three screens built from a real repo and the agent sessions on this machine:

- **Changes**: every committable file, grouped by how the files import each other, with approve / reject review.
- **Timeline**: every agent edit in order, with the agent's message before it and whether it survived.
- **Map**: the whole repo as a treemap, changed files highlighted.
