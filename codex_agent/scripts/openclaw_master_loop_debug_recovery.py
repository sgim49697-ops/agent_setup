#!/usr/bin/env python3
from __future__ import annotations

import fcntl
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from master_loop_state import load_state
from master_loop_trace_sanity import analyze_trace, parse_events, read_tail
from master_loop_validator import build_report as build_validator_report

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
STATE = ROOT / '.omx/state/master-ux-loop.json'
LOG = ROOT / '.omx/logs/master-ux-benchmark-v2.log'
RESET = ROOT / 'scripts/openclaw_master_loop_reset.sh'
WATCHDOG = ROOT / 'scripts/openclaw_master_loop_watchdog.py'
FINAL = ROOT / '.omx/logs/master-ux-benchmark-v2-project-final.md'
LEGACY_FINAL = ROOT / '.omx/logs/master-ux-benchmark-v2-final.md'
LOCK_PATH = ROOT / '.omx/state/master-loop-watchdog.lock'


def now():
    return datetime.now(timezone.utc)


def acquire_lock():
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fh = LOCK_PATH.open('w', encoding='utf-8')
    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fh.close()
        return None
    return fh


def log(msg: str):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open('a', encoding='utf-8') as fh:
        fh.write(f'[{now().strftime("%Y-%m-%dT%H:%M:%SZ")}] debug-healer: {msg}\n')


def run(cmd: list[str]):
    return subprocess.run(cmd, capture_output=True, text=True)


def parse_iso(value):
    if not value:
        return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    return None


def runner_alive() -> bool:
    proc = run(['tmux', 'list-panes', '-t', 'ux-master-bg:runner', '-F', '#{pane_dead} #{pane_current_command}'])
    if proc.returncode != 0:
        return False
    for line in proc.stdout.splitlines():
        parts = line.split(' ', 1)
        if len(parts) == 2 and parts[0] == '0':
            return True
    return False


def main() -> int:
    lock_fh = acquire_lock()
    if lock_fh is None:
        log('watchdog/debug lock is already held; skip duplicate recovery pass')
        return 0

    if not STATE.exists():
        log('state file missing; running watchdog')
        run(['python3', str(WATCHDOG)])
        return 0

    state = load_state(STATE)
    validator = build_validator_report(state)
    trace = analyze_trace(parse_events(read_tail(LOG)), state)
    status = str(state.get('status', 'idle'))
    project_status = str(state.get('project_status', 'in_progress'))
    hard_blocker = bool(state.get('hard_blocker', False))
    last_progress = parse_iso(state.get('last_progress_at')) or parse_iso(state.get('updated_at'))
    stale_minutes = None
    if last_progress is not None:
        stale_minutes = (now() - last_progress).total_seconds() / 60.0

    if FINAL.exists() or LEGACY_FINAL.exists() or project_status == 'project_completed':
        log('project completion marker exists; no debug recovery action')
        return 0

    if validator.get('false_completion_detected'):
        log('validator detected false completion; invoking watchdog for recovery')
        run(['python3', str(WATCHDOG)])
        return 0

    if hard_blocker and stale_minutes is not None and stale_minutes > 25:
        log(f'hard blocker stale for {stale_minutes:.1f}m; running watchdog for self-heal attempt')
        run(['python3', str(WATCHDOG)])
        return 0

    if trace.get('errors') and stale_minutes is not None and stale_minutes > 15:
        log(f'trace sanity errors persisted for {stale_minutes:.1f}m; invoking reset script')
        run([str(RESET)])
        return 0

    if not runner_alive() and project_status == 'in_progress':
        log('runner not alive while project still in progress; invoking reset script')
        run([str(RESET)])
        return 0

    if stale_minutes is not None and stale_minutes > 30 and project_status == 'in_progress':
        log(f'progress stale for {stale_minutes:.1f}m while project in progress; invoking reset script')
        run([str(RESET)])
        return 0

    log(f'no recovery action needed (status={status}, validator_errors={len(validator.get("errors", []))}, trace_errors={len(trace.get("errors", []))})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
