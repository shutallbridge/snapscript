#!/bin/bash
export XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-0
pkill -f 'chromium.*8128'; pkill -f gcr-prompter; pkill -f gnome-keyring; sleep 1
setsid nohup chromium --kiosk --noerrdialogs --disable-infobars --no-first-run --password-store=basic --ozone-platform=wayland \
  --user-data-dir=/tmp/chrome-128 http://localhost:8128/table.html >/tmp/chrome128.log 2>&1 < /dev/null &
sleep 6
pgrep -c -f 'chromium.*8128'
tail -3 /tmp/chrome128.log
