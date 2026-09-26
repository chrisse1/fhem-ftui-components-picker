#!/bin/bash
#
# Generates controls_ftuipicker.txt for the FHEM update mechanism.
#
# Every tracked file below www/ftui is listed with its exact byte size and a
# timestamp. FHEM downloads a file again as soon as size or timestamp differ
# from the copy recorded in <fhem>/FHEM/controls_ftuipicker.txt, and it
# aborts when a downloaded file does not have exactly the listed size - so
# the file has to be regenerated whenever something below www/ftui changes.
#
# Files that vanished since the last run stay in the list as "MOV ... unused",
# which removes them from an existing installation.
#
# Usage:
#   ./prepare_update.sh
# or once:
#   git config core.hooksPath .githooks
# then it runs before every commit.

set -euo pipefail

cd "$(dirname "$0")"

CONTROLS_FILE=${CONTROLS_FILE:-controls_ftuipicker.txt}
SOURCE_DIR=${SOURCE_DIR:-www/ftui}
NOW=$(date '+%Y-%m-%d_%H:%M:%S')

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

has_head=false
if git rev-parse --verify --quiet HEAD > /dev/null; then
  has_head=true
fi

# --- timestamps of the previous run --------------------------------------
declare -A previous=()
if [ -f "$CONTROLS_FILE" ]; then
  while read -r command stamp size path; do
    if [ "$command" = UPD ] || [ "$command" = CRE ]; then
      previous["$path"]=$stamp
    fi
  done < "$CONTROLS_FILE"
fi

# --- the files of this repository ---------------------------------------
git ls-files -z -- "$SOURCE_DIR" > "$work/tracked"
while IFS= read -r -d '' path; do
  [ -f "$path" ] || continue
  size=$(wc -c < "$path" | tr -d '[:space:]')
  # a file that is committed and unchanged keeps the timestamp it already
  # has, so that an untouched file never looks like an update to FHEM
  stamp=$NOW
  if [ "$has_head" = true ] && [ -n "${previous[$path]:-}" ] \
     && git diff --quiet HEAD -- "$path"; then
    stamp=${previous[$path]}
  fi
  printf 'UPD %s %s %s\n' "$stamp" "$size" "$path"
done < "$work/tracked" | LC_ALL=C sort -k4 > "$work/controls"

if [ ! -s "$work/controls" ]; then
  echo "No files found below $SOURCE_DIR - nothing to do." >&2
  exit 1
fi

awk '{ print $4 }' "$work/controls" > "$work/paths"

# --- files that are gone -------------------------------------------------
: > "$work/moves"
if [ -f "$CONTROLS_FILE" ]; then
  # keep earlier MOV entries, unless the file is back again
  awk '$1 == "MOV" { print $2 }' "$CONTROLS_FILE" > "$work/old-moves"
  awk '$1 == "UPD" || $1 == "CRE" { print $4 }' "$CONTROLS_FILE" >> "$work/old-moves"
  while IFS= read -r path; do
    grep -qxF "$path" "$work/paths" || printf 'MOV %s unused\n' "$path"
  done < "$work/old-moves" | LC_ALL=C sort -u > "$work/moves"
fi

cat "$work/controls" "$work/moves" > "$CONTROLS_FILE"

echo "$CONTROLS_FILE updated ($(wc -l < "$work/controls" | tr -d '[:space:]') file(s), \
$(wc -l < "$work/moves" | tr -d '[:space:]') removed)"
