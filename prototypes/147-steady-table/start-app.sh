#!/bin/bash
# PROTOTYPE (#147, from #115). usage: [STRESS=600] start-app.sh   (the table app, pinned to cores 2-3)
export XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-0
pkill -f 'chromium.*81[0-9][0-9]'; pkill -9 -f '[e]lectron/electron'; sleep 1
cd ~/snap-147/app
setsid nohup env STRESS="${STRESS:-0}" CAPTURE="${CAPTURE:-}" SKETCH="${SKETCH:-a}" OUTLINE="${OUTLINE:-face}" JOIN="${JOIN:-}" KEEP_TEXT="${KEEP_TEXT:-}" taskset -c 2,3 ~/electron/electron --ozone-platform=wayland --no-sandbox ~/snap-147/app >/tmp/app147.log 2>&1 < /dev/null &
sleep 6
pgrep -c -f '[e]lectron.*snap-147'
grep -v 'dbus\|Gtk' /tmp/app147.log | tail -5
