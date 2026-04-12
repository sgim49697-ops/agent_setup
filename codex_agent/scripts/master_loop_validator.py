#!/usr/bin/env python3
"""Structural validator for the UX master-loop state and marker semantics."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from master_loop_state import HARNESSES, REQUIRED_STATE_FIELDS, load_state, normalize_remaining_harnesses, save_state

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
STATE_PATH = ROOT / '.omx/state/master-ux-loop.json'
CYCLE_MARKER = ROOT / '.omx/logs/master-ux-benchmark-v2-cycle-complete.md'
PROJECT_FINAL_MARKER = ROOT / '.omx/logs/master-ux-benchmark-v2-project-final.md'
LEGACY_FINAL_MARKER = ROOT / '.omx/logs/master-ux-benchmark-v2-final.md'
REPORT_PATH = ROOT / '.omx/state/master-loop-validator.json'

ALLOWED_STATUS = {'idle', 'running', 'blocked', 'stalled', 'cycle_completed', 'completed', 'failed'}
ALLOWED_PROJECT_STATUS = {'in_progress', 'project_completed'}
ALLOWED_CYCLE_STATUS = {'idle', 'running', 'completed', 'failed', 'blocked', 'stalled'}
ALLOWED_SPECIAL_HARNESSES = {'benchmark_foundation', 'benchmark_cycle', 'ux_review', 'quality_gate', 'multi_harness'}


def build_report(state: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    missing: list[str] = []

    for field in REQUIRED_STATE_FIELDS:
        if field not in state:
            missing.append(field)
            continue
        value = state[field]
        if field not in {'remaining_harnesses'} and value in (None, ''):
            missing.append(field)

    if missing:
        errors.append(f'required state fields missing or empty: {", ".join(sorted(missing))}')

    if state.get('status') not in ALLOWED_STATUS:
        errors.append(f"invalid status: {state.get('status')!r}")
    if state.get('project_status') not in ALLOWED_PROJECT_STATUS:
        errors.append(f"invalid project_status: {state.get('project_status')!r}")
    if state.get('cycle_status') not in ALLOWED_CYCLE_STATUS:
        errors.append(f"invalid cycle_status: {state.get('cycle_status')!r}")
    if not isinstance(state.get('cycle'), int):
        errors.append('cycle must be an integer')
    if not isinstance(state.get('hard_blocker'), bool):
        errors.append('hard_blocker must be a boolean')
    if not isinstance(state.get('next_cycle_required'), bool):
        errors.append('next_cycle_required must be a boolean')

    remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
    current_harness = str(state.get('current_harness') or '').strip()
    phase = str(state.get('current_phase') or '').strip()
    current_allowed = set(HARNESSES) | ALLOWED_SPECIAL_HARNESSES

    if not isinstance(state.get('remaining_harnesses'), list):
        warnings.append('remaining_harnesses was normalized from a non-list representation')
    if current_harness not in current_allowed:
        warnings.append(f'current_harness {current_harness!r} is not a known harness token')
    if phase == current_harness and current_harness in ALLOWED_SPECIAL_HARNESSES:
        warnings.append('current_phase and current_harness are both generic; prefer a concrete harness token during harness work')

    project_final_exists = PROJECT_FINAL_MARKER.exists() or LEGACY_FINAL_MARKER.exists()
    cycle_marker_exists = CYCLE_MARKER.exists()

    false_completion_detected = False
    if state.get('project_status') == 'project_completed':
        if remaining:
            errors.append('project_status=project_completed but remaining_harnesses is not empty')
            false_completion_detected = True
        if not project_final_exists:
            errors.append('project_status=project_completed but no project-final marker exists')
            false_completion_detected = True
        if state.get('next_cycle_required'):
            errors.append('project_status=project_completed but next_cycle_required=true')
            false_completion_detected = True

    if project_final_exists and state.get('project_status') != 'project_completed':
        errors.append('project-final marker exists but project_status is not project_completed')

    if cycle_marker_exists and state.get('cycle_status') == 'running':
        warnings.append('cycle marker exists while cycle_status=running; watchdog should archive or restart cleanly')

    if state.get('cycle_status') == 'completed' and state.get('project_status') != 'project_completed' and not cycle_marker_exists:
        warnings.append('cycle_status=completed without a cycle-complete marker; bounded cycle evidence may be missing')

    if state.get('project_status') == 'in_progress' and not current_harness:
        errors.append('project is still in progress but current_harness is empty')

    if state.get('project_status') == 'in_progress' and remaining and current_harness == 'benchmark_foundation' and phase not in {'benchmark_foundation', 'cycle-resume', 'next_cycle_pending'}:
        errors.append('current_harness reset to benchmark_foundation during active harness work')

    if state.get('project_status') == 'in_progress' and not remaining and state.get('next_cycle_required'):
        warnings.append('remaining_harnesses is empty while project is still in progress; verify if only final browser review remains')

    return {
        'ok': not errors,
        'required_count': len(REQUIRED_STATE_FIELDS),
        'missing_required_count': len(missing),
        'missing_required_fields': missing,
        'errors': errors,
        'warnings': warnings,
        'state': {
            'status': state.get('status'),
            'project_status': state.get('project_status'),
            'cycle_status': state.get('cycle_status'),
            'cycle': state.get('cycle'),
            'current_phase': phase,
            'current_harness': current_harness,
            'remaining_harnesses': remaining,
            'next_cycle_required': state.get('next_cycle_required'),
            'hard_blocker': state.get('hard_blocker'),
        },
        'markers': {
            'cycle_marker_exists': cycle_marker_exists,
            'project_final_marker_exists': project_final_exists,
        },
        'false_completion_detected': false_completion_detected,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', default=str(STATE_PATH))
    parser.add_argument('--rewrite', action='store_true', help='rewrite the state in normalized form before validating')
    parser.add_argument('--output', default=str(REPORT_PATH))
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()

    state_path = Path(args.state)
    state = load_state(state_path)
    if args.rewrite:
        save_state(state_path, state)
        state = load_state(state_path)

    report = build_report(state)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    if not args.quiet:
        print(json.dumps(report, indent=2, ensure_ascii=False))

    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
