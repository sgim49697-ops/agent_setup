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

from master_loop_state import load_state, normalize_remaining_harnesses, save_state
from master_loop_trace_sanity import analyze_trace, parse_events, read_tail
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
SYNC_SCRIPT = ROOT / 'scripts/openclaw_sync_codex_oauth.py'
GIT_CHECKPOINT_SCRIPT = ROOT / 'scripts/git_state_checkpoint_watchdog.py'
BASELINE_SCRIPT = ROOT / 'scripts/master_loop_baseline_metrics.py'
STATUS_SCRIPT = ROOT / 'scripts/openclaw_master_loop_status.sh'
VALIDATOR_REPORT_PATH = ROOT / '.omx/state/master-loop-validator.json'
TRACE_REPORT_PATH = ROOT / '.omx/state/master-loop-trace-sanity.json'
LOCK_PATH = ROOT / '.omx/state/master-loop-watchdog.lock'
SESSION = 'ux-master-bg'
RUNNER_WINDOW = 'runner'
LOG_WINDOW = 'log'
HEARTBEAT_WINDOW = 'heartbeat10'
ARCHIVE_ROOT = ROOT / '.omx/logs/archive'
BLOCKER_AUTO_CLEAR_MINUTES = 10
STALL_TIMEOUT_MINUTES = 18
TRACE_RESTART_THRESHOLD = 2
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


def write_report(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def read_state() -> dict[str, Any]:
    return load_state(STATE_PATH)


def write_state(state: dict[str, Any]) -> None:
    save_state(STATE_PATH, state)


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True)


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
        heartbeat_cmd = f"bash -lc 'while true; do clear; date -u; echo; {STATUS_SCRIPT}; echo; echo \"[next refresh in 600s]\"; sleep 600; done'"
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
    windows = run(['tmux', 'list-windows', '-t', SESSION, '-F', '#W']).stdout.splitlines()
    if RUNNER_WINDOW in windows:
        run(['tmux', 'kill-window', '-t', f'{SESSION}:{RUNNER_WINDOW}'])
    run(['tmux', 'new-window', '-t', SESSION, '-n', RUNNER_WINDOW, '-c', str(ROOT), str(RUNNER_SCRIPT)])
    state['status'] = 'running'
    state['last_launch_reason'] = reason
    state['last_launch_at'] = utc_now()
    state['relaunch_count'] = int(state.get('relaunch_count', 0)) + 1
    state['cycle_status'] = 'running'
    state['project_status'] = 'in_progress'
    state['next_cycle_required'] = False
    log(f'launched runner window (reason={reason})')
    return state


def checkpoint_git() -> None:
    checkpoint = subprocess.run(['python3', str(GIT_CHECKPOINT_SCRIPT)], capture_output=True, text=True)
    if checkpoint.returncode != 0:
        log(f'git checkpoint watchdog failed: {checkpoint.stderr.strip() or checkpoint.stdout.strip()}')


def run_quality_reports(state: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    validator = build_validator_report(state)
    trace = analyze_trace(parse_events(read_tail(LOG_PATH)), state)
    write_report(VALIDATOR_REPORT_PATH, validator)
    write_report(TRACE_REPORT_PATH, trace)
    baseline_proc = subprocess.run(['python3', str(BASELINE_SCRIPT), '--quiet'], capture_output=True, text=True)
    if baseline_proc.returncode != 0:
        log(f'baseline metrics generation failed: {baseline_proc.stderr.strip() or baseline_proc.stdout.strip()}')
    state['validator_error_count'] = len(validator['errors'])
    state['validator_warning_count'] = len(validator['warnings'])
    state['trace_error_count'] = len(trace['errors'])
    state['trace_warning_count'] = len(trace['warnings'])
    if validator['errors'] or trace['errors']:
        state['regression_count'] = int(state.get('regression_count', 0)) + 1
    else:
        state['regression_count'] = 0
    return state, validator, trace


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


def maybe_restart_for_regression(state: dict[str, Any], validator: dict[str, Any], trace: dict[str, Any]) -> bool:
    severe = bool(trace['errors']) or any('required state fields' in error for error in validator['errors'])
    if not severe:
        return False
    if int(state.get('regression_count', 0)) < TRACE_RESTART_THRESHOLD:
        return False
    log('quality sanity checks crossed restart threshold; recycling runner')
    run(['tmux', 'kill-window', '-t', f'{SESSION}:{RUNNER_WINDOW}'])
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

    sync = subprocess.run(['python3', str(SYNC_SCRIPT), '--restart-gateway-if-needed', '--quiet'], capture_output=True, text=True)
    if sync.returncode != 0:
        log(f'auth sync failed: {sync.stderr.strip() or sync.stdout.strip()}')

    state = read_state()
    ensure_tmux_base()

    state, cleared = try_clear_transient_blocker(state)
    if cleared:
        write_state(state)

    state, validator, trace = run_quality_reports(state)

    if validator.get('false_completion_detected'):
        state = repair_false_completion(state)
        write_state(state)
        checkpoint_git()
        validator = build_validator_report(read_state())

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

    if runner_alive():
        if maybe_restart_for_regression(state, validator, trace):
            return 0
        progress_age = last_progress_age_minutes(state)
        if progress_age is not None and progress_age > STALL_TIMEOUT_MINUTES:
            log(f'runner appears stalled (progress age {progress_age:.1f}m); recycling runner')
            run(['tmux', 'kill-window', '-t', f'{SESSION}:{RUNNER_WINDOW}'])
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
        archive_cycle_artifacts(state)
        state['status'] = 'idle'
        state['cycle_status'] = 'idle'
        state['current_phase'] = 'next_cycle_pending'
        state['current_harness'] = normalize_remaining_harnesses(state.get('remaining_harnesses'))[0] if normalize_remaining_harnesses(state.get('remaining_harnesses')) else 'benchmark_foundation'
        state = launch_runner(state, 'next-cycle-required')
        write_state(state)
        checkpoint_git()
        return 0

    if validator['errors'] and not runner_alive():
        state['last_progress_summary'] = 'watchdog relaunched runner to recover validator errors while idle'
        state = launch_runner(state, 'validator-errors')
        write_state(state)
        checkpoint_git()
        return 0

    state = launch_runner(state, 'runner-not-active')
    write_state(state)
    checkpoint_git()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
