#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/user/projects/agent_setup/codex_agent
export PYTHONPATH="$ROOT/scripts:${PYTHONPATH:-}"
STATE="$ROOT/.omx/state/master-ux-loop.json"
LOG="$ROOT/.omx/logs/master-ux-benchmark-v2.log"
VALIDATOR_REPORT="$ROOT/.omx/state/master-loop-validator.json"
TRACE_REPORT="$ROOT/.omx/state/master-loop-trace-sanity.json"
BASELINE_REPORT="$ROOT/.omx/state/master-loop-baseline-metrics.json"
QUALITY_REPORT="$ROOT/.omx/state/master-loop-quality-gate.json"
export RUNNER_ELAPSED=$(ps -eo etimes,cmd | grep -E "run_master_ux_worker\.sh" | grep -v grep | head -n1 | awk "{print \$1}" || true)

python3 "$ROOT/scripts/master_loop_validator.py" --quiet >/dev/null || true
STATE_PROJECT_STATUS=$(python3 - <<'PY'
import json
from pathlib import Path
state = json.loads(Path('/home/user/projects/agent_setup/codex_agent/.omx/state/master-ux-loop.json').read_text(encoding='utf-8'))
print(state.get('project_status', 'in_progress'))
PY
)
if [[ "$STATE_PROJECT_STATUS" != "project_completed" ]]; then
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
fi

python3 - <<'PY'
import json, os, subprocess
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
root = Path('/home/user/projects/agent_setup/codex_agent')
state = json.loads((root / '.omx/state/master-ux-loop.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-ux-loop.json').exists() else {}
validator = json.loads((root / '.omx/state/master-loop-validator.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-loop-validator.json').exists() else {}
trace = json.loads((root / '.omx/state/master-loop-trace-sanity.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-loop-trace-sanity.json').exists() else {}
metrics = json.loads((root / '.omx/state/master-loop-baseline-metrics.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-loop-baseline-metrics.json').exists() else {}
quality = json.loads((root / '.omx/state/master-loop-quality-gate.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-loop-quality-gate.json').exists() else {}
safe = json.loads((root / '.omx/state/master-loop-safe-mode.json').read_text(encoding='utf-8')) if (root / '.omx/state/master-loop-safe-mode.json').exists() else {"enabled": False}
proc = subprocess.run(['ps', '-eo', 'args='], capture_output=True, text=True)
lines = [line for line in proc.stdout.splitlines() if line.strip() and 'openclaw_master_loop_status.sh' not in line]
runtime = {
    'active_worker_count': sum('bash /home/user/projects/agent_setup/codex_agent/scripts/run_master_ux_worker.sh' in line for line in lines),
    'active_orchestrator_count': sum('python3 /home/user/projects/agent_setup/codex_agent/scripts/master_loop_orchestrator.py' in line for line in lines),
    'active_codex_exec_count': sum('/vendor/x86_64-unknown-linux-musl/codex/codex exec' in line for line in lines),
    'active_stitch_mcp_count': sum('node /home/user/.npm-global/bin/stitch-mcp proxy' in line for line in lines),
    'active_playwright_mcp_count': sum('node /home/user/.npm/_npx/' in line and 'playwright-mcp' in line for line in lines),
}
runtime['active_automation_process_count'] = sum(runtime.values())
KST = ZoneInfo("Asia/Seoul")

def fmt_kst(value):
    if not isinstance(value, str) or not value:
        return value
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST).strftime('%Y-%m-%d %H:%M:%S KST')

print('=== state ===')
print(f'worker_elapsed_sec: {os.environ.get("RUNNER_ELAPSED", "")}')
for key in ['status','project_status','cycle_status','cycle','current_phase','current_harness','remaining_harnesses','deferred_harnesses','last_progress_at','last_progress_summary','last_worker_start_at','last_worker_finish_at','last_worker_interrupt_at','last_worker_interrupt_reason','last_launch_reason','next_cycle_required','hard_blocker','relaunch_count','regression_count','quality_gate_failure_streak','current_harness_cycle_streak','active_worker_count','active_orchestrator_count','active_codex_exec_count','active_stitch_mcp_count','active_playwright_mcp_count','active_automation_process_count','runtime_guard_active','runtime_guard_reason','runtime_guard_last_triggered_at']:
    if key.startswith('active_'):
        value = runtime.get(key)
    else:
        value = state.get(key) if state.get(key) is not None else runtime.get(key)
    if isinstance(value, str) and key.endswith('_at'):
        value = fmt_kst(value)
    print(f'{key}: {value}')
print(f"safe_mode_enabled: {safe.get('enabled')}")
print(f"safe_mode_reason: {safe.get('reason')}")
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
  python3 - <<'PY'
import re
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

log = Path('/home/user/projects/agent_setup/codex_agent/.omx/logs/master-ux-benchmark-v2.log')
KST = ZoneInfo("Asia/Seoul")
pat = re.compile(r'^\[([0-9T:\-+.Z]+)\]')
lines = deque(maxlen=20)
with log.open('r', encoding='utf-8', errors='ignore') as fh:
    for line in fh:
        lines.append(line.rstrip('\n'))
for line in lines:
    m = pat.match(line)
    if not m:
        print(line)
        continue
    raw = m.group(1)
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        stamp = dt.astimezone(KST).strftime('%Y-%m-%d %H:%M:%S KST')
        print(f'[{stamp}]' + line[m.end():])
    except ValueError:
        print(line)
PY
fi
