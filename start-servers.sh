#!/usr/bin/env bash
# Marbel AI backend launcher + watchdog
# Menjalankan server.js pada beberapa port (default 12000 & 12001 = work-1/work-2)
# dengan auto-restart bila proses crash. Log disimpan di /tmp.
#
# Penggunaan:
#   ./start-servers.sh                 # jalankan semua port (12000, 12001) + auto-restart
#   ./start-servers.sh 12000 12001     # port khusus
#   ./start-servers.sh ensure          # pastikan server hidup; start bila belum (aman utk cron/hook)
#   ./start-servers.sh watchdog        # sekali jalan: pastikan server hidup, lalu keluar
#   ./start-servers.sh stop            # hentikan semua server Marbel AI
#   ./start-servers.sh status          # cek status

set -u

CMD="${1:-}"
# Port diambil dari argumen setelah perintah (jika ada), selain itu default.
PORTS=()
if [ -n "$CMD" ] && [ "$CMD" != "stop" ] && [ "$CMD" != "status" ] && [ "$CMD" != "ensure" ] && [ "$CMD" != "watchdog" ]; then
  # Argumen pertama adalah port, bukan subcommand
  PORTS=("$@")
else
  for p in "${@:2}"; do PORTS+=("$p"); done
fi
if [ "${#PORTS[@]}" -eq 0 ]; then
  PORTS=(12000 12001)
fi

LOGDIR="${MARBEL_LOG_DIR:-/tmp/marbel-logs}"
PIDFILE_PREFIX="${MARBEL_PID_PREFIX:-/tmp/marbel-server}"
LAUNCHER_PIDFILE="${MARBEL_LAUNCHER_PIDFILE:-/tmp/marbel-launcher.pid}"

mkdir -p "$LOGDIR"
cd "$(dirname "$0")"

stop_all() {
  # Hentikan launcher (start-servers.sh) lebih dulu agar tidak me-restart server.
  if [ -f "$LAUNCHER_PIDFILE" ]; then
    local lpid
    lpid=$(cat "$LAUNCHER_PIDFILE" 2>/dev/null || true)
    if [ -n "$lpid" ] && kill -0 "$lpid" 2>/dev/null; then
      kill "$lpid" 2>/dev/null && echo "menghentikan launcher PID $lpid"
    fi
    rm -f "$LAUNCHER_PIDFILE"
  fi
  # Cadangan: hentikan sisa proses start-servers lain (kecuali diri sendiri)
  local mypid=$$
  for p in $(pgrep -f "start-servers" 2>/dev/null); do
    [ "$p" = "$mypid" ] && continue
    kill "$p" 2>/dev/null || true
  done
  sleep 1
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
  for p in $(pgrep -f "node server.js" 2>/dev/null); do
    [ "$p" = "$mypid" ] && continue
    kill "$p" 2>/dev/null || true
  done
  echo "semua server Marbel AI dihentikan ($n proses)."
  exit 0
}

status_all() {
  local running=0
  local any=false
  local lp=""
  if [ -f "$LAUNCHER_PIDFILE" ]; then
    lp=$(cat "$LAUNCHER_PIDFILE" 2>/dev/null || true)
    if [ -n "$lp" ] && kill -0 "$lp" 2>/dev/null; then
      echo "launcher: BERJALAN (PID $lp)"
    else
      echo "launcher: MATI"
    fi
  else
    echo "launcher: belum tercatat"
  fi
  for f in "$PIDFILE_PREFIX"*.pid; do
    [ -e "$f" ] || continue
    any=true
    local pid port
    port=$(basename "$f" | sed 's/.*-//; s/\.pid//')
    pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
      echo "port $port: BERJALAN (PID $pid)"
      running=$((running+1))
    else
      echo "port $port: MATI (PID $pid)"
    fi
  done
  if ! $any; then
    echo "tidak ada pidfile — server belum dijalankan melalui launcher."
    return 1
  fi
  echo "$running server berjalan."
  return 0
}

# Pastikan server hidup (start bila belum). Dipakai oleh autostart/watchdog/cron.
ensure() {
  # Launcher aktif jika pidfile ada dan proses-nya hidup.
  if [ -f "$LAUNCHER_PIDFILE" ]; then
    local lpid
    lpid=$(cat "$LAUNCHER_PIDFILE" 2>/dev/null || true)
    if [ -n "$lpid" ] && kill -0 "$lpid" 2>/dev/null; then
      echo "launcher sudah berjalan (PID $lpid)."
      status_all || true
      return 0
    fi
    rm -f "$LAUNCHER_PIDFILE"
  fi
  echo "launcher tidak berjalan — memulai di background…"
  setsid nohup "$0" "${PORTS[@]}" >/tmp/marbel-launcher.log 2>&1 &
  disown
  sleep 2
  status_all || true
}

case "${1:-}" in
  stop)     stop_all ;;
  status)   status_all ;;
  ensure)   ensure ;;
  watchdog) ensure ;;
esac

# Lanjut ke launcher hanya jika bukan mode perintah singkat di atas.
# (Hati-hati: ensure/watchdog mengeksekusi $0 dengan setsid — tetapi karena
#  setsid nohup fork, alur ini tidak akan dieksekusi dua kali.)
if [ "${1:-}" = "stop" ] || [ "${1:-}" = "status" ] || [ "${1:-}" = "ensure" ] || [ "${1:-}" = "watchdog" ] || [ "${1:-}" = "restart" ]; then
  exit 0
fi

# Proses ini adalah launcher utama — catat PID-nya agar ensure/watchdog/stop akurat.
# Hanya tulis pidfile bila belum ada launcher lain yang hidup (hindari
# menimpa pidfile milik instance yang sudah berjalan).
if [ -f "$LAUNCHER_PIDFILE" ]; then
  _lpid=$(cat "$LAUNCHER_PIDFILE" 2>/dev/null || true)
  if [ -n "$_lpid" ] && [ "$_lpid" != "$$" ] && kill -0 "$_lpid" 2>/dev/null; then
    echo "launcher lain sudah berjalan (PID $_lpid) — instance ini tidak menulis pidfile."
    exit 0
  fi
fi
echo $$ > "$LAUNCHER_PIDFILE"
trap 'rm -f "$LAUNCHER_PIDFILE"' EXIT INT TERM

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