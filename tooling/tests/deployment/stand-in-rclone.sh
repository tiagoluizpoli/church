#!/bin/sh
# Stand-in for the rclone subcommands prune-backups.sh uses, over the local
# directory STAND_IN_ROOT (remote "stand-in:"). STAND_IN_UNREADABLE and
# STAND_IN_UNDELETABLE name one object whose read or delete fails;
# STAND_IN_UNLISTABLE=1 makes listing fail.

set -u
command=$1
shift
for argument in "$@"; do target=$argument; done
path="$STAND_IN_ROOT/${target#stand-in:}"
name=$(basename "$path")
echo "$command $name" >>"$STAND_IN_ROOT/.calls"

case $command in
  lsf)
    [ "${STAND_IN_UNLISTABLE:-}" = 1 ] && exit 1
    for file in "$path"*.sql.gz; do
      [ -f "$file" ] && basename "$file"
    done
    exit 0
    ;;
  cat)
    if [ "$name" = "${STAND_IN_UNREADABLE:-}" ]; then
      # Some bytes arrive before the connection drops.
      head -c 10 "$path"
      exit 1
    fi
    cat "$path"
    ;;
  deletefile)
    [ "$name" = "${STAND_IN_UNDELETABLE:-}" ] && exit 1
    rm "$path"
    ;;
  *) exit 64 ;;
esac
