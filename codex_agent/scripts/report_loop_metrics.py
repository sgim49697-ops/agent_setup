#!/usr/bin/env python3
"""Generate per-harness loop metrics and a composite score for the latest master-loop run."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from master_loop_state import DEFAULT_DEFERRED_HARNESSES, automation_harnesses

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
LOG_PATH = ROOT / '.omx/logs/master-ux-benchmark-v2.log'
OUT_JSON = ROOT / 'benchmark/reports/loop_metrics_report.json'
OUT_MD = ROOT / 'benchmark/reports/loop_metrics_report.md'

RESET_RE = re.compile(r'^\[(?P<ts>[^\]]+)\] master loop reset;')
START_RE = re.compile(r'^\[(?P<ts>[^\]]+)\] orchestrator: === cycle (?P<cycle>\d+) harness (?P<harness>[a-z_]+) artifact=')
DONE_RE = re.compile(r'^\[(?P<ts>[^\]]+)\] orchestrator: === cycle (?P<cycle>\d+) harness (?P<harness>[a-z_]+) done rc=(?P<rc>\d+) ===')
TOKENS_RE = re.compile(r'tokens used\s*\n([0-9,]+)')


@dataclass
class Attempt:
    cycle: int
    start_ts: float
    end_ts: float
    rc: int



def parse_ts(value: str) -> float:
    return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()



def latest_reset_ts(lines: list[str]) -> float:
    last = 0.0
    for line in lines:
        match = RESET_RE.match(line)
        if match:
            last = parse_ts(match.group('ts'))
    return last



def parse_attempts(lines: list[str], harnesses: list[str], reset_ts: float) -> dict[str, list[Attempt]]:
    starts: dict[tuple[str, int], float] = {}
    attempts: dict[str, list[Attempt]] = {harness: [] for harness in harnesses}
    for line in lines:
        start_match = START_RE.match(line)
        if start_match:
            ts = parse_ts(start_match.group('ts'))
            if ts >= reset_ts:
                harness = start_match.group('harness')
                cycle = int(start_match.group('cycle'))
                if harness in attempts:
                    starts[(harness, cycle)] = ts
            continue
        done_match = DONE_RE.match(line)
        if done_match:
            ts = parse_ts(done_match.group('ts'))
            if ts < reset_ts:
                continue
            harness = done_match.group('harness')
            cycle = int(done_match.group('cycle'))
            if harness in attempts and (harness, cycle) in starts:
                attempts[harness].append(Attempt(cycle=cycle, start_ts=starts[(harness, cycle)], end_ts=ts, rc=int(done_match.group('rc'))))
    return attempts



def cycles_until_success(attempts: list[Attempt]) -> list[Attempt]:
    selected: list[Attempt] = []
    for attempt in attempts:
        selected.append(attempt)
        if attempt.rc == 0:
            break
    return selected



def cycle_dir(harness: str, cycle: int) -> Path:
    return ROOT / '.omx/cycles' / f'cycle-{cycle:04d}-{harness}'



def cycle_token_usage(harness: str, cycle: int) -> int:
    total = 0
    directory = cycle_dir(harness, cycle)
    if not directory.exists():
        return 0
    for log_file in directory.glob('*.log'):
        try:
            text = log_file.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        total += sum(int(value.replace(',', '')) for value in TOKENS_RE.findall(text))
    return total



def load_quality_report(harness: str) -> dict[str, Any]:
    path = ROOT / harness / 'reports' / 'evaluation_report.json'
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding='utf-8'))



def build_rows() -> dict[str, Any]:
    lines = LOG_PATH.read_text(encoding='utf-8', errors='ignore').splitlines()
    reset_ts = latest_reset_ts(lines)
    harnesses = automation_harnesses()
    attempts_by_harness = parse_attempts(lines, harnesses, reset_ts)

    rows: list[dict[str, Any]] = []
    for harness in harnesses:
        selected = cycles_until_success(attempts_by_harness[harness])
        if not selected or selected[-1].rc != 0:
            continue
        first = selected[0]
        last = selected[-1]
        cycle_numbers = [attempt.cycle for attempt in selected]
        wall_clock = round(last.end_ts - first.start_ts, 2)
        active_runtime = round(sum(attempt.end_ts - attempt.start_ts for attempt in selected), 2)
        token_usage = sum(cycle_token_usage(harness, attempt.cycle) for attempt in selected)
        quality_report = load_quality_report(harness)
        quality_final = quality_report.get('final', {})
        quality_l3 = quality_report.get('l3_scorecard', {})
        rows.append(
            {
                'harness': harness,
                'cycles_to_pass': len(selected),
                'cycle_numbers': cycle_numbers,
                'wall_clock_to_pass_seconds': wall_clock,
                'active_attempt_seconds': active_runtime,
                'token_usage_total': token_usage,
                'quality_base_score_10': quality_final.get('final_score'),
                'quality_base_score_100': round(float(quality_final.get('final_score', 0)) * 10, 2) if quality_final.get('final_score') is not None else None,
                'quality_source': 'evaluation_report.final.final_score',
                'quality_evaluated_at': quality_report.get('evaluated_at'),
                'legacy_l3_overall_10': quality_l3.get('overall_score'),
            }
        )

    if not rows:
        raise SystemExit('no completed harness rows found for latest loop')

    best_wall = min(row['wall_clock_to_pass_seconds'] for row in rows if row['wall_clock_to_pass_seconds'] > 0)
    best_cycles = min(row['cycles_to_pass'] for row in rows if row['cycles_to_pass'] > 0)
    best_tokens = min(row['token_usage_total'] for row in rows if row['token_usage_total'] > 0)

    weights = {
        'quality_base_score_100': 0.55,
        'wall_clock_efficiency_100': 0.15,
        'cycle_efficiency_100': 0.15,
        'token_efficiency_100': 0.15,
    }

    for row in rows:
        row['wall_clock_efficiency_100'] = round(best_wall / row['wall_clock_to_pass_seconds'] * 100, 2)
        row['cycle_efficiency_100'] = round(best_cycles / row['cycles_to_pass'] * 100, 2)
        row['token_efficiency_100'] = round(best_tokens / row['token_usage_total'] * 100, 2)
        quality = row['quality_base_score_100'] or 0.0
        row['composite_score_100'] = round(
            quality * weights['quality_base_score_100']
            + row['wall_clock_efficiency_100'] * weights['wall_clock_efficiency_100']
            + row['cycle_efficiency_100'] * weights['cycle_efficiency_100']
            + row['token_efficiency_100'] * weights['token_efficiency_100'],
            2,
        )

    rows.sort(key=lambda item: item['composite_score_100'], reverse=True)
    return {
        'generated_at': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'latest_reset_timestamp': datetime.utcfromtimestamp(reset_ts).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'excluded_harnesses': DEFAULT_DEFERRED_HARNESSES,
        'score_note': 'Composite score = latest available quality score (existing evaluation_report) + current-loop efficiency metrics (runtime, cycle count, token usage).',
        'weights': weights,
        'rows': rows,
    }



def write_markdown(payload: dict[str, Any]) -> None:
    lines = [
        '# loop_metrics_report.md - latest loop quality + efficiency composite',
        '',
        f"generated_at: {payload['generated_at']}",
        f"latest_reset_timestamp: {payload['latest_reset_timestamp']}",
        f"excluded_harnesses: {', '.join(payload['excluded_harnesses']) or '(none)'}",
        '',
        payload['score_note'],
        '',
        '## Existing score meaning',
        '',
        '- `evaluation_report.final.final_score` is **not browser-only**.',
        '- It already combines L1 Playwright smoke + L2 quantitative build metrics + L3 subjective rubric score.',
        '- However, it does **not** include latest-loop runtime, cycle count, or token usage.',
        '',
        '## Latest loop composite',
        '',
        '| harness | quality(100) | wall clock(s) | active(s) | cycles | tokens | wall eff | cycle eff | token eff | composite |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ]
    for row in payload['rows']:
        lines.append(
            f"| {row['harness']} | {row['quality_base_score_100']:.2f} | {row['wall_clock_to_pass_seconds']:.0f} | {row['active_attempt_seconds']:.0f} | {row['cycles_to_pass']} | {row['token_usage_total']:,} | {row['wall_clock_efficiency_100']:.2f} | {row['cycle_efficiency_100']:.2f} | {row['token_efficiency_100']:.2f} | **{row['composite_score_100']:.2f}** |"
        )
    lines.extend([
        '',
        '## Interpretation',
        '',
        '- `quality(100)` = latest available `evaluation_report.final.final_score * 10`',
        '- `wall clock(s)` = latest loop reset 이후 첫 시도부터 최종 통과까지의 실제 경과 시간',
        '- `active(s)` = 같은 기간 동안 각 cycle 시도 시간을 합산한 시간',
        '- `cycles` = 최신 루프에서 최종 통과까지 걸린 cycle 수',
        '- `tokens` = 관련 cycle들의 design/critique/verify 로그에 기록된 `tokens used` 합산',
        '- `composite` = 품질 55% + wall-clock 효율 15% + cycle 효율 15% + token 효율 15%',
    ])
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text('\n'.join(lines) + '\n', encoding='utf-8')



def main() -> int:
    payload = build_rows()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    write_markdown(payload)
    print(f'saved {OUT_JSON}')
    print(f'saved {OUT_MD}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
