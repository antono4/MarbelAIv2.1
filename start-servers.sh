#!/usr/bin/env bash
# Marbel AI backend launcher
# Menjalankan server.js pada beberapa port (default 12000 & 12001 = work-1/work-2)
# dengan auto-restart bila proses crash. Log disimpan di /tmp.
#
# Penggunaan:
#   ./start-servers.sh              # jalankan semua port (12000, 12001)
#   ./start-servers.sh 12000 12001  # port khusus
#   ./start-servers.sh stop         # hentikan semua server Marbel AI
#   ./start-servers.sh status       # cek status

set -u

PORTS=("$@")
if [ "${#PORTS[@]}" -eq 0 ]; then
  PORTS=(12000 12001)
fi

LOGDIR="${MARBEL_LOG_DIR:-/tmp/marbel-logs}"
PIDFILE_PREFIX="${MARBEL_PID_PREFIX:-/tmp/marbel-server}"

mkdir -p "$LOGDIR"
cd "$(dirname "$0")"

stop_all() {
  local n=0
  for f in "$PIDFILE_PREFIX"*.pid; do
    [ -e "$f" ] || continue
    local pid
    pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo "menghentikan PID $pid ($(basename "$f"))"
      n=$((n+1))
    fi
    rm -f "$f"
  done
  sleep 1
  # pastikan benar-benar mati (hanya proses node server.js milik repo ini)
  pkill -f "node server.js" 2>/dev/null
  echo "semua server Marbel AI dihentikan ($n proses)."
  exit 0
}

status_all() {
  for f in "$PIDFILE_PREFIX"*.pid; do
    [ -e "$f" ] || continue
    local pid port
    port=$(basename "$f" | sed 's/.*-//; s/\.pid//')
    pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
      echo "port $port: BERJALAN (PID $pid)"
    else
      echo "port $port: MATI (PID $pid)"
    fi
  done
  exit 0
}

case "${1:-}" in
  stop)   stop_all ;;
  status) status_all ;;
esac

# Fungsi untuk menjalankan satu server + auto-restart.
run_port() {
  local port="$1"
  local log="$LOGDIR/server-$port.log"
  local pidfile="$PIDFILE_PREFIX-$port.pid"

  while true; do
    # Hanya satu instance per port
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile" 2>/dev/null)" 2>/dev/null; then
      echo "port $port: sudah berjalan (PID $(cat "$pidfile"))"
      return
    fi

    echo "port $port: memulai server (log: $log)"
    PORT="$port" node server.js >> "$log" 2>&1 &
    local child=$!
    echo "$child" > "$pidfile"
    wait "$child"

    local rc=$?
    rm -f "$pidfile"
    if [ "$rc" -ne 0 ]; then
      echo "port $port: server keluar (kode $rc) — restart dalam 2 detik…"
      sleep 2
    else
      echo "port $port: server berhenti normal."
      return
    fi
  done
}

pids=()
for port in "${PORTS[@]}"; do
  run_port "$port" &
  pids+=("$!")
done

echo "Semua server Marbel AI aktif: ${PORTS[*]}"
echo "Log: $LOGDIR  |  hentikan: $0 stop  |  cek: $0 status"

trap 'for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done' TERM INT
for p in "${pids[@]}"; do
  wait "$p"
done