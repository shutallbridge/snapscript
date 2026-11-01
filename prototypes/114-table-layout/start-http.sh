#!/bin/bash
cd ~/snap-114
if ! ss -ltn | grep -q ':8114 '; then
  setsid nohup python3 -m http.server 8114 --bind 127.0.0.1 >/tmp/http114.log 2>&1 < /dev/null &
  sleep 2
fi
curl -s -o /dev/null -w "http %{http_code}\n" http://127.0.0.1:8114/table.html
