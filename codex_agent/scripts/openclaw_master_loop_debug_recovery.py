#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
STATE = ROOT / '.omx/state/master-ux-loop.json'
LOG = ROOT / '.omx/logs/master-ux-benchmark-v2.log'
RESET = ROOT / 'scripts/openclaw_master_loop_reset.sh'
WATCHDOG = ROOT / 'scripts/openclaw_master_loop_watchdog.py'
FINAL = ROOT / '.omx/logs/master-ux-benchmark-v2-project-final.md'
LEGACY_FINAL = ROOT / '.omx/logs/master-ux-benchmark-v2-final.md'


def now():
    return datetime.now(timezone.utc)


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
    if not STATE.exists():
        log('state file missing; running watchdog')
        run(['python3', str(WATCHDOG)])
        return 0

    state = json.loads(STATE.read_text(encoding='utf-8'))
    status = str(state.get('status', 'idle'))
    project_status = str(state.get('project_status', 'in_progress'))
    hard_blocker = str(state.get('hard_blocker', 'false')).lower() == 'true'
    last_progress = parse_iso(state.get('last_progress_at')) or parse_iso(state.get('updated_at'))
    stale_minutes = None
    if last_progress is not None:
        stale_minutes = (now() - last_progress).total_seconds() / 60.0

    if FINAL.exists() or LEGACY_FINAL.exists() or project_status == 'project_completed':
        log('project completion marker exists; no debug recovery action')
        return 0

    if hard_blocker and stale_minutes is not None and stale_minutes > 25:
        log(f'hard blocker stale for {stale_minutes:.1f}m; running watchdog for self-heal attempt')
        run(['python3', str(WATCHDOG)])
        return 0

    if not runner_alive() and project_status == 'in_progress':
        log('runner not alive while project still in progress; invoking reset script')
        run([str(RESET)])
        return 0

    if stale_minutes is not None and stale_minutes > 30 and project_status == 'in_progress':
        log(f'progress stale for {stale_minutes:.1f}m while project in progress; invoking reset script')
        run([str(RESET)])
        return 0

    log('no recovery action needed')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
