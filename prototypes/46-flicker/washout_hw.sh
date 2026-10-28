#!/usr/bin/env bash
# PROTOTYPE (#46), throwaway: handwriting under projected light. Runs on the Pi
# with show.py running. For each pattern: project it, take one frame and cut the
# crops with ~/hw46/read_hw.py, then read them with Gemma (raw, kind prompt, JPEG).
#   ./washout_hw.sh [exposure_us] [gain]
set -euo pipefail
exposure="${1:-8333}"
gain="${2:-1}"
here="$(cd "$(dirname "$0")" && pwd)"
"$here/venv/bin/python" "$here/halves.py" --split 1900 >/dev/null
cd ~/hw46
for pattern in black white nearlit farlit nearred; do
  case "$pattern" in
    black) echo "#000000" ;;
    white) echo "#ffffff" ;;
    *) echo "image /tmp/flicker46-$pattern.png" ;;
  esac > /tmp/flicker46-show
  sleep 1
  label="W-$pattern-e$exposure-g$gain"
  venv/bin/python read_hw.py --lens 3.75 --exposure "$exposure" --gain "$gain" --prep raw --models "" --label "$label" 2>&1 \
    | grep -v -E "INFO|WARN|RPiAf|pixel format" | tail -3
  crops="$(ls -dt runs/"$label"-*-crops | head -1)"
  venv/bin/python cloud_read.py "$crops" --models gemma --preps raw --prompts kind --parallel 200 --format jpeg \
    --label "$label" 2>&1 | tail -4
done
echo "#000000" > /tmp/flicker46-show
