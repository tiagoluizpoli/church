#!/bin/sh
# Success-aware retention for Church's Dokploy PostgreSQL backup pools (#880).
#
#   prune-backups.sh <rclone remote>:<bucket>/<postgres app name>/<environment>/<pool>...
#
# Dokploy's own Keep latest counts any file, so a failed upload whose cleanup
# also failed would displace a good recovery point. Dokploy therefore keeps
# everything (keepLatestCount unset) and this script, run daily on each
# Dokploy host, keeps the newest five *intact* backups of each pool: an
# object is intact when it is a complete gzip stream (Dokploy writes
# `pg_dump -Fc | gzip`, so a truncated upload fails gzip's trailer check).
#
# Fails closed: a pool it cannot list or fully read is left untouched, an
# intact backup is deleted only when five newer intact ones exist, and an
# incomplete object only when a newer intact backup exists (the newest one may
# still be uploading). See docs/operations/backups.md.

set -u

KEEP=5
work=$(mktemp -d) || exit 1
trap 'rm -rf "$work"' EXIT

# 0 intact, 1 incomplete, 2 unreadable. Drains the stream after gzip stops so
# an early gzip exit never looks like a read failure.
inspect() {
  rm -f "$work/unreadable"
  { rclone cat "$1" || : >"$work/unreadable"; } |
    {
      gzip -t 2>/dev/null
      status=$?
      cat >/dev/null
      exit "$status"
    }
  status=$?
  [ -e "$work/unreadable" ] && return 2
  [ "$status" -eq 0 ] && return 0
  return 1
}

prune_pool() {
  pool=${1%/}
  if ! rclone lsf --files-only --include '*.sql.gz' "$pool/" >"$work/listed"; then
    echo "✖ $pool: could not list the pool; deleted nothing." >&2
    return 1
  fi
  # Dokploy names backups by timestamp, so the name order is the age order.
  sort -r "$work/listed" >"$work/newest-first"
  : >"$work/delete"
  intact=0
  incomplete=0
  while IFS= read -r name; do
    inspect "$pool/$name"
    case $? in
      0)
        intact=$((intact + 1))
        [ "$intact" -gt "$KEEP" ] && echo "$name" >>"$work/delete"
        ;;
      1)
        incomplete=$((incomplete + 1))
        [ "$intact" -gt 0 ] && echo "$name" >>"$work/delete"
        ;;
      *)
        echo "✖ $pool: could not read $name; deleted nothing." >&2
        return 1
        ;;
    esac
  done <"$work/newest-first"

  failed=0
  while IFS= read -r name; do
    if ! rclone deletefile "$pool/$name"; then
      echo "✖ $pool: could not delete $name." >&2
      failed=1
    fi
  done <"$work/delete"
  kept=$((intact < KEEP ? intact : KEEP))
  echo "✔ $pool: $kept intact backup(s) kept, $(wc -l <"$work/delete" | tr -d ' ') deleted ($incomplete incomplete found)."
  if [ "$intact" -lt "$KEEP" ]; then
    echo "⚠ $pool holds only $intact intact backup(s), fewer than $KEEP." >&2
  fi
  return "$failed"
}

if [ "$#" -eq 0 ]; then
  echo "Usage: prune-backups.sh <remote>:<bucket>/<app>/<environment>/<pool>..." >&2
  exit 2
fi

result=0
for pool in "$@"; do
  prune_pool "$pool" || result=1
done
exit "$result"
