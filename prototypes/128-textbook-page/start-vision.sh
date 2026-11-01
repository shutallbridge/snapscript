#!/bin/bash
# usage: start-vision.sh LABEL [vision.py flags...]
cd ~/snap-128
pkill -f 'vision.py' ; sleep 1
label="$1"; shift
setsid nohup ~/marker46/venv/bin/python -u vision.py --label "$label" "$@" >/tmp/vision128.log 2>&1 < /dev/null &
sleep 12
tr '\r' '\n' < /tmp/vision128.log | grep -v '^\s*$' | tail -5
