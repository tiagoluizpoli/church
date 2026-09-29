#!/bin/sh
# Runs Docker Compose against the primary checkout's docker-compose.yml, from
# any worktree (ADR-0005). Local services are shared dependencies: every
# worktree drives the one set the primary defines, never its own branch copy.
set -eu

primary="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
exec docker compose --file "$primary/docker-compose.yml" "$@"
