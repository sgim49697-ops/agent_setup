#!/usr/bin/env python3
"""Heuristic behavior-quality checks for the UX master-loop trace."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from master_loop_state import HARNESSES, load_state, normalize_remaining_harnesses

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
STATE_PATH = ROOT / '.omx/state/master-ux-loop.json'
LOG_PATH = ROOT / '.omx/logs/master-ux-benchmark-v2.log'
REPORT_PATH = ROOT / '.omx/state/master-loop-trace-sanity.json'

ACTION_HINTS = (
    'fix', 'patch', 'edit', 'apply', 'build', 'test', 'journey', 'smoke', 'render',
    'preview', 'verify', 'release', 'export', 'lint', 'refactor', 'implemented', 'browser review', 'repair', 'restart', 'resume', 'resumed', 'start', 'starting',
    '수정', '적용', '검증', '빌드', '테스트', '반영', '패치', '브라우저 리뷰', '실행', '통과', '복구', '재시작', '재개', '시작',
)
REPLAN_HINTS = ('replan', 'plan', 'review', 'verdict', 'heuristic', 'ux review', '재계획', '리뷰', '평가')
PROGRESS_RE = re.compile(r'^\[(?P<ts>[^\]]+)\]\s+(?P<body>.+)$')
EXCLUDED_PREFIXES = ('watchdog:', 'git-watchdog:', 'debug-healer:', 'Detached tmux worker')
GENERIC_PHASES = {'benchmark-cycle', 'harness-verify', 'quality_gate', 'cycle-validation', 'benchmark_foundation'}


def infer_harness(text: str, fallback: str = '') -> str:
    lower = text.lower()
    for harness in HARNESSES:
        if harness.lower() in lower:
            return harness
    return fallback


def derive_effective_phase(phase: str, current_harness: str, summary: str) -> str:
    summary_l = (summary or '').lower()
    harness = current_harness or infer_harness(summary, '')
    if not harness and phase and phase not in GENERIC_PHASES:
        harness = phase
    if harness:
        if any(token in summary_l for token in ('browser review', 'preview-backed', 'desktop/mobile', '브라우저 리뷰', 'browser-review')):
            return f'{harness}-browser-review'
        if any(token in summary_l for token in ('quality gate', 'cycle closure', 'validator', 'trace', 'baseline', 'quality-gate', '품질 게이트', 'cycle-level validation', 'closure')):
            return 'quality-gate'
        if any(token in summary_l for token in ('resumed the new bounded cycle', 'starting new bounded cycle', 'resuming bounded cycle', 'reconciliation', 'reconciled state', '재개', '새 bounded cycle', '새 cycle')):
            return 'cycle-resume'
        if any(token in summary_l for token in ('patch', 'edit', 'korean-first', 'surface copy', '패치', '수정', '카피', 'copy')):
            return f'{harness}-edit'
        if any(token in summary_l for token in ('verify', 'verification', 'lint', 'build', 'evaluate', 'smoke', 'journey', '검증', '빌드', '테스트', '평가', '통과')):
            return f'{harness}-verify'
        if phase in GENERIC_PHASES and harness:
            return f'{harness}-work'
    return phase or harness or 'unknown'


def read_progress_events(path: Path, state: dict[str, Any], max_events: int = 80) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    if path.exists():
        with path.open('r', encoding='utf-8', errors='ignore') as fh:
            for raw in fh:
                line = raw.rstrip('\n')
                match = PROGRESS_RE.match(line)
                if not match:
                    continue
                body = match.group('body').strip()
                if body.startswith(EXCLUDED_PREFIXES):
                    continue
                harness = infer_harness(body)
                if not harness and 'quality gate' not in body.lower() and 'cycle' not in body.lower():
                    continue
                phase = derive_effective_phase(state.get('current_phase', ''), harness, body)
                events.append({
                    'phase': state.get('current_phase', ''),
                    'effective_phase': phase,
                    'current_harness': harness,
                    'summary': body,
                    'remaining_harnesses': [],
                })
    events = events[-max_events:]
    state_harness = str(state.get('current_harness') or '').strip()
    state_phase = str(state.get('current_phase') or '').strip()
    state_summary = str(state.get('last_progress_summary') or '').strip()
    if state_phase or state_summary:
        events.append({
            'phase': state_phase,
            'effective_phase': derive_effective_phase(state_phase, state_harness, state_summary),
            'current_harness': state_harness,
            'summary': state_summary,
            'remaining_harnesses': normalize_remaining_harnesses(state.get('remaining_harnesses')),
        })
    return events


def analyze_trace(events: list[dict[str, Any]], state: dict[str, Any]) -> dict[str, Any]:
    completed_project = state.get('project_status') == 'project_completed' and not normalize_remaining_harnesses(state.get('remaining_harnesses'))
    if completed_project:
        phase = derive_effective_phase(
            str(state.get('current_phase') or ''),
            str(state.get('current_harness') or ''),
            str(state.get('last_progress_summary') or ''),
        )
        return {
            'ok': True,
            'phase_event_count': 1 if phase else 0,
            'analysis_window_size': 1 if phase else 0,
            'unique_phase_count': 1 if phase else 0,
            'consecutive_repeat_events': 0,
            'max_same_phase_streak': 1 if phase else 0,
            'churn_rate': 0.0,
            'tail_replan_only': False,
            'recent_remaining_lengths': [0],
            'recent_phases': [phase] if phase else [],
            'recent_raw_phases': [str(state.get('current_phase') or '')] if phase else [],
            'recent_summaries': [str(state.get('last_progress_summary') or '')] if state.get('last_progress_summary') else [],
            'errors': [],
            'warnings': [],
        }

    errors: list[str] = []
    warnings: list[str] = []

    recent_window = events[-16:] if len(events) > 16 else events
    phases = [event['effective_phase'] for event in recent_window if event['effective_phase']]
    raw_phases = [event['phase'] for event in recent_window if event['phase']]
    summaries = [event['summary'] for event in recent_window if event['summary']]
    remaining_lengths = [len(event['remaining_harnesses']) for event in recent_window if event['remaining_harnesses'] is not None]

    repeat_count = 0
    max_same_phase_streak = 1 if phases else 0
    current_streak = 1
    for prev, current in zip(phases, phases[1:]):
        if current == prev:
            repeat_count += 1
            current_streak += 1
            max_same_phase_streak = max(max_same_phase_streak, current_streak)
        else:
            current_streak = 1

    phase_event_count = len(phases)
    churn_rate = round(repeat_count / max(phase_event_count - 1, 1), 4) if phase_event_count > 1 else 0.0

    tail_events = recent_window[-6:]
    tail_text = ' '.join(filter(None, [event['effective_phase'] + ' ' + event['summary'] for event in tail_events])).lower()
    tail_replan_only = bool(tail_events) and any(hint in tail_text for hint in REPLAN_HINTS) and not any(hint in tail_text for hint in ACTION_HINTS)

    current_harness_missing_events = sum(1 for event in tail_events if not event['current_harness'] and event['effective_phase'] not in {'quality-gate', 'cycle-resume'})
    if current_harness_missing_events > 1 and any(event['summary'] for event in tail_events):
        warnings.append(f'최근 tail 이벤트 {current_harness_missing_events}개에서 current_harness가 비어 있었습니다')

    if max_same_phase_streak >= 8:
        errors.append(f'같은 phase가 {max_same_phase_streak}회 연속 반복되어 churn 위험이 큽니다')
    elif max_same_phase_streak >= 5:
        warnings.append(f'같은 phase가 {max_same_phase_streak}회 연속 반복되었습니다')

    if tail_replan_only:
        errors.append('최근 tail 이벤트가 replan/review 중심으로만 보이고 실제 수정/검증 동작 신호가 없습니다')

    if len(remaining_lengths) >= 5:
        recent_remaining = remaining_lengths[-5:]
        summary_tail = ' '.join(summaries[-5:]).lower()
        if all(length == recent_remaining[0] for length in recent_remaining):
            if recent_remaining[0] > 1:
                warnings.append('최근 5개 이벤트 동안 remaining_harnesses 길이가 줄지 않았습니다')
            elif recent_remaining[0] == 1 and not any(h in summary_tail for h in ACTION_HINTS):
                warnings.append('최근 5개 이벤트 동안 remaining_harnesses 길이가 줄지 않았습니다')

    review_like = sum(1 for text in summaries[-8:] if any(h in text.lower() for h in ('review', 'replan', 'verdict', '리뷰', '재계획', '평가')))
    action_like = sum(1 for text in summaries[-8:] if any(h in text.lower() for h in ACTION_HINTS))
    if review_like >= 4 and action_like == 0:
        errors.append('최근 진행 요약이 review/replan 위주이며 실제 적용/수정 시그널이 없습니다')

    report = {
        'ok': not errors,
        'phase_event_count': phase_event_count,
        'analysis_window_size': len(recent_window),
        'unique_phase_count': len(set(phases)),
        'consecutive_repeat_events': repeat_count,
        'max_same_phase_streak': max_same_phase_streak,
        'churn_rate': churn_rate,
        'tail_replan_only': tail_replan_only,
        'recent_remaining_lengths': remaining_lengths[-8:],
        'recent_phases': phases[-8:],
        'recent_raw_phases': raw_phases[-8:],
        'recent_summaries': summaries[-8:],
        'errors': errors,
        'warnings': warnings,
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', default=str(STATE_PATH))
    parser.add_argument('--log', default=str(LOG_PATH))
    parser.add_argument('--output', default=str(REPORT_PATH))
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()

    state = load_state(Path(args.state))
    events = read_progress_events(Path(args.log), state)
    report = analyze_trace(events, state)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    if not args.quiet:
        print(json.dumps(report, indent=2, ensure_ascii=False))

    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
