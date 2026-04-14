#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/user/projects/agent_setup/codex_agent
export PYTHONPATH="$ROOT/scripts:${PYTHONPATH:-}"
LOG="$ROOT/.omx/logs/master-ux-benchmark-v2.log"
STATE="$ROOT/.omx/state/master-ux-loop.json"
FINAL="$ROOT/.omx/logs/master-ux-benchmark-v2-final.md"
PROJECT_FINAL="$ROOT/.omx/logs/master-ux-benchmark-v2-project-final.md"
CYCLE_FINAL="$ROOT/.omx/logs/master-ux-benchmark-v2-cycle-complete.md"
LAST="$ROOT/.omx/logs/master-ux-benchmark-v2.last.txt"
BLOCK="$ROOT/.omx/logs/master-ux-benchmark-v2.blocked"
QUALITY_GATE="$ROOT/.omx/state/master-loop-quality-gate.json"
VALIDATOR="$ROOT/.omx/state/master-loop-validator.json"
TRACE="$ROOT/.omx/state/master-loop-trace-sanity.json"
UI_LANGUAGE="$ROOT/.omx/state/master-loop-ui-language.json"
BASELINE="$ROOT/.omx/state/master-loop-baseline-metrics.json"
GIT_CHECKPOINT="$ROOT/.omx/state/git-checkpoint-state.json"
RESET_GUIDE="docs/master-loop-reset-watchdog-guidance.md"
ARCHIVE_DIR="$ROOT/.omx/logs/archive/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$ARCHIVE_DIR" "$ROOT/.omx/logs" "$ROOT/.omx/state"
for f in "$FINAL" "$PROJECT_FINAL" "$CYCLE_FINAL" "$LAST" "$BLOCK"; do
  if [ -f "$f" ]; then
    mv "$f" "$ARCHIVE_DIR/$(basename "$f")"
  fi
done
for f in "$QUALITY_GATE" "$VALIDATOR" "$TRACE" "$UI_LANGUAGE" "$BASELINE" "$GIT_CHECKPOINT"; do
  if [ -f "$f" ]; then
    mv "$f" "$ARCHIVE_DIR/$(basename "$f")"
  fi
done
python3 - <<'PY'
from datetime import datetime, timezone
from pathlib import Path
from master_loop_state import DEFAULT_DEFERRED_HARNESSES, automation_harnesses, save_state
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
    'current_phase': 'cycle-resume',
    'current_harness': 'benchmark_foundation',
    'remaining_harnesses': automation_harnesses(),
    'deferred_harnesses': DEFAULT_DEFERRED_HARNESSES,
    'remaining_cycle_history': [],
    'phase_history': [],
    'remaining_regression_count': 0,
    'stagnant_cycle_count': 0,
    'review_only_failures': 0,
    'quality_gate_error_count': 0,
    'updated_at': now,
    'reset_at': now,
    'last_progress_at': now,
    'last_progress_summary': 'master loop reset with single_agent deferred/excluded and awaiting next cycle launch; read docs/master-loop-reset-watchdog-guidance.md before restarting',
    'blocker_reason': '',
}
save_state(state_path, state)
PY
printf '[%s] master loop reset; archived previous completion markers and derived state under %s (guide=%s)\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$ARCHIVE_DIR" "$RESET_GUIDE" >> "$LOG"
python3 "$ROOT/scripts/openclaw_master_loop_watchdog.py"
echo "reset complete"
