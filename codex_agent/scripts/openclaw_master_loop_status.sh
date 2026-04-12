#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/user/projects/agent_setup/codex_agent
STATE="$ROOT/.omx/state/master-ux-loop.json"
LOG="$ROOT/.omx/logs/master-ux-benchmark-v2.log"
VALIDATOR_REPORT="$ROOT/.omx/state/master-loop-validator.json"
TRACE_REPORT="$ROOT/.omx/state/master-loop-trace-sanity.json"
BASELINE_REPORT="$ROOT/.omx/state/master-loop-baseline-metrics.json"
QUALITY_REPORT="$ROOT/.omx/state/master-loop-quality-gate.json"

python3 "$ROOT/scripts/master_loop_validator.py" --quiet >/dev/null || true
python3 "$ROOT/scripts/master_loop_trace_sanity.py" --quiet >/dev/null || true
python3 "$ROOT/scripts/master_loop_baseline_metrics.py" --quiet >/dev/null || true
python3 "$ROOT/scripts/master_loop_quality_gate.py" --active-harness "$(python3 - <<'INNER'
from pathlib import Path
from master_loop_state import load_state, normalize_remaining_harnesses
state=load_state(Path('/home/user/projects/agent_setup/codex_agent/.omx/state/master-ux-loop.json'))
current=str(state.get('current_harness') or '').strip()
if current and current != 'benchmark_foundation':
    print(current)
else:
    remaining=normalize_remaining_harnesses(state.get('remaining_harnesses'))
    print(remaining[0] if remaining else 'single_agent')
INNER
)" --quiet >/dev/null || true

python3 - <<'PY'
import json
from pathlib import Path
root = Path('/home/user/projects/agent_setup/codex_agent')
state = json.loads((root / '.omx/state/master-ux-loop.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-ux-loop.json').exists() else {}
validator = json.loads((root / '.omx/state/master-loop-validator.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-loop-validator.json').exists() else {}
trace = json.loads((root / '.omx/state/master-loop-trace-sanity.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-loop-trace-sanity.json').exists() else {}
metrics = json.loads((root / '.omx/state/master-loop-baseline-metrics.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-loop-baseline-metrics.json').exists() else {}
quality = json.loads((root / '.omx/state/master-loop-quality-gate.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-loop-quality-gate.json').exists() else {}
print('=== state ===')
for key in ['status','project_status','cycle_status','cycle','current_phase','current_harness','remaining_harnesses','last_progress_at','last_progress_summary','next_cycle_required','hard_blocker','relaunch_count','regression_count']:
    print(f'{key}: {state.get(key)}')
print('\n=== validator ===')
print(f"ok: {validator.get('ok')} | errors: {len(validator.get('errors', []))} | warnings: {len(validator.get('warnings', []))}")
for line in validator.get('errors', [])[:3]:
    print(f'- ERROR: {line}')
for line in validator.get('warnings', [])[:3]:
    print(f'- WARN: {line}')
print('\n=== trace ===')
print(f"ok: {trace.get('ok')} | churn_rate: {trace.get('churn_rate')} | max_same_phase_streak: {trace.get('max_same_phase_streak')}")
for line in trace.get('errors', [])[:3]:
    print(f'- ERROR: {line}')
for line in trace.get('warnings', [])[:3]:
    print(f'- WARN: {line}')
print('\n=== baseline ===')
for key in ['state_omission_rate','churn_rate','false_completion_rate','phase_event_count','validator_error_count','trace_error_count']:
    print(f'{key}: {metrics.get(key)}')
print('\n=== quality gate ===')
print(f"ok: {quality.get('ok')} | errors: {len(quality.get('errors', []))} | warnings: {len(quality.get('warnings', []))}")
for line in quality.get('errors', [])[:3]:
    print(f'- ERROR: {line}')
for line in quality.get('warnings', [])[:3]:
    print(f'- WARN: {line}')
PY

if [ -f "$LOG" ]; then
  echo
  echo '=== log tail ==='
  tail -n 20 "$LOG"
fi
