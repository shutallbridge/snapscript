#!/bin/bash
cd ~/snap-128
if ! ss -ltn | grep -q ':8128 '; then
  setsid nohup python3 -m http.server 8128 --bind 127.0.0.1 >/tmp/http128.log 2>&1 < /dev/null &
  sleep 2
fi
curl -s -o /dev/null -w "http %{http_code}\n" http://127.0.0.1:8128/table.html
