#!/bin/sh
# When main has moved since the skills were last reviewed, ask Claude to run the skill-upkeep skill.
# Usage: main-moved.sh <HookEventName> [fetch]
# The last reviewed tip is kept in the git folder (skill-upkeep-last), per clone, never committed; the skill updates it
# once a review is done, so the reminder repeats until then. The very first run only records the tip.
event=${1:-SessionStart}
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# A quick fetch of main (bounded, so a slow network never holds up the session), to see merges made on GitHub.
if [ "$2" = fetch ]; then
  ( git fetch -q origin main 2>/dev/null & pid=$!; ( sleep 8; kill $pid 2>/dev/null ) & wait $pid ) 2>/dev/null
fi

tip=$(git rev-parse -q --verify origin/main 2>/dev/null || git rev-parse -q --verify main 2>/dev/null) || exit 0
marker="$(git rev-parse --git-common-dir)/skill-upkeep-last"
if [ ! -s "$marker" ]; then
  echo "$tip" > "$marker"
  exit 0
fi
last=$(cat "$marker")
[ "$tip" = "$last" ] && exit 0
# Main was rewritten (force-push): review from the merge base.
git merge-base --is-ancestor "$last" "$tip" 2>/dev/null || last=$(git merge-base "$last" "$tip" 2>/dev/null || echo "$last")

n=$(git rev-list --count "$last..$tip" 2>/dev/null || echo "?")
range="$(git rev-parse --short "$last")..$(git rev-parse --short "$tip")"
msg="main moved: $range ($n commits since the skills were last reviewed). Run the skill-upkeep skill on $range: recommend skill updates (stale, missing, obsolete) and ask before editing. Mention this to the user in one line if they are in the middle of something else."
printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$event" "$msg"
