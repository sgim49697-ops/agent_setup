#!/usr/bin/env python3
"""Watchdog for the detached UX benchmark master-loop tmux runner."""
from __future__ import annotations

import fcntl
import json
import shutil
import socket
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from master_loop_state import load_state, normalize_remaining_harnesses, parse_bool, preferred_remaining_harness, read_safe_mode, save_state
from master_loop_trace_sanity import analyze_trace, read_progress_events
from master_loop_validator import build_report as build_validator_report

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
STATE_PATH = ROOT / '.omx/state/master-ux-loop.json'
LOG_PATH = ROOT / '.omx/logs/master-ux-benchmark-v2.log'
LAST_PATH = ROOT / '.omx/logs/master-ux-benchmark-v2.last.txt'
CYCLE_MARKER = ROOT / '.omx/logs/master-ux-benchmark-v2-cycle-complete.md'
PROJECT_FINAL_MARKER = ROOT / '.omx/logs/master-ux-benchmark-v2-project-final.md'
LEGACY_FINAL_MARKER = ROOT / '.omx/logs/master-ux-benchmark-v2-final.md'
BLOCK_MARKER = ROOT / '.omx/logs/master-ux-benchmark-v2.blocked'
RUNNER_SCRIPT = ROOT / 'scripts/run_master_ux_worker.sh'
DEFER_SCRIPT = ROOT / 'scripts/master_loop_defer_harness.py'
GIT_CHECKPOINT_SCRIPT = ROOT / 'scripts/git_state_checkpoint_watchdog.py'
BASELINE_SCRIPT = ROOT / 'scripts/master_loop_baseline_metrics.py'
QUALITY_GATE_SCRIPT = ROOT / 'scripts/master_loop_quality_gate.py'
ALERT_SCRIPT = ROOT / 'scripts/openclaw_master_loop_alerts.py'
LOG_MAINTENANCE_SCRIPT = ROOT / 'scripts/manage_master_loop_logs.py'
STATUS_SCRIPT = ROOT / 'scripts/openclaw_master_loop_status.sh'
VALIDATOR_REPORT_PATH = ROOT / '.omx/state/master-loop-validator.json'
TRACE_REPORT_PATH = ROOT / '.omx/state/master-loop-trace-sanity.json'
LOCK_PATH = ROOT / '.omx/state/master-loop-watchdog.lock'
SESSION = 'ux-master-bg'
RUNNER_WINDOW = 'runner'
LOG_WINDOW = 'log'
HEARTBEAT_WINDOW = 'heartbeat10'
ARCHIVE_ROOT = ROOT / '.omx/logs/archive'
FORENSICS_DIR = ROOT / '.omx/logs/forensics'
BLOCKER_AUTO_CLEAR_MINUTES = 10
STALL_TIMEOUT_MINUTES = 18
TRACE_RESTART_THRESHOLD = 2
PROCESS_BUDGET_BACKOFF_MINUTES = 5
MAX_ORCHESTRATOR_PROCS = 1
MAX_CODEX_EXEC_PROCS = 3
MAX_STITCH_MCP_PROCS = 3
MAX_PLAYWRIGHT_MCP_PROCS = 3
MAX_AUTOMATION_TOTAL_PROCS = 10
DEFER_FAILURE_STREAK = 8
DEFER_PHASE_STREAK = 10
TRANSIENT_BLOCKER_HINTS = (
    'oauth',
    'refresh',
    'gateway',
    'timeout',
    'token',
    'network',
    'websocket',
    'ws',
)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def mark_runner_kill(reason: str) -> None:
    """Write finish_at + interrupt markers to state BEFORE force-killing runner window.
    Ensures last_worker_finish_at stays fresh even when tmux kill-window bypasses the
    wrapper's EXIT trap (race-safe double write alongside scripts/run_master_ux_worker.sh)."""
    try:
        state = load_state(STATE_PATH)
    except Exception:
        state = {}
    ts = utc_now()
    state['last_worker_finish_at'] = ts
    state['last_worker_interrupt_at'] = ts
    state['last_worker_interrupt_reason'] = reason
    state['last_worker_finish_reason'] = f'watchdog-kill:{reason}'
    state['last_worker_exit_status'] = 'killed-by-watchdog'
    state['orchestrator_active'] = False
    try:
        save_state(STATE_PATH, state)
    except Exception:
        pass


