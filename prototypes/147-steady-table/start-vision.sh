#!/bin/bash
# PROTOTYPE (#147, from #115). usage: start-vision.sh [vision.py flags...]  (pinned to cores 0-1)
cd ~/snap-147
pkill -f '[v]ision.py --port' ; sleep 1
setsid nohup taskset -c 0,1 ~/marker46/venv/bin/python -u vision.py --port 8115 "$@" >/tmp/vision147.log 2>&1 < /dev/null &
sleep 6
tail -3 /tmp/vision147.log
