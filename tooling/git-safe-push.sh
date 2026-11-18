#!/usr/bin/env bash
# Runs the same validation as the pre-push hook to completion *before* git
# opens any connection to the remote, then pushes with --no-verify.
#
# Why this exists: `git push` over SSH opens the connection to the remote
# before running the local pre-push hook. lefthook's pre-push hook runs the
# full affected validation suite, which can take several minutes; GitHub's
# SSH server closes that now-idle connection before the hook finishes, so
# the push fails even when validation passes. Validating first and pushing
# with --no-verify avoids ever holding the connection open during the slow
# part.
set -euo pipefail

bun run validate:affected
git push --no-verify "$@"
