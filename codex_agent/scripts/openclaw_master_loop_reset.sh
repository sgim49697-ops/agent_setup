#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/user/projects/agent_setup/codex_agent
LOG="$ROOT/.omx/logs/master-ux-benchmark-v2.log"
STATE="$ROOT/.omx/state/master-ux-loop.json"
FINAL="$ROOT/.omx/logs/master-ux-benchmark-v2-final.md"
PROJECT_FINAL="$ROOT/.omx/logs/master-ux-benchmark-v2-project-final.md"
CYCLE_FINAL="$ROOT/.omx/logs/master-ux-benchmark-v2-cycle-complete.md"
LAST="$ROOT/.omx/logs/master-ux-benchmark-v2.last.txt"
BLOCK="$ROOT/.omx/logs/master-ux-benchmark-v2.blocked"
ARCHIVE_DIR="$ROOT/.omx/logs/archive/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$ARCHIVE_DIR" "$ROOT/.omx/logs" "$ROOT/.omx/state"
for f in "$FINAL" "$PROJECT_FINAL" "$CYCLE_FINAL" "$LAST" "$BLOCK"; do
  if [ -f "$f" ]; then
    mv "$f" "$ARCHIVE_DIR/$(basename "$f")"
  fi
done
python3 - <<'PY'
from datetime import datetime, timezone
from pathlib import Path
from master_loop_state import HARNESSES, save_state
state_path = Path('/home/user/projects/agent_setup/codex_agent/.omx/state/master-ux-loop.json')
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
state = {
    'status': 'idle',
    'cycle': 0,
    'project_status': 'in_progress',
    'cycle_status': 'idle',
    'session': 'ux-master-bg',
    'runner_window': 'runner',
    'log_path': '/home/user/projects/agent_setup/codex_agent/.omx/logs/master-ux-benchmark-v2.log',
    'last_path': '/home/user/projects/agent_setup/codex_agent/.omx/logs/master-ux-benchmark-v2.last.txt',
    'completion_marker': '/home/user/projects/agent_setup/codex_agent/.omx/logs/master-ux-benchmark-v2-project-final.md',
    'relaunch_count': 0,
    'regression_count': 0,
    'hard_blocker': False,
    'next_cycle_required': True,
    'current_phase': 'benchmark_foundation',
    'current_harness': 'benchmark_foundation',
    'remaining_harnesses': HARNESSES,
    'updated_at': now,
    'reset_at': now,
    'last_progress_at': now,
    'last_progress_summary': 'master loop reset and awaiting next cycle launch',
    'blocker_reason': '',
}
save_state(state_path, state)
PY
printf '[%s] master loop reset; archived previous completion markers under %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$ARCHIVE_DIR" >> "$LOG"
python3 "$ROOT/scripts/openclaw_master_loop_watchdog.py"
echo "reset complete"
