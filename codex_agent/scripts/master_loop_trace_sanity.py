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

PHASE_RE = re.compile(r"current_phase\s+([^\s\"]+)")
HARNESS_RE = re.compile(r"current_harness\s+([^\s\"]+)")
SUMMARY_RE = re.compile(r'last_progress_summary\s+"([^"]*)"')
REMAINING_RE = re.compile(r'remaining_harnesses\s+"([^"]*)"')

ACTION_HINTS = (
    'fix', 'patch', 'edit', 'apply', 'build', 'test', 'journey', 'smoke', 'render',
    'preview', 'verify', 'release', 'export', 'lint', 'refactor', 'implemented', '수정',
    '적용', '검증', '빌드', '테스트', '반영', '패치',
)
REPLAN_HINTS = ('replan', 'plan', 'review', 'verdict', 'heuristic', 'ux review', '재계획', '리뷰', '평가')


def read_tail(path: Path, max_bytes: int = 512_000) -> str:
    if not path.exists():
        return ''
    with path.open('rb') as fh:
        fh.seek(0, 2)
        size = fh.tell()
        fh.seek(max(size - max_bytes, 0))
        data = fh.read()
    return data.decode('utf-8', errors='ignore')


def parse_events(log_text: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for raw_line in log_text.splitlines():
        if 'master_loop_state.py' not in raw_line:
            continue
        phase_match = PHASE_RE.search(raw_line)
        summary_match = SUMMARY_RE.search(raw_line)
        harness_match = HARNESS_RE.search(raw_line)
        remaining_match = REMAINING_RE.search(raw_line)
        if not (phase_match or summary_match or harness_match or remaining_match):
            continue
        events.append({
            'phase': phase_match.group(1) if phase_match else '',
            'current_harness': harness_match.group(1) if harness_match else '',
            'summary': summary_match.group(1) if summary_match else '',
            'remaining_harnesses': normalize_remaining_harnesses(remaining_match.group(1) if remaining_match else []),
        })
    return events


def analyze_trace(events: list[dict[str, Any]], state: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []

    phases = [event['phase'] for event in events if event['phase']]
    summaries = [event['summary'] for event in events if event['summary']]
    harnesses = [event['current_harness'] for event in events if event['current_harness']]
    remaining_lengths = [len(event['remaining_harnesses']) for event in events if event['remaining_harnesses'] is not None]

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

    tail_events = events[-6:]
    tail_text = ' '.join(filter(None, [event['phase'] + ' ' + event['summary'] for event in tail_events])).lower()
    tail_replan_only = bool(tail_events) and any(hint in tail_text for hint in REPLAN_HINTS) and not any(hint in tail_text for hint in ACTION_HINTS)

    current_harness_missing_events = sum(1 for event in tail_events if not event['current_harness'])
    if current_harness_missing_events:
        warnings.append(f'최근 tail 이벤트 {current_harness_missing_events}개에서 current_harness가 비어 있었습니다')

    if max_same_phase_streak >= 8:
        errors.append(f'같은 phase가 {max_same_phase_streak}회 연속 반복되어 churn 위험이 큽니다')
    elif max_same_phase_streak >= 5:
        warnings.append(f'같은 phase가 {max_same_phase_streak}회 연속 반복되었습니다')

    if tail_replan_only:
        errors.append('최근 tail 이벤트가 replan/review 중심으로만 보이고 실제 수정/검증 동작 신호가 없습니다')

    if len(remaining_lengths) >= 5:
        recent_remaining = remaining_lengths[-5:]
        if all(length == recent_remaining[0] for length in recent_remaining):
            warnings.append('최근 5개 이벤트 동안 remaining_harnesses 길이가 줄지 않았습니다')

    current_harness = str(state.get('current_harness') or '').strip()
    if current_harness and current_harness not in set(HARNESSES) | {'benchmark_foundation', 'benchmark_cycle', 'ux_review', 'quality_gate', 'multi_harness'}:
        warnings.append(f'현재 current_harness={current_harness!r} 값이 비표준 토큰입니다')

    review_like = sum(1 for text in summaries[-8:] if any(h in text.lower() for h in ('review', 'replan', 'verdict', '리뷰', '재계획', '평가')))
    action_like = sum(1 for text in summaries[-8:] if any(h in text.lower() for h in ACTION_HINTS))
    if review_like >= 4 and action_like == 0:
        errors.append('최근 진행 요약이 review/replan 위주이며 실제 적용/수정 시그널이 없습니다')

    report = {
        'ok': not errors,
        'phase_event_count': phase_event_count,
        'unique_phase_count': len(set(phases)),
        'consecutive_repeat_events': repeat_count,
        'max_same_phase_streak': max_same_phase_streak,
        'churn_rate': churn_rate,
        'tail_replan_only': tail_replan_only,
        'recent_remaining_lengths': remaining_lengths[-8:],
        'recent_phases': phases[-8:],
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
    events = parse_events(read_tail(Path(args.log)))
    report = analyze_trace(events, state)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    if not args.quiet:
        print(json.dumps(report, indent=2, ensure_ascii=False))

    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
