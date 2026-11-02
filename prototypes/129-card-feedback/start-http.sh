#!/bin/bash
cd ~/snap-129
if ! ss -ltn | grep -q ':8129 '; then
  setsid nohup python3 -m http.server 8129 --bind 127.0.0.1 >/tmp/http129.log 2>&1 < /dev/null &
  sleep 2
fi
curl -s -o /dev/null -w "http %{http_code}\n" http://127.0.0.1:8129/table.html
