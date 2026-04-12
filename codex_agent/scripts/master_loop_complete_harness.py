#!/usr/bin/env python3
"""Mark an active harness complete, persist evidence, and enqueue impacted harnesses when shared files changed."""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from master_loop_state import HARNESSES, load_state, normalize_remaining_harnesses, save_state

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
STATE_PATH = ROOT / '.omx/state/master-ux-loop.json'
MARKER_DIR = ROOT / '.omx/logs/harness-complete'
REPO_ROOT = ROOT.parent
SHARED_ROOTS = {'benchmark', 'scripts', 'docs', '.omx/config'}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {}


def changed_workspace_files() -> list[str]:
    proc = subprocess.run(
        ['git', 'status', '--porcelain', '--', 'codex_agent'],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    files = []
    for raw in proc.stdout.splitlines():
        if not raw.strip():
            continue
        path = raw[3:].strip()
        if path.startswith('codex_agent/'):
            path = path[len('codex_agent/'):]
        files.append(path)
    return files


def impacted_harnesses(current_harness: str, changed_files: list[str], completed: list[str]) -> list[str]:
    impacts: set[str] = set()
    completed_set = set(completed)
    for path in changed_files:
        if path.startswith(f'{current_harness}/'):
            continue
        first = path.split('/', 1)[0]
        if first in HARNESSES:
            impacts.add(first)
            continue
        if first in SHARED_ROOTS or path == 'AGENTS.md':
            impacts.update(h for h in completed_set if h != current_harness)
    return [h for h in HARNESSES if h in impacts]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--harness', required=True)
    parser.add_argument('--state', default=str(STATE_PATH))
    args = parser.parse_args()

    state_path = Path(args.state)
    state = load_state(state_path)
    remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
    harness = args.harness
    if harness not in remaining:
        return 0

    quality = read_json(ROOT / '.omx/state/master-loop-quality-gate.json')
    validator = read_json(ROOT / '.omx/state/master-loop-validator.json')
    trace = read_json(ROOT / '.omx/state/master-loop-trace-sanity.json')
    baseline = read_json(ROOT / '.omx/state/master-loop-baseline-metrics.json')

    changed_files = changed_workspace_files()
    completed = normalize_remaining_harnesses(state.get('completed_harnesses'))
    requeue = impacted_harnesses(harness, changed_files, completed)

    remaining = [item for item in remaining if item != harness]
    if harness not in completed:
        completed.append(harness)
    state['remaining_harnesses'] = remaining
    state['completed_harnesses'] = completed

    if requeue:
        for item in requeue:
            if item not in state['remaining_harnesses']:
                state['remaining_harnesses'].append(item)
            if item in state['completed_harnesses']:
                state['completed_harnesses'].remove(item)

    next_remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
    state['current_harness'] = next_remaining[0] if next_remaining else 'quality_gate'
    state['current_phase'] = 'quality-gate' if not next_remaining else 'cycle-validation'
    summary = str(state.get('last_progress_summary') or '')
    suffix = f'{harness} removed from remaining_harnesses after harness gate pass'
    if requeue:
        suffix += f'; requeued impacted harnesses: {requeue}'
    state['last_progress_summary'] = (summary + ' | ' if summary else '') + suffix
    save_state(state_path, state, previous=load_state(state_path))

    MARKER_DIR.mkdir(parents=True, exist_ok=True)
    marker = {
        'harness': harness,
        'cycle': state.get('cycle'),
        'completed_at': utc_now(),
        'remaining_harnesses_after': next_remaining,
        'requeued_harnesses': requeue,
        'changed_files': changed_files,
        'gate_signature': {
            'quality_gate': {
                'ok': quality.get('ok'),
                'errors': quality.get('errors', []),
                'warnings': quality.get('warnings', []),
                'active_harness': quality.get('active_harness'),
            },
            'validator': {'ok': validator.get('ok'), 'errors': validator.get('errors', []), 'warnings': validator.get('warnings', [])},
            'trace': {'ok': trace.get('ok'), 'errors': trace.get('errors', []), 'warnings': trace.get('warnings', [])},
            'baseline': baseline,
        },
        'summary': state.get('last_progress_summary'),
    }
    marker_path = MARKER_DIR / f"cycle-{state.get('cycle')}-{harness}.json"
    marker_path.write_text(json.dumps(marker, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(marker, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
