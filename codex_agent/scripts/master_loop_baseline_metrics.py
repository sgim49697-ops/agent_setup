#!/usr/bin/env python3
"""Baseline behavior metrics for the UX master-loop automation."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from master_loop_state import load_state
from master_loop_trace_sanity import analyze_trace, read_progress_events
from master_loop_validator import build_report as build_validator_report

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
STATE_PATH = ROOT / '.omx/state/master-ux-loop.json'
LOG_PATH = ROOT / '.omx/logs/master-ux-benchmark-v2.log'
REPORT_PATH = ROOT / '.omx/state/master-loop-baseline-metrics.json'


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', default=str(STATE_PATH))
    parser.add_argument('--log', default=str(LOG_PATH))
    parser.add_argument('--output', default=str(REPORT_PATH))
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()

    state = load_state(Path(args.state))
    validator = build_validator_report(state)
    trace = analyze_trace(read_progress_events(Path(args.log), state), state)

    required = max(validator['required_count'], 1)
    completion_events = 1 if state.get('cycle_status') == 'completed' or state.get('project_status') == 'project_completed' else 0
    false_completion_events = 1 if validator.get('false_completion_detected') else 0

    metrics = {
        'state_omission_rate': round(validator['missing_required_count'] / required, 4),
        'churn_rate': trace['churn_rate'],
        'false_completion_rate': round(false_completion_events / max(completion_events, 1), 4),
        'max_same_phase_streak': trace['max_same_phase_streak'],
        'phase_event_count': trace['phase_event_count'],
        'review_replan_only_detected': trace['tail_replan_only'],
        'missing_required_fields': validator['missing_required_fields'],
        'validator_error_count': len(validator['errors']),
        'validator_warning_count': len(validator['warnings']),
        'trace_error_count': len(trace['errors']),
        'trace_warning_count': len(trace['warnings']),
        'state_snapshot': {
            'cycle': state.get('cycle'),
            'current_phase': state.get('current_phase'),
            'current_harness': state.get('current_harness'),
            'remaining_harnesses': state.get('remaining_harnesses'),
        },
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(metrics, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    if not args.quiet:
        print(json.dumps(metrics, indent=2, ensure_ascii=False))

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
