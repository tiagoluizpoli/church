#!/usr/bin/env bash
# Claude Code PreToolUse hook (Bash): refuse commands that bypass git hooks.
# Allowed: `git push --no-verify` for docs-only pushes (docs/agents/tooling.md).
set -euo pipefail

command=$(jq -r '.tool_input.command // empty')
# Quoted text (commit messages) is data, not flags.
unquoted=$(sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g" <<<"$command")

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
}

if grep -qE '(-c[[:space:]]+|config[[:space:]]+([^[:space:]]+[[:space:]]+)*)core\.hooksPath' <<<"$unquoted"; then
  deny "Git hooks are the repo's guardrail; overriding core.hooksPath skips them. Fix what the hook reports, then commit normally."
fi

if grep -qE 'git([[:space:]]+-c[[:space:]]+[^[:space:]]+)*[[:space:]]+commit([^|;&]*[[:space:]])(--no-verify|-n)([[:space:]]|$)' <<<"$unquoted"; then
  deny "git commit --no-verify skips the commit hooks (biome, commitlint). Fix what the hook reports, then commit normally."
fi
