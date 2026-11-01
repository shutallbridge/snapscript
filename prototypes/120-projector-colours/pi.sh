#!/usr/bin/env bash
# PROTOTYPE (#120, copied from #46), throwaway: run a command on the Pi, or copy files to/from it,
# typing the SSH password with expect. Set PI_PASS; PI_HOST defaults to the rig Pi.
#   pi.sh 'uname -a'
#   pi.sh put local_file remote_path
#   pi.sh get remote_path local_path
set -euo pipefail
host="${PI_HOST:-shutallbridge@ironbridge.local}"
: "${PI_PASS:?set PI_PASS to the Pi password}"
opts=(-o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no)

case "${1:-}" in
  put) cmd=(scp "${opts[@]}" -r "$2" "$host:$3") ;;
  get) cmd=(scp "${opts[@]}" -r "$host:$2" "$3") ;;
  *) cmd=(ssh "${opts[@]}" "$host" "$*") ;;
esac

read -r -d '' script <<'TCL' || true
set timeout -1
spawn -noecho {*}$argv
expect {
  -re "assword:" { send -- "$env(PI_PASS)\r"; exp_continue }
  eof
}
catch wait result
exit [lindex $result 3]
TCL
PI_PASS="$PI_PASS" expect <(printf "%s" "$script") "${cmd[@]}"
