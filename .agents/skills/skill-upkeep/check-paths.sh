#!/bin/sh
# List file paths mentioned in the project skills (`backticked`) that no longer exist. Paths are tried from the repo
# root and from the folders skills write paths relative to (app/, app/src/, app/src-tauri/, app/src-tauri/src/).
# Skips home-folder paths, URLs, globs and placeholders. Prints nothing when every path exists.
root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
for f in .agents/skills/*/SKILL.md; do
  case "$f" in .agents/skills/shadcn/*) continue ;; esac
  grep -o '`[^` ]*`' "$f" | tr -d '`' | sort -u | while read -r p; do
    case "$p" in
      */*) ;;
      *) continue ;;
    esac
    case "$p" in
      ~* | http* | *'*'* | *'<'* | *'{'* | *'('* | *'|'* | --* | -* | /tmp/* | */) continue ;;
    esac
    # Only things that look like files: a name with an extension.
    case "${p##*/}" in *.*) ;; *) continue ;; esac
    p=${p%%:*}
    found=
    for base in . app app/src app/src-tauri app/src-tauri/src; do
      [ -e "$base/$p" ] && found=1 && break
    done
    [ -z "$found" ] && echo "$f: $p"
  done
done
exit 0
