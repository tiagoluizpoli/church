#!/usr/bin/env bash
# The shell of a CI step that runs tests (#1162):
#   shell: bash tooling/ci/record-test-output.sh {0}
# Runs the step's script as `shell: bash` does (bash -eo pipefail) and keeps
# its exit status. Its output still reaches the step log as it arrives, so
# GitHub reads the runners' annotations as usual. A copy goes to
# $CHURCH_TEST_OUTPUT_LOG (setup-church-ci), where report-failure-phase.sh
# finds the failed tests for the job summary.
set -u
set -o pipefail

if [ -z "${CHURCH_TEST_OUTPUT_LOG:-}" ]; then
  exec bash --noprofile --norc -eo pipefail "$1"
fi
bash --noprofile --norc -eo pipefail "$1" 2>&1 | tee -a "$CHURCH_TEST_OUTPUT_LOG"
