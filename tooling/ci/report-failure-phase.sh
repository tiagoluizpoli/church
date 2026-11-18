#!/usr/bin/env bash
# Names the CI phase of a failed job and exits nonzero (#594). Plain bash on
# purpose: it must run when the toolchain setup itself is what failed.
#
# Usage: report-failure-phase.sh [--setup-only] "<outcome>:<setup step>"...
# Each argument pairs a setup step's `${{ steps.<id>.outcome }}` with the label
# to report. A failure outside the listed steps is the test command, except
# with --setup-only, where every step that can fail is listed.
set -u

setup_only=false
if [ "${1:-}" = "--setup-only" ]; then
  setup_only=true
  shift
fi

cancelled=false
failed_step=""
for arg in "$@"; do
  outcome=${arg%%:*}
  label=${arg#*:}
  case "$outcome" in
    cancelled) cancelled=true ;;
    failure) : "${failed_step:=$label}" ;;
  esac
done

if [ "$cancelled" = true ]; then
  phase="cancelled"
elif [ -n "$failed_step" ]; then
  phase="setup/infrastructure — $failed_step"
elif [ "$setup_only" = true ]; then
  phase="setup/infrastructure — unidentified step"
else
  phase="test-command"
fi

echo "::error::CI failure phase: $phase"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '### CI failure phase\n%s\n' "$phase" >> "$GITHUB_STEP_SUMMARY"
fi
exit 1
