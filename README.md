# Flamared

A desktop app for checking the uncommitted code changes AI coding agents (Claude Code, Codex) make: what changed, grouped by logic, with the agent's own words next to each edit. Free of AI processing; everything stays on your machine.

The app lives in `app/` (Tauri + React). See [app/README.md](app/README.md).

Three screens built from a real repo and the agent sessions on this machine:

- **Changes**: every committable file, grouped by how the files import each other, with approve / reject review.
- **Timeline**: every agent edit in order, with the agent's message before it and whether it survived.
- **Map**: the whole repo as a treemap, changed files highlighted.

## Skills

Agent instructions are in [AGENTS.md](AGENTS.md) (read by Codex, Claude Code and others): commands, layout, rules, and which skill to load for which area. Project knowledge lives in skills under `.agents/skills/` (the shared Agent Skills folder; `.claude/skills` links to it for Claude Code), so coding agents load it when the work calls for it:

- `product-decisions`: what the product is, what's decided, parked or dropped, and why
- `agent-data`: what Claude Code and Codex record, and how the data layer turns it into the screens
- `design-system`: tokens, shared components, layout and wording rules
- `keyboard-shortcuts`: the one list of keys and how to add one
- `license-keys`: issuing keys, the signing key, the trial
- `preview-and-verify`: running the app and checking a change
- `skill-upkeep`: after main moves, recommends what the skills should add, fix or drop (a hook in `.claude/settings.json` reminds Claude when main has new commits)
- `shadcn`: the official shadcn/ui skill
