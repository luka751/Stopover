#!/bin/sh
# Reads "name<TAB>presigned-url" lines on stdin (URLs from the Icons8 MCP, valid one hour) and saves each
# into assets/icons8/illustrations/<style>/<name>.png. Usage: sh tools/icons8-fetch-illustrations.sh 3d-fluency < list
dir="$(dirname "$0")/../assets/icons8/illustrations/$1"; mkdir -p "$dir"
while IFS="$(printf '\t')" read -r name url; do
  [ -z "$name" ] && continue
  curl -sf -o "$dir/$name.png" "$url" && echo "ok $name $(du -k "$dir/$name.png" | cut -f1)K" || echo "FAIL $name"
done
