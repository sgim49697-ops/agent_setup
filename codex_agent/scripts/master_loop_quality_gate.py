#!/usr/bin/env python3
"""Outcome-focused quality gate for bounded automation cycles."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from master_loop_artifact_freshness import latest_artifact_mtime
from master_loop_state import HARNESSES, QUALITY_GATE_ALIAS, automation_harnesses, load_state, normalize_remaining_harnesses, resolve_harness_token, save_state
from master_loop_trace_sanity import analyze_trace, read_progress_events
from master_loop_ui_language_gate import scan_harness
from master_loop_validator import build_report as build_validator_report
from master_loop_baseline_metrics import main as _unused  # noqa: F401

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
REPORT_PATH = ROOT / '.omx/state/master-loop-quality-gate.json'
BASELINE_PATH = ROOT / '.omx/state/master-loop-baseline-metrics.json'


def recent_cycle_snapshots(state: dict) -> list[dict]:
    history = state.get('remaining_cycle_history', []) or []
    snaps: list[dict] = []
    seen_cycles = set()
    for entry in reversed(history):
        cycle = entry.get('cycle')
        if cycle in seen_cycles:
            continue
        seen_cycles.add(cycle)
        snaps.append(entry)
        if len(snaps) >= 6:
            break
    return list(reversed(snaps))


def active_harness(state: dict, arg: str | None) -> str:
    active_harnesses = automation_harnesses()
    if arg:
        return resolve_harness_token(arg, state)
    if state.get('project_status') == 'project_completed' and not normalize_remaining_harnesses(state.get('remaining_harnesses')):
        return QUALITY_GATE_ALIAS
    current = str(state.get('current_harness') or '').strip()
    if current == QUALITY_GATE_ALIAS and not normalize_remaining_harnesses(state.get('remaining_harnesses')):
        return active_harnesses[0]
    if current:
        resolved_current = resolve_harness_token(current, state)
        if resolved_current in set(active_harnesses):
            return resolved_current
    if current and current in set(active_harnesses):
        return current
    remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
    if remaining:
        return remaining[0]
    return active_harnesses[0]




def full_project_rescan(state: dict) -> tuple[list[str], dict]:
    failing: list[str] = []
    scan_results: dict[str, dict] = {}
    for harness in automation_harnesses():
        result = scan_harness(harness)
        scan_results[harness] = {
            'ok': result.get('ok', False),
            'korean_ratio': result.get('korean_ratio'),
            'errors': result.get('errors', []),
            'warnings': result.get('warnings', []),
        }
        if not result.get('ok', False):
            failing.append(harness)
    return failing, scan_results


def apply_regressed_harnesses(state: dict, failing: list[str]) -> dict:
    remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
    completed = normalize_remaining_harnesses(state.get('completed_harnesses'))
    for harness in failing:
        if harness not in remaining:
            remaining.append(harness)
        if harness in completed:
            completed.remove(harness)
    state['remaining_harnesses'] = remaining
    state['completed_harnesses'] = completed
    if failing:
        state['current_harness'] = failing[0]
        state['current_phase'] = f'{failing[0]}-edit'
        state['last_progress_summary'] = f'quality-gate detected regression in {failing[0]}; re-queueing it for repair.'
    return state

def compute_outcome_checks(state: dict, harness: str, validator: dict, trace: dict) -> tuple[list[str], list[str], dict]:
    errors: list[str] = []
    warnings: list[str] = []
    details: dict = {}

    snaps = recent_cycle_snapshots(state)
    details['recent_cycle_snapshots'] = snaps
    if len(snaps) >= 4:
        recent_lists = [tuple(entry.get('remaining_harnesses', [])) for entry in snaps[-4:]]
        if len(set(recent_lists)) == 1:
            errors.append('Recent 4 cycles kept the same remaining_harnesses set; bounded loop is stalled.')
            details['stagnant_recent_cycle_count'] = 4

    harness_streak = int(state.get('current_harness_cycle_streak', 0))
    details['current_harness_cycle_streak'] = harness_streak
    if harness_streak >= 8:
        errors.append(f'Harness cycle budget exceeded for {harness}: streak={harness_streak} (budget=8).')
    recent_counts = [int(entry.get('remaining_count', 0)) for entry in snaps]
    rollback_detected = any(curr > prev for prev, curr in zip(recent_counts, recent_counts[1:]))
    if rollback_detected and recent_counts and recent_counts[-1] >= max(recent_counts):
        errors.append('remaining_harnesses regressed after previously shrinking; rollback detected.')
        details['remaining_regression_count'] = int(state.get('remaining_regression_count', 0))

    phases = trace.get('recent_phases', [])[-4:]
    if len(phases) >= 3 and all(phase.endswith('-browser-review') for phase in phases):
        errors.append('Review-only cycle detected: recent phases are browser-review only.')
        details['review_only_recent_phases'] = phases

    if trace.get('tail_replan_only'):
        errors.append('Trace shows replan-only / review-only behavior without real edit or verify work.')

    latest_artifact = latest_artifact_mtime(harness)
    details['latest_artifact_mtime'] = latest_artifact
    if int(state.get('stagnant_cycle_count', 0)) >= 3 and latest_artifact is None:
        errors.append('Artifact freshness gate failed: stalled harness has produced no newer artifacts across 3+ cycles.')
    if len(snaps) >= 3 and latest_artifact is not None:
        oldest = snaps[-3].get('updated_at')
        try:
            oldest_ts = datetime.fromisoformat(str(oldest).replace('Z', '+00:00')).timestamp()
        except Exception:
            oldest_ts = None
        if oldest_ts is not None and latest_artifact < oldest_ts:
            errors.append('Artifact freshness gate failed: recent cycles did not produce newer harness artifacts.')
            details['artifact_stale_since'] = oldest

    if state.get('project_status') == 'project_completed' and normalize_remaining_harnesses(state.get('remaining_harnesses')):
        errors.append('Project marked complete while remaining_harnesses is still non-empty.')

    if state.get('quality_gate_status') == '0' and harness in normalize_remaining_harnesses(state.get('remaining_harnesses')) and trace.get('ok') and validator.get('ok'):
        warnings.append('Harness gate passed but active harness still remains in remaining_harnesses. Use master_loop_complete_harness.py in the same cycle.')

    if not normalize_remaining_harnesses(state.get('remaining_harnesses')):
        failing, scan_results = full_project_rescan(state)
        details['full_project_rescan'] = scan_results
        if failing:
            for offender in failing:
                offender_errors = scan_results[offender].get('errors', [])
                joined = ' | '.join(offender_errors) if offender_errors else 'unknown regression'
                errors.append(f'{offender} regressed: {joined}')
            details['regressed_harnesses'] = failing

    return errors, warnings, details


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', default=str(ROOT / '.omx/state/master-ux-loop.json'))
    parser.add_argument('--active-harness')
    parser.add_argument('--output', default=str(REPORT_PATH))
    parser.add_argument('--enforce', action='store_true')
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()

    state_path = Path(args.state)
    state = load_state(state_path)
    harness = active_harness(state, args.active_harness)
    validator = build_validator_report(state)
    trace = analyze_trace(read_progress_events(ROOT / '.omx/logs/master-ux-benchmark-v2.log', state), state)
    ui_gate = scan_harness(harness) if harness in HARNESSES else {'ok': True, 'errors': [], 'warnings': []}
    outcome_errors, outcome_warnings, details = compute_outcome_checks(state, harness, validator, trace)

    errors = list(validator.get('errors', [])) + list(trace.get('errors', [])) + list(ui_gate.get('errors', [])) + outcome_errors
    warnings = list(validator.get('warnings', [])) + list(trace.get('warnings', [])) + list(ui_gate.get('warnings', [])) + outcome_warnings

    regressed = details.get('regressed_harnesses', [])
    if regressed:
        state = apply_regressed_harnesses(state, regressed)
        harness = active_harness(state, regressed[0])

    report = {
        'ok': not errors,
        'active_harness': harness,
        'errors': errors,
        'warnings': warnings,
        'validator': {'ok': validator.get('ok'), 'errors': validator.get('errors', []), 'warnings': validator.get('warnings', [])},
        'trace': {'ok': trace.get('ok'), 'errors': trace.get('errors', []), 'warnings': trace.get('warnings', []), 'recent_phases': trace.get('recent_phases', [])},
        'ui_language': {'ok': ui_gate.get('ok', True), 'korean_ratio': ui_gate.get('korean_ratio'), 'errors': ui_gate.get('errors', []), 'warnings': ui_gate.get('warnings', [])},
        'details': details,
    }

    signature = ' | '.join(errors)
    previous_signature = str(state.get('last_quality_gate_signature') or '')
    previous_streak = int(state.get('quality_gate_failure_streak', 0))
    if errors:
        state['quality_gate_error_count'] = len(errors)
        state['quality_gate_failure_streak'] = previous_streak + 1 if signature == previous_signature else 1
        state['last_quality_gate_signature'] = signature
    else:
        state['quality_gate_error_count'] = 0
        state['quality_gate_failure_streak'] = 0
        state['last_quality_gate_signature'] = ''
    if any('Review-only cycle detected' in error for error in errors):
        state['review_only_failures'] = int(state.get('review_only_failures', 0)) + 1
    save_state(state_path, state, previous=load_state(state_path))

    Path(args.output).write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    if not args.quiet:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
