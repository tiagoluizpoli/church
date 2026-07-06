#!/usr/bin/env bash
# Sets the canonical pointer to the active grill-to-PRD handoff file.
# Usage: set-current-grill-handoff.sh .plan/handoffs/<file>.md
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-handoff-file>" >&2
  exit 1
fi

TARGET="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAN_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$TARGET" ]; then
  echo "Error: $TARGET does not exist" >&2
  exit 1
fi

echo "$TARGET" > "$PLAN_DIR/handoffs/.current-grill-handoff"
echo "Current grill handoff set to: $TARGET"
