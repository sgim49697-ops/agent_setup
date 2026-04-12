#!/usr/bin/env python3
"""Mark an active harness complete by removing it from remaining_harnesses and writing a marker."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from master_loop_state import load_state, normalize_remaining_harnesses, save_state

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
STATE_PATH = ROOT / '.omx/state/master-ux-loop.json'
MARKER_DIR = ROOT / '.omx/logs/harness-complete'


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


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

    remaining = [item for item in remaining if item != harness]
    completed = normalize_remaining_harnesses(state.get('completed_harnesses'))
    if harness not in completed:
        completed.append(harness)
    state['remaining_harnesses'] = remaining
    state['completed_harnesses'] = completed
    state['current_harness'] = remaining[0] if remaining else 'quality_gate'
    state['current_phase'] = 'quality-gate' if not remaining else 'cycle-validation'
    summary = str(state.get('last_progress_summary') or '')
    state['last_progress_summary'] = (summary + ' | ' if summary else '') + f'{harness} removed from remaining_harnesses after harness gate pass'
    save_state(state_path, state, previous=load_state(state_path))

    MARKER_DIR.mkdir(parents=True, exist_ok=True)
    marker = {
        'harness': harness,
        'cycle': state.get('cycle'),
        'completed_at': utc_now(),
        'remaining_harnesses_after': remaining,
        'summary': state.get('last_progress_summary'),
    }
    marker_path = MARKER_DIR / f"cycle-{state.get('cycle')}-{harness}.json"
    marker_path.write_text(json.dumps(marker, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(marker, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