def pkill_runner_tree() -> None:
    """Forcefully kill any surviving wrapper/orchestrator/codex processes.

    tmux kill-window sends SIGHUP to the pane's bash. If our HUP trap catches
    that and exits cleanly, the python orchestrator and codex children do NOT
    automatically die -- they stay alive under the tmux server, accumulating
    across watchdog recycles. We pattern-match and SIGKILL them explicitly so
    the next launch starts from a clean slate.
    """
    patterns = [
        'master_loop_orchestrator.py',
        'codex exec --dangerously-bypass',
        'stitch-mcp proxy',
        'playwright-mcp',
    ]
    for pat in patterns:
        subprocess.run(['pkill', '-TERM', '-f', pat], check=False, capture_output=True)
    try:
        import time
        time.sleep(1)
    except Exception:
        pass
    for pat in patterns:
        subprocess.run(['pkill', '-KILL', '-f', pat], check=False, capture_output=True)


def kill_runner_window(reason: str) -> None:
    write_watchdog_forensics('pre-kill', reason)
    mark_runner_kill(reason)
    pkill_runner_tree()
    run(['tmux', 'kill-window', '-t', f'{SESSION}:{RUNNER_WINDOW}'])


def acquire_lock():
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fh = LOCK_PATH.open('w', encoding='utf-8')
    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fh.close()
        return None
    fh.write(f"pid={Path('/proc/self/stat').read_text().split()[0]} at={utc_now()}\n")
    fh.flush()
    return fh


def log(msg: str) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open('a', encoding='utf-8') as fh:
        fh.write(f'[{utc_now()}] watchdog: {msg}\n')


def write_watchdog_forensics(event: str, reason: str = '') -> None:
    FORENSICS_DIR.mkdir(parents=True, exist_ok=True)
    ts = utc_now()
    payload = {
        'event': event,
        'reason': reason,
        'timestamp': ts,
        'state': read_state(),
        'metrics': collect_runtime_metrics(),
        'process_snapshot': process_snapshot(),
    }
    path = FORENSICS_DIR / f"watchdog-{ts.replace(':', '')}-{event}.json"
    try:
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    except Exception:
        pass


def write_report(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def read_state() -> dict[str, Any]:
    return load_state(STATE_PATH)


def write_state(state: dict[str, Any]) -> None:
    save_state(STATE_PATH, state)


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True)


def process_snapshot() -> list[str]:
    proc = run(['ps', '-eo', 'pid=,ppid=,etimes=,args='])
    if proc.returncode != 0:
        return []
    return [line.rstrip() for line in proc.stdout.splitlines() if line.strip()]


def collect_runtime_metrics() -> dict[str, int]:
    counts = {
        'orchestrator': 0,
        'worker': 0,
        'codex_exec': 0,
        'stitch_mcp': 0,
        'playwright_mcp': 0,
        'automation_total': 0,
    }
    for line in process_snapshot():
        if 'python3 /home/user/projects/agent_setup/codex_agent/scripts/master_loop_orchestrator.py' in line:
            counts['orchestrator'] += 1
        if 'bash /home/user/projects/agent_setup/codex_agent/scripts/run_master_ux_worker.sh' in line:
            counts['worker'] += 1
        if '/vendor/x86_64-unknown-linux-musl/codex/codex exec' in line:
            counts['codex_exec'] += 1
        if 'node /home/user/.npm-global/bin/stitch-mcp proxy' in line:
            counts['stitch_mcp'] += 1
        if 'node /home/user/.npm/_npx/' in line and 'playwright-mcp' in line:
            counts['playwright_mcp'] += 1
    counts['automation_total'] = (
        counts['orchestrator']
        + counts['worker']
        + counts['codex_exec']
        + counts['stitch_mcp']
        + counts['playwright_mcp']
    )
    return counts


