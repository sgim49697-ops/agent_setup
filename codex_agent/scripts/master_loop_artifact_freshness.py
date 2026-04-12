#!/usr/bin/env python3
"""Detect stale artifact generation when the loop keeps revisiting the same harness."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from master_loop_state import load_state, resolve_harness_token

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
REPORT_PATH = ROOT / '.omx/state/master-loop-artifact-freshness.json'


def latest_artifact_mtime(harness: str) -> float | None:
    resolved_harness = resolve_harness_token(harness)
    candidates: list[Path] = []
    patterns = [
        f'{resolved_harness}/reports/*.json',
        f'{resolved_harness}/reports/*.md',
        f'{resolved_harness}/runs/*.json',
        f'{resolved_harness}/runs/*.md',
        f'{resolved_harness}/runs/*.png',
        f'benchmark/manual_ui_review/**/*{resolved_harness}*.png',
        f'benchmark/manual_ui_review/**/*{resolved_harness}*.json',
        f'benchmark/manual_ui_review/**/*{resolved_harness}*.md',
    ]
    for pattern in patterns:
        candidates.extend(ROOT.glob(pattern))
    mtimes = [path.stat().st_mtime for path in candidates if path.exists()]
    return max(mtimes) if mtimes else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', default=str(ROOT / '.omx/state/master-ux-loop.json'))
    parser.add_argument('--harness', required=True)
    parser.add_argument('--output', default=str(REPORT_PATH))
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()

    state = load_state(Path(args.state))
    history = state.get('remaining_cycle_history', []) or []
    active_cycles = [entry for entry in history if entry.get('harness') == args.harness]
    same_harness_streak = 0
    for entry in reversed(active_cycles):
        if entry.get('harness') == args.harness:
            same_harness_streak += 1
        else:
            break

    latest = latest_artifact_mtime(args.harness)
    resolved_harness = resolve_harness_token(args.harness, state)
    latest_iso = datetime.fromtimestamp(latest, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ') if latest else None
    worker_start = state.get('last_worker_start_at')
    stale = False
    errors = []
    warnings = []
    if latest is None:
        warnings.append('No recent artifacts found for the active harness yet.')
    if latest and worker_start:
        try:
            start_ts = datetime.fromisoformat(str(worker_start).replace('Z', '+00:00')).timestamp()
            if same_harness_streak >= 3 and latest < start_ts:
                stale = True
                errors.append('Artifact freshness gate failed: active harness has not produced newer artifacts across repeated cycles.')
        except ValueError:
            pass

    report = {
        'ok': not errors,
        'harness': args.harness,
        'resolved_harness': resolved_harness,
        'same_harness_streak': same_harness_streak,
        'latest_artifact_mtime': latest_iso,
        'errors': errors,
        'warnings': warnings,
    }
    Path(args.output).write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    if not args.quiet:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
