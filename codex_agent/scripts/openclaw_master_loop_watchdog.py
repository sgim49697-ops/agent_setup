#!/usr/bin/env python3
"""Watchdog for the detached UX benchmark master-loop tmux runner."""
from __future__ import annotations

import json
import shutil
import socket
import subprocess
from datetime import datetime, timezone
from pathlib import Path

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
STATUS_SCRIPT = ROOT / 'scripts/openclaw_master_loop_status.sh'
SESSION = 'ux-master-bg'
RUNNER_WINDOW = 'runner'
LOG_WINDOW = 'log'
HEARTBEAT_WINDOW = 'heartbeat10'
ARCHIVE_ROOT = ROOT / '.omx/logs/archive'
BLOCKER_AUTO_CLEAR_MINUTES = 10
STALL_TIMEOUT_MINUTES = 18
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


def log(msg: str) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open('a', encoding='utf-8') as fh:
        fh.write(f'[{utc_now()}] watchdog: {msg}\n')


def normalize_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {'true', '1', 'yes'}:
            return True
        if lowered in {'false', '0', 'no', '', 'null', 'none'}:
            return False
    return bool(value)


def normalize_int(value, default=0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def normalize_state(state: dict) -> dict:
    state['hard_blocker'] = normalize_bool(state.get('hard_blocker', False))
    state['next_cycle_required'] = normalize_bool(state.get('next_cycle_required', True))
    state['cycle'] = normalize_int(state.get('cycle', 0), 0)
    blocker_reason = state.get('blocker_reason')
    if blocker_reason in (True, False, None):
        state['blocker_reason'] = '' if not blocker_reason else str(blocker_reason)
    remaining = state.get('remaining_harnesses')
    if remaining in (None, False):
        state['remaining_harnesses'] = ''
    return state


def read_state() -> dict:
    if STATE_PATH.exists():
        return normalize_state(json.loads(STATE_PATH.read_text(encoding='utf-8')))
    return normalize_state({
        'status': 'idle',
        'cycle': 0,
        'project_status': 'in_progress',
        'cycle_status': 'idle',
        'session': SESSION,
        'runner_window': RUNNER_WINDOW,
        'log_path': str(LOG_PATH),
        'last_path': str(LAST_PATH),
        'completion_marker': str(PROJECT_FINAL_MARKER),
        'relaunch_count': 0,
        'hard_blocker': False,
        'next_cycle_required': True,
        'updated_at': utc_now(),
    })


def write_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    state = normalize_state(state)
    state['updated_at'] = utc_now()
    STATE_PATH.write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')


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


def try_clear_transient_blocker(state: dict) -> tuple[dict, bool]:
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
        state['status'] = 'idle'
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


def last_progress_age_minutes(state: dict) -> float | None:
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


def archive_cycle_artifacts(state: dict) -> None:
    cycle = state.get('cycle', 0)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = ARCHIVE_ROOT / f'cycle-{cycle}-{stamp}'
    target.mkdir(parents=True, exist_ok=True)
    for src in (CYCLE_MARKER, LAST_PATH):
        if src.exists():
            shutil.copy2(src, target / src.name)
            src.unlink(missing_ok=True)
    log(f'archived cycle artifacts to {target}')


def is_completed() -> bool:
    if PROJECT_FINAL_MARKER.exists() or LEGACY_FINAL_MARKER.exists():
        return True
    if LAST_PATH.exists():
        text = LAST_PATH.read_text(encoding='utf-8', errors='ignore').lower()
        return 'project is complete' in text or 'all seven harnesses are complete' in text
    return False


def launch_runner(state: dict, reason: str) -> dict:
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
    log(f'launched runner window (reason={reason})')
    return state


def main() -> int:
    sync = subprocess.run(['python3', str(SYNC_SCRIPT), '--restart-gateway-if-needed', '--quiet'], capture_output=True, text=True)
    if sync.returncode != 0:
        log(f'auth sync failed: {sync.stderr.strip() or sync.stdout.strip()}')

    state = read_state()
    ensure_tmux_base()

    state, cleared = try_clear_transient_blocker(state)
    if cleared:
        write_state(state)

    if BLOCK_MARKER.exists() or state.get('hard_blocker'):
        state['status'] = 'blocked'
        state['cycle_status'] = 'blocked'
        write_state(state)
        log('blocked marker present; no restart performed')
        return 0

    if is_completed():
        state['status'] = 'completed'
        state['project_status'] = 'project_completed'
        state['cycle_status'] = 'completed'
        state['next_cycle_required'] = False
        state['completed_at'] = utc_now()
        write_state(state)
        checkpoint = subprocess.run(['python3', str(GIT_CHECKPOINT_SCRIPT)], capture_output=True, text=True)
        if checkpoint.returncode != 0:
            log(f'git checkpoint watchdog failed: {checkpoint.stderr.strip() or checkpoint.stdout.strip()}')
        log('completion marker detected; watchdog exiting without restart')
        return 0

    if runner_alive():
        progress_age = last_progress_age_minutes(state)
        if progress_age is not None and progress_age > STALL_TIMEOUT_MINUTES:
            log(f'runner appears stalled (progress age {progress_age:.1f}m); recycling runner')
            run(['tmux', 'kill-window', '-t', f'{SESSION}:{RUNNER_WINDOW}'])
            state['cycle_status'] = 'stalled'
            state['status'] = 'stalled'
            state = launch_runner(state, 'stalled-progress')
            write_state(state)
            return 0
        state['status'] = 'running'
        state['cycle_status'] = 'running'
        state['last_seen_running_at'] = utc_now()
        write_state(state)
        checkpoint = subprocess.run(['python3', str(GIT_CHECKPOINT_SCRIPT)], capture_output=True, text=True)
        if checkpoint.returncode != 0:
            log(f'git checkpoint watchdog failed: {checkpoint.stderr.strip() or checkpoint.stdout.strip()}')
        log('runner already active; no action needed')
        return 0

    if state.get('next_cycle_required') is True and (state.get('status') == 'cycle_completed' or CYCLE_MARKER.exists()):
        archive_cycle_artifacts(state)
        state['status'] = 'idle'
        state['cycle_status'] = 'idle'
        state['current_phase'] = 'next_cycle_pending'
        state = launch_runner(state, 'next-cycle-required')
        write_state(state)
        checkpoint = subprocess.run(['python3', str(GIT_CHECKPOINT_SCRIPT)], capture_output=True, text=True)
        if checkpoint.returncode != 0:
            log(f'git checkpoint watchdog failed: {checkpoint.stderr.strip() or checkpoint.stdout.strip()}')
        return 0

    state = launch_runner(state, 'runner-not-active')
    write_state(state)
    checkpoint = subprocess.run(['python3', str(GIT_CHECKPOINT_SCRIPT)], capture_output=True, text=True)
    if checkpoint.returncode != 0:
        log(f'git checkpoint watchdog failed: {checkpoint.stderr.strip() or checkpoint.stdout.strip()}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