def runtime_budget_issue(metrics: dict[str, int]) -> str | None:
    if metrics['orchestrator'] > MAX_ORCHESTRATOR_PROCS:
        return f"orchestrator>{MAX_ORCHESTRATOR_PROCS}"
    if metrics['codex_exec'] > MAX_CODEX_EXEC_PROCS:
        return f"codex_exec>{MAX_CODEX_EXEC_PROCS}"
    if metrics['stitch_mcp'] > MAX_STITCH_MCP_PROCS:
        return f"stitch_mcp>{MAX_STITCH_MCP_PROCS}"
    if metrics['playwright_mcp'] > MAX_PLAYWRIGHT_MCP_PROCS:
        return f"playwright_mcp>{MAX_PLAYWRIGHT_MCP_PROCS}"
    if metrics['automation_total'] > MAX_AUTOMATION_TOTAL_PROCS:
        return f"automation_total>{MAX_AUTOMATION_TOTAL_PROCS}"
    return None


def cleanup_orphan_mcp_proxies() -> None:
    for pattern in ('stitch-mcp proxy', 'playwright-mcp'):
        subprocess.run(['pkill', '-TERM', '-f', pattern], check=False, capture_output=True)
    try:
        import time
        time.sleep(1)
    except Exception:
        pass
    for pattern in ('stitch-mcp proxy', 'playwright-mcp'):
        subprocess.run(['pkill', '-KILL', '-f', pattern], check=False, capture_output=True)


def cleanup_runtime_budget_excess(issue: str | None = None) -> None:
    if issue and issue.startswith(('stitch_mcp', 'playwright_mcp', 'codex_exec')):
        cleanup_orphan_mcp_proxies()
        return
    pkill_runner_tree()


def gateway_healthy() -> bool:
    sock = socket.socket()
    sock.settimeout(2)
    try:
        sock.connect(('127.0.0.1', 18789))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def blocker_is_transient() -> bool:
    if not BLOCK_MARKER.exists():
        return False
    try:
        text = BLOCK_MARKER.read_text(encoding='utf-8', errors='ignore').lower()
    except OSError:
        return False
    return any(hint in text for hint in TRANSIENT_BLOCKER_HINTS)


def blocker_age_minutes() -> float:
    if not BLOCK_MARKER.exists():
        return 0.0
    return (datetime.now(timezone.utc).timestamp() - BLOCK_MARKER.stat().st_mtime) / 60.0


