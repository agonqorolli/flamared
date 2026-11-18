# Flamared

A desktop app for checking the uncommitted code changes AI coding agents (Claude Code, Codex) make: what changed, grouped by logic, with the agent's own words next to each edit. Free of AI processing; everything stays on your machine.

Three screens built from a real repo and the agent sessions on this machine:

- **Changes**: every committable file, grouped by how the files import each other, and a review mark on each file (Looks good / Needs work / Not checked) that resets when the agent changes the file again.
- **Timeline**: every agent edit in order, with the agent's message before it, whether it survived, and the checks it ran (tests, types, lint, build).
- **Map**: the whole repo as a treemap, colored by one of six lenses: change size, rework, still in final, checked, reviewed and flags.

## Download

macOS only for now. Get the `.dmg` from the [latest release](https://github.com/agonqorolli/flamared/releases/latest), open it and drag Flamared to Applications.

## First launch

Flamared isn't signed with an Apple Developer ID yet, so macOS blocks it the first time:

1. Open Flamared. macOS says it can't verify the app; click **Done**.
2. Open **System Settings → Privacy & Security** and scroll down to **Security**.
3. Next to "Flamared was blocked", click **Open Anyway**, then confirm with your password or Touch ID.

You only do this once. After that it opens like any other app.

## Trial and license

Everything works for 14 days. After that Flamared needs a license: one payment, no subscription. Paste the key from your purchase email in **Settings → License**. The key is checked on your Mac; nothing is sent anywhere. To move to another Mac, choose **Remove from this Mac** there and enter the key on the new one.

## Updates

Flamared checks for a new version when it starts, downloads it in the background and shows **Restart to update** in the header. The check asks GitHub for the latest version number and sends nothing about your code. Turn it off in **Settings → Updates**.

## Building from source

The app lives in `app/` (Tauri + React). See [app/README.md](app/README.md). The source is public to read, audit and build for your own use; see [LICENSE](LICENSE) for what isn't allowed.

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
