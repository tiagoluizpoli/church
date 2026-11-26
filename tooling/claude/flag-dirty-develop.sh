#!/usr/bin/env bash
# Claude Code Stop hook: develop is PR-only, so tracked edits left on a develop
# checkout are stranded work. Stops the agent once to commit them on a branch
# (or hand them to the owner); `stop_hook_active` lets the second stop through.
set -euo pipefail

input=$(cat)
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = true ] && exit 0

dir=${CLAUDE_PROJECT_DIR:-.}
[ "$(git -C "$dir" branch --show-current 2>/dev/null)" = develop ] || exit 0
changed=$(git -C "$dir" status --porcelain --untracked-files=no)
[ -n "$changed" ] || exit 0

jq -n --arg files "$changed" '{decision: "block", reason: ("Uncommitted tracked changes on develop, which only takes pull requests:\n" + $files + "\nIf this session made them, move them to a branch off develop and open a PR (docs-only: push with --no-verify). If not, tell the owner they are there and where they came from; do not discard them.")}'