def try_clear_transient_blocker(state: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    if not (BLOCK_MARKER.exists() or state.get('hard_blocker')):
        return state, False

    age_ok = blocker_age_minutes() >= BLOCKER_AUTO_CLEAR_MINUTES if BLOCK_MARKER.exists() else True
    blocker_reason = str(state.get('blocker_reason', '') or '').lower().strip()
    transient = blocker_is_transient() or blocker_reason in TRANSIENT_BLOCKER_HINTS
    healthy = gateway_healthy()

    if transient and age_ok and healthy:
        if BLOCK_MARKER.exists():
            BLOCK_MARKER.unlink(missing_ok=True)
        state['hard_blocker'] = False
        state['blocker_reason'] = ''
        state['status'] = 'idle'
        state['cycle_status'] = 'idle'
        state['blocker_cleared_at'] = utc_now()
        log('cleared transient hard-blocker automatically after gateway/auth health recovered')
        return state, True

    return state, False


def tmux_has_session() -> bool:
    return run(['tmux', 'has-session', '-t', SESSION]).returncode == 0


def ensure_tmux_base() -> None:
    if not tmux_has_session():
        run(['tmux', 'new-session', '-d', '-s', SESSION, '-n', 'shell', '-c', str(ROOT)])
        log('created tmux session ux-master-bg')
    windows = run(['tmux', 'list-windows', '-t', SESSION, '-F', '#W']).stdout.splitlines()
    if LOG_WINDOW not in windows:
        run(['tmux', 'new-window', '-t', SESSION, '-n', LOG_WINDOW, '-c', str(ROOT), f"bash -lc 'tail -n 200 -f \"{LOG_PATH}\"'"])
        log('created tmux log window')
    if HEARTBEAT_WINDOW not in windows:
        heartbeat_cmd = f"bash -lc 'while true; do clear; TZ=Asia/Seoul date \"+%Y-%m-%d %H:%M:%S KST\"; echo; {STATUS_SCRIPT}; echo; echo \"[next refresh in 600s]\"; sleep 600; done'"
        run(['tmux', 'new-window', '-t', SESSION, '-n', HEARTBEAT_WINDOW, '-c', str(ROOT), heartbeat_cmd])
        log('created tmux heartbeat10 window')


def ensure_tmux_observer_windows() -> None:
    """Keep log/heartbeat windows present only when the runner is idle.

    Creating tmux windows while a long-running codex step is active has correlated
    with wrapper 143 exits. During active step execution, avoid mutating the tmux
    session and leave existing runner pane untouched.
    """
    if not tmux_has_session():
        ensure_tmux_base()
        return
    windows = run(['tmux', 'list-windows', '-t', SESSION, '-F', '#W']).stdout.splitlines()
    if LOG_WINDOW not in windows:
        run(['tmux', 'new-window', '-t', SESSION, '-n', LOG_WINDOW, '-c', str(ROOT), f"bash -lc 'tail -n 200 -f \"{LOG_PATH}\"'"])
        log('created tmux log window')
    if HEARTBEAT_WINDOW not in windows:
        heartbeat_cmd = f"bash -lc 'while true; do clear; TZ=Asia/Seoul date \"+%Y-%m-%d %H:%M:%S KST\"; echo; {STATUS_SCRIPT}; echo; echo \"[next refresh in 600s]\"; sleep 600; done'"
        run(['tmux', 'new-window', '-t', SESSION, '-n', HEARTBEAT_WINDOW, '-c', str(ROOT), heartbeat_cmd])
        log('created tmux heartbeat10 window')


def runner_alive() -> bool:
    proc = run(['tmux', 'list-panes', '-t', f'{SESSION}:{RUNNER_WINDOW}', '-F', '#{{pane_dead}} #{{pane_current_command}}'])
    if proc.returncode != 0:
        return False
    for line in proc.stdout.splitlines():
        parts = line.split(' ', 1)
        if len(parts) == 2 and parts[0] == '0':
            return True
    return False


def parse_iso(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None


def file_age_minutes(path: Path) -> float | None:
    if not path.exists():
        return None
    return (datetime.now(timezone.utc).timestamp() - path.stat().st_mtime) / 60.0


def last_progress_age_minutes(state: dict[str, Any]) -> float | None:
    ages: list[float] = []
    ts = parse_iso(state.get('last_progress_at')) or parse_iso(state.get('last_worker_start_at'))
    if ts is not None:
        ages.append((datetime.now(timezone.utc).timestamp() - ts) / 60.0)
    for candidate in (LOG_PATH, LAST_PATH):
        age = file_age_minutes(candidate)
        if age is not None:
            ages.append(age)
    if not ages:
        return None
    return min(ages)


def archive_cycle_artifacts(state: dict[str, Any]) -> None:
    cycle = state.get('cycle', 0)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = ARCHIVE_ROOT / f'cycle-{cycle}-{stamp}'
    target.mkdir(parents=True, exist_ok=True)
    for src in (CYCLE_MARKER, LAST_PATH):
        if src.exists():
            shutil.copy2(src, target / src.name)
            src.unlink(missing_ok=True)
    log(f'archived cycle artifacts to {target}')


def archive_invalid_project_final() -> None:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = ARCHIVE_ROOT / f'invalid-project-final-{stamp}'
    target.mkdir(parents=True, exist_ok=True)
    for src in (PROJECT_FINAL_MARKER, LEGACY_FINAL_MARKER):
        if src.exists():
            shutil.move(str(src), str(target / src.name))
    log(f'archived invalid project-final markers to {target}')


def is_completed() -> bool:
    if PROJECT_FINAL_MARKER.exists() or LEGACY_FINAL_MARKER.exists():
        return True
    if LAST_PATH.exists():
        text = LAST_PATH.read_text(encoding='utf-8', errors='ignore').lower()
        return 'project is complete' in text or 'all seven harnesses are complete' in text
    return False


def launch_runner(state: dict[str, Any], reason: str) -> dict[str, Any]:
    if CYCLE_MARKER.exists():
        archive_cycle_artifacts(state)
    windows = run(['tmux', 'list-windows', '-t', SESSION, '-F', '#W']).stdout.splitlines()
    if RUNNER_WINDOW in windows:
        kill_runner_window(f'relaunch:{reason}')
    run(['tmux', 'new-window', '-t', SESSION, '-n', RUNNER_WINDOW, '-c', str(ROOT), str(RUNNER_SCRIPT)])
    state['status'] = 'running'
    state['last_launch_reason'] = reason
    state['last_worker_interrupt_reason'] = reason
    state['last_worker_interrupt_at'] = utc_now()
    state['last_launch_at'] = utc_now()
    state['relaunch_count'] = int(state.get('relaunch_count', 0)) + 1
    state['cycle_status'] = 'running'
    state['project_status'] = 'in_progress'
    state['next_cycle_required'] = False
    state['runtime_guard_active'] = False
    state['runtime_guard_reason'] = ''
    log(f'launched runner window (reason={reason})')
    return state


def step_pipeline_in_progress(state: dict[str, Any], metrics: dict[str, int]) -> bool:
    if parse_bool(state.get('orchestrator_active')):
        return True
    phase = str(state.get('current_phase') or '')
    if phase.startswith('orchestrator-'):
        return True
    return bool(metrics.get('orchestrator') or metrics.get('codex_exec'))


def record_active_observation(state: dict[str, Any], metrics: dict[str, int], issue: str | None = None) -> dict[str, Any]:
    state['status'] = 'running'
    state['cycle_status'] = 'running'
    state['last_seen_running_at'] = utc_now()
    state['active_orchestrator_count'] = metrics['orchestrator']
    state['active_worker_count'] = metrics['worker']
    state['active_codex_exec_count'] = metrics['codex_exec']
    state['active_stitch_mcp_count'] = metrics['stitch_mcp']
    state['active_playwright_mcp_count'] = metrics['playwright_mcp']
    state['active_automation_process_count'] = metrics['automation_total']
    if issue:
        state['runtime_guard_active'] = True
        state['runtime_guard_reason'] = f'observe-only:{issue}'
        state['runtime_guard_last_triggered_at'] = utc_now()
        state['last_progress_summary'] = (
            f'watchdog observe-only mode during active step; runtime budget issue noted ({issue}) '
            f'but no cleanup/relaunch performed'
        )
    return state


def defer_active_harness(state: dict[str, Any], reason: str) -> dict[str, Any]:
    current = str(state.get('current_harness') or '').strip()
    remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
    if not current or current not in remaining or len(remaining) <= 1:
        return state
    proc = subprocess.run(
        ['python3', str(DEFER_SCRIPT), '--harness', current, '--reason', reason],
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        log(f'deferred harness {current}: {reason}')
        return read_state()
    log(f'failed to defer harness {current}: {proc.stderr.strip() or proc.stdout.strip()}')
    return state


def checkpoint_git() -> None:
    checkpoint = subprocess.run(['python3', str(GIT_CHECKPOINT_SCRIPT)], capture_output=True, text=True)
    if checkpoint.returncode != 0:
        log(f'git checkpoint watchdog failed: {checkpoint.stderr.strip() or checkpoint.stdout.strip()}')


def notify_if_needed() -> None:
    proc = subprocess.run(['python3', str(ALERT_SCRIPT)], capture_output=True, text=True)
    if proc.returncode != 0:
        log(f'alert notifier failed: {proc.stderr.strip() or proc.stdout.strip()}')


def maintain_logs() -> None:
    proc = subprocess.run(['python3', str(LOG_MAINTENANCE_SCRIPT), '--quiet'], capture_output=True, text=True)
    if proc.returncode != 0:
        log(f'log maintenance failed: {proc.stderr.strip() or proc.stdout.strip()}')


def active_harness_for_quality(state: dict[str, Any]) -> str:
    current = str(state.get('current_harness') or '').strip()
    if current and current not in {'benchmark_foundation', 'quality_gate', 'cycle-resume', 'cycle-validation'}:
        return current
    remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
    return remaining[0] if remaining else 'single_agent'


def run_quality_gate(state: dict[str, Any]) -> dict[str, Any]:
    harness = active_harness_for_quality(state)
    proc = subprocess.run(['python3', str(QUALITY_GATE_SCRIPT), '--active-harness', harness, '--quiet'], capture_output=True, text=True)
    report_path = ROOT / '.omx/state/master-loop-quality-gate.json'
    if report_path.exists():
        try:
            return json.loads(report_path.read_text(encoding='utf-8'))
        except Exception:
            pass
    if proc.returncode != 0:
        log(f'quality gate failed without readable report: {proc.stderr.strip() or proc.stdout.strip()}')
    return {'ok': proc.returncode == 0, 'errors': [], 'warnings': []}


def run_quality_reports(state: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    validator = build_validator_report(state)
    trace = analyze_trace(read_progress_events(LOG_PATH, state), state)
    write_report(VALIDATOR_REPORT_PATH, validator)
    write_report(TRACE_REPORT_PATH, trace)
    baseline_proc = subprocess.run(['python3', str(BASELINE_SCRIPT), '--quiet'], capture_output=True, text=True)
    if baseline_proc.returncode != 0:
        log(f'baseline metrics generation failed: {baseline_proc.stderr.strip() or baseline_proc.stdout.strip()}')
    quality_gate = run_quality_gate(state)
    state['validator_error_count'] = len(validator['errors'])
    state['validator_warning_count'] = len(validator['warnings'])
    state['trace_error_count'] = len(trace['errors'])
    state['trace_warning_count'] = len(trace['warnings'])
    state['quality_gate_error_count'] = len(quality_gate.get('errors', []))
    if validator['errors'] or trace['errors'] or quality_gate.get('errors'):
        state['regression_count'] = int(state.get('regression_count', 0)) + 1
    else:
        state['regression_count'] = 0
    return state, validator, trace, quality_gate


def repair_false_completion(state: dict[str, Any]) -> dict[str, Any]:
    archive_invalid_project_final()
    state['status'] = 'cycle_completed'
    state['project_status'] = 'in_progress'
    state['cycle_status'] = 'completed'
    state['next_cycle_required'] = True
    state['current_phase'] = 'validator-recovery'
    state['current_harness'] = state.get('current_harness') or 'benchmark_foundation'
    state['last_progress_summary'] = 'validator recovered an invalid project completion and queued the next cycle'
    log('validator detected false project completion; reverting to in-progress state')
    return state




def maybe_restart_for_regression(state: dict[str, Any], validator: dict[str, Any], trace: dict[str, Any], quality_gate: dict[str, Any]) -> bool:
    severe = bool(trace['errors']) or bool(quality_gate.get('errors')) or any('required state fields' in error for error in validator['errors'])
    if not severe:
        return False
    if int(state.get('regression_count', 0)) < TRACE_RESTART_THRESHOLD:
        return False
    log('quality sanity checks crossed restart threshold; recycling runner for another model retry')
    kill_runner_window('quality-regression')
    state['status'] = 'stalled'
    state['cycle_status'] = 'stalled'
    state['last_progress_summary'] = 'watchdog recycled runner after repeated validator/trace regressions'
    launch_runner(state, 'quality-regression')
    write_state(state)
    checkpoint_git()
    return True


def main() -> int:
    lock_fh = acquire_lock()
    if lock_fh is None:
        log('another watchdog invocation already holds the lock; skipping duplicate run')
        return 0

    safe_mode = read_safe_mode()
    if safe_mode.get('enabled'):
        log(f"safe mode enabled by {safe_mode.get('actor') or 'unknown'}; skipping sync/relaunch ({safe_mode.get('reason') or 'no reason'})")
        return 0

    state = read_state()
    session_exists = tmux_has_session()
    runner_active = runner_alive() if session_exists else False
    metrics = collect_runtime_metrics()
    state['active_orchestrator_count'] = metrics['orchestrator']
    state['active_worker_count'] = metrics['worker']
    state['active_codex_exec_count'] = metrics['codex_exec']
    state['active_stitch_mcp_count'] = metrics['stitch_mcp']
    state['active_playwright_mcp_count'] = metrics['playwright_mcp']
    state['active_automation_process_count'] = metrics['automation_total']
    pipeline_active = step_pipeline_in_progress(state, metrics)
    issue = runtime_budget_issue(metrics)
    if pipeline_active:
        progress_age = last_progress_age_minutes(state)
        if progress_age is not None and progress_age > STALL_TIMEOUT_MINUTES:
            write_watchdog_forensics('active-step-stall-observe', f'{progress_age:.1f}m')
            state = record_active_observation(state, metrics, issue)
            state['status'] = 'stalled'
            state['cycle_status'] = 'stalled'
            state['last_progress_summary'] = (
                f'watchdog observe-only: active step exceeded {STALL_TIMEOUT_MINUTES}m '
                f'({progress_age:.1f}m) but no kill/relaunch performed'
            )
            write_state(state)
            log(f'active step stale for {progress_age:.1f}m; observe-only mode left runner untouched')
            return 0

        state = record_active_observation(state, metrics, issue)
        write_state(state)
        log('active step pipeline detected; watchdog stayed observe-only and skipped all side effects')
        return 0

    if issue:
        write_watchdog_forensics('runtime-budget', issue)
        cleanup_runtime_budget_excess(issue)
        state['runtime_guard_active'] = True
        state['runtime_guard_reason'] = issue
        state['runtime_guard_last_triggered_at'] = utc_now()
        state['status'] = 'stalled'
        state['cycle_status'] = 'stalled'
        state['last_progress_summary'] = f'watchdog paused relaunch due to runtime budget overflow ({issue}) and cleaned duplicate MCP/processes'
        write_state(state)
        checkpoint_git()
        log(f'runtime budget exceeded ({issue}); cleaned excess processes and skipped relaunch for this tick')
        return 0
    state['runtime_guard_active'] = False
    state['runtime_guard_reason'] = ''

    if not session_exists:
        ensure_tmux_base()

    state, cleared = try_clear_transient_blocker(state)
    if cleared:
        write_state(state)

    if BLOCK_MARKER.exists():
        try:
            block_text = BLOCK_MARKER.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            block_text = ''
        if 'Repeated quality gate failures require human intervention' in block_text:
            BLOCK_MARKER.unlink(missing_ok=True)
            state['hard_blocker'] = False
            state['blocker_reason'] = ''
            log('cleared legacy human-escalate blocker so the model can keep retrying')
            write_state(state)

    maintain_logs()
    notify_if_needed()

    if BLOCK_MARKER.exists() or state.get('hard_blocker'):
        state['status'] = 'blocked'
        state['cycle_status'] = 'blocked'
        write_state(state)
        checkpoint_git()
        log('blocked marker present; no restart performed')
        return 0

    if is_completed():
        state['status'] = 'completed'
        state['project_status'] = 'project_completed'
        state['cycle_status'] = 'completed'
        state['next_cycle_required'] = False
        state['completed_at'] = utc_now()
        write_state(state)
        checkpoint_git()
        log('completion marker detected; watchdog exiting without restart')
        return 0

    if runner_active:
        if step_pipeline_in_progress(state, metrics):
            progress_age = last_progress_age_minutes(state)
            if progress_age is not None and progress_age > STALL_TIMEOUT_MINUTES:
                log(f'runner appears stalled (progress age {progress_age:.1f}m) during active step; recycling runner')
                kill_runner_window('stalled-progress')
                state['cycle_status'] = 'stalled'
                state['status'] = 'stalled'
                state['last_progress_summary'] = f'watchdog stalled-progress recycle after {progress_age:.1f}m without fresh heartbeat'
                state = launch_runner(state, 'stalled-progress')
                write_state(state)
                checkpoint_git()
                return 0
            state['status'] = 'running'
            state['cycle_status'] = 'running'
            state['last_seen_running_at'] = utc_now()
            write_state(state)
            checkpoint_git()
            log('runner active with step pipeline in progress; skipped quality-gate restart logic')
            return 0

    state, validator, trace, quality_gate = run_quality_reports(state)
    state = read_state()

    if validator.get('false_completion_detected'):
        state = repair_false_completion(state)
        write_state(state)
        checkpoint_git()
        validator = build_validator_report(read_state())

    current = str(state.get('current_harness') or '').strip()
    remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
    if (
        current == 'single_agent'
        and len(remaining) > 1
        and (
            int(state.get('quality_gate_failure_streak', 0)) >= DEFER_FAILURE_STREAK
            or int(trace.get('max_same_phase_streak') or 0) >= DEFER_PHASE_STREAK
        )
    ):
        reason = (
            f"auto defer after repeated churn/failure "
            f"(failure_streak={state.get('quality_gate_failure_streak')}, "
            f"phase_streak={trace.get('max_same_phase_streak')})"
        )
        state = defer_active_harness(state, reason)
        state['last_progress_summary'] = f'watchdog deferred single_agent and moved to {preferred_remaining_harness(state)}'
        state = launch_runner(state, 'deferred-single-agent')
        write_state(state)
        checkpoint_git()
        return 0

    if runner_active:
        if maybe_restart_for_regression(state, validator, trace, quality_gate):
            return 0
        progress_age = last_progress_age_minutes(state)
        if progress_age is not None and progress_age > STALL_TIMEOUT_MINUTES:
            log(f'runner appears stalled (progress age {progress_age:.1f}m); recycling runner')
            kill_runner_window('stalled-progress')
            state['cycle_status'] = 'stalled'
            state['status'] = 'stalled'
            state['last_progress_summary'] = f'watchdog stalled-progress recycle after {progress_age:.1f}m without fresh heartbeat'
            state = launch_runner(state, 'stalled-progress')
            write_state(state)
            checkpoint_git()
            return 0
        state['status'] = 'running'
        state['cycle_status'] = 'running'
        state['last_seen_running_at'] = utc_now()
        write_state(state)
        checkpoint_git()
        log('runner already active; no action needed')
        return 0

    if state.get('next_cycle_required') is True and (state.get('status') == 'cycle_completed' or CYCLE_MARKER.exists()):
        ensure_tmux_observer_windows()
        archive_cycle_artifacts(state)
        state['status'] = 'idle'
        state['cycle_status'] = 'idle'
        state['current_phase'] = 'next_cycle_pending'
        state['current_harness'] = normalize_remaining_harnesses(state.get('remaining_harnesses'))[0] if normalize_remaining_harnesses(state.get('remaining_harnesses')) else 'benchmark_foundation'
        state = launch_runner(state, 'next-cycle-required')
        write_state(state)
        checkpoint_git()
        return 0

    if (validator['errors'] or quality_gate.get('errors')) and not runner_alive():
        ensure_tmux_observer_windows()
        state['last_progress_summary'] = 'watchdog relaunched runner to recover quality gate / validator errors while idle'
        state = launch_runner(state, 'quality-gate-errors')
        write_state(state)
        checkpoint_git()
        return 0

    ensure_tmux_observer_windows()
    state = launch_runner(state, 'runner-not-active')
    write_state(state)
    checkpoint_git()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
