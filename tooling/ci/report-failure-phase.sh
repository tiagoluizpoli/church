#!/usr/bin/env bash
# Names the CI phase of a failed job and exits nonzero (#594). Plain bash on
# purpose: it must run when the toolchain setup itself is what failed.
#
# Usage: report-failure-phase.sh [--setup-only] "<outcome>:<setup step>"...
# Each argument pairs a setup step's `${{ steps.<id>.outcome }}` with the label
# to report. A failure outside the listed steps is the test command, except
# with --setup-only, where every step that can fail is listed.
#
# A test-command failure also lists the failed tests that the recorded test
# output ($CHURCH_TEST_OUTPUT_LOG, tooling/ci/record-test-output.sh) annotated
# (#1162), when bun is installed.
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

test_log=${CHURCH_TEST_OUTPUT_LOG:-}
if [ "$phase" = "test-command" ] && [ -n "$test_log" ] && [ -f "$test_log" ] &&
  command -v bun > /dev/null 2>&1; then
  summarizer="$(dirname "${BASH_SOURCE[0]}")/failed-tests-summary.ts"
  failed_tests=$(bun "$summarizer" "$test_log") || failed_tests=""
  if [ -n "$failed_tests" ]; then
    printf '%s\n' "$failed_tests"
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      printf '%s\n' "$failed_tests" >> "$GITHUB_STEP_SUMMARY"
    fi
  fi
fi
exit 1
