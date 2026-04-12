#!/usr/bin/env bash
# master_loop_safe_mode.sh - stop background automation and allow only manual bounded steps
set -euo pipefail

ROOT=/home/user/projects/agent_setup/codex_agent
export PYTHONPATH="$ROOT/scripts:${PYTHONPATH:-}"
STATE="$ROOT/.omx/state/master-ux-loop.json"
SAFE_MODE_JSON="$ROOT/.omx/state/master-loop-safe-mode.json"
BLOCKER="$ROOT/.omx/logs/master-ux-benchmark-v2.blocked"
STATE_HELPER="$ROOT/scripts/master_loop_state.py"
SESSION_MAIN="ux-master-bg"
SESSION_PREVIEW="ux-preview-bg"

usage() {
  cat <<'EOF'
usage: master_loop_safe_mode.sh <on|off|status> [reason...]

on [reason...]   Enable safe mode, stop services, kill background workers, and set blocker
off              Disable safe mode and remove blocker (does not auto-restart services)
status           Print current safe-mode JSON and relevant service states
EOF
}

write_safe_mode() {
  local enabled="$1"
  local reason="$2"
  local actor="${USER:-manual}"
  ENABLED="$enabled" REASON="$reason" ACTOR="$actor" python3 - <<'PY'
import os
from master_loop_state import write_safe_mode
write_safe_mode(
    enabled=os.environ["ENABLED"] == "1",
    reason=os.environ.get("REASON", ""),
    actor=os.environ.get("ACTOR", "manual"),
)
PY
}

stop_service() {
  local unit="$1"
  systemctl --user stop "$unit" >/dev/null 2>&1 || true
}

kill_session() {
  local name="$1"
  tmux has-session -t "$name" >/dev/null 2>&1 && tmux kill-session -t "$name" || true
}

kill_pattern() {
  local pattern="$1"
  pkill -TERM -f "$pattern" >/dev/null 2>&1 || true
  sleep 1
  pkill -KILL -f "$pattern" >/dev/null 2>&1 || true
}

status() {
  if [[ -f "$SAFE_MODE_JSON" ]]; then
    cat "$SAFE_MODE_JSON"
  else
    printf '{"enabled": false, "reason": "", "actor": "", "updated_at": ""}\n'
  fi
  printf '\n'
  systemctl --user is-active openclaw-gateway.service ux-master-loop-watchdog.timer ux-master-loop-watchdog.service || true
  printf '\nblocker=%s\n' "$( [[ -f "$BLOCKER" ]] && echo present || echo absent )"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  on)
    reason="${*:-manual safe mode enabled}"
    mkdir -p "$ROOT/.omx/logs" "$ROOT/.omx/state"
    write_safe_mode 1 "$reason"
    cat > "$BLOCKER" <<EOF
safe-mode-enabled
reason: $reason
updated_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
    python3 "$STATE_HELPER" "$STATE" status blocked cycle_status blocked blocker_reason safe-mode-enabled hard_blocker __false__ last_progress_summary "safe mode enabled: $reason" >/dev/null 2>&1 || true

    stop_service ux-master-loop-watchdog.timer
    stop_service ux-master-loop-watchdog.service
    stop_service openclaw-gateway.service

    kill_session "$SESSION_MAIN"
    kill_session "$SESSION_PREVIEW"

    kill_pattern "master_loop_orchestrator.py"
    kill_pattern "run_master_ux_worker.sh"
    kill_pattern "agent_setup/codex_agent/.omx/cycles"
    kill_pattern "stitch-mcp proxy"
    kill_pattern "playwright-mcp"
    kill_pattern "notify-fallback-watcher"

    printf 'safe mode enabled\n'
    status
    ;;
  off)
    write_safe_mode 0 "manual safe mode disabled"
    rm -f "$BLOCKER"
    python3 "$STATE_HELPER" "$STATE" status idle cycle_status idle blocker_reason "" >/dev/null 2>&1 || true
    printf 'safe mode disabled (services remain stopped until manually started)\n'
    status
    ;;
  status)
    status
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
