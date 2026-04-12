#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/user/projects/agent_setup/codex_agent
STATE="$ROOT/.omx/state/master-ux-loop.json"
LOG="$ROOT/.omx/logs/master-ux-benchmark-v2.log"
if [ -f "$STATE" ]; then
  echo '=== state ==='
  cat "$STATE"
else
  echo 'no state file'
fi
if [ -f "$LOG" ]; then
  echo
  echo '=== log tail ==='
  tail -n 30 "$LOG"
fi
