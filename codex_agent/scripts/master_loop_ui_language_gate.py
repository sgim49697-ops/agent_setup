#!/usr/bin/env python3
"""Heuristic Korean-first UI copy gate for active harness source files."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from master_loop_state import load_state, resolve_harness_token

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
REPORT_PATH = ROOT / '.omx/state/master-loop-ui-language.json'
STRING_RE = re.compile(r'(["\'\`])((?:\\.|(?!\1).)*)\1')
HANGUL_RE = re.compile(r'[가-힣]')
LATIN_RE = re.compile(r'[A-Za-z]')
IGNORE_CONTEXT_TOKENS = ('import ', ' from ', 'className', 'data-testid', 'data-test', 'href=', 'src=', 'url', 'id:', 'role:', 'variant:', 'status:', 'kind:', 'path:', 'http://', 'https://', 'type ', 'interface ', 'enum ')
ALLOW_ENGLISH_HOOK_TOKENS = ('aria-', 'ariaLabel', 'aria-label', 'live-region', 'copy markdown', 'generate post', 'research results', 'outline', 'section drafts', 'review notes', 'final post', 'export-ready', 'review-complete')
HARNESS_ALIASES = {
    'benchmark_foundation': 'single_agent',
}


def active_file_roots(harness: str) -> list[Path]:
    base = ROOT / harness / 'app' / 'src'
    return [base] if base.exists() else []


def should_scan_file(path: Path) -> bool:
    return path.name in {'App.tsx', 'starterData.ts', 'generator.ts'}


def should_consider(text: str, line: str) -> bool:
    cleaned = text.strip()
    if not cleaned:
        return False
    if any(tok in line for tok in IGNORE_CONTEXT_TOKENS):
        return False
    if cleaned.startswith(('./', '../', '/', '#')):
        return False
    if len(cleaned) <= 1:
        return False
    if cleaned in {'root', '\n'}:
        return False
    if cleaned.isupper() and len(cleaned) < 12:
        return False
    if '/' in cleaned or '{' in cleaned or '}' in cleaned:
        return False
    if re.fullmatch(r'[a-z0-9_:-]+', cleaned):
        return False
    if re.fullmatch(r'[A-Za-z][A-Za-z0-9]+', cleaned) and ' ' not in cleaned and '-' not in cleaned:
        return False
    return bool(HANGUL_RE.search(cleaned) or LATIN_RE.search(cleaned))


def is_english_hook(text: str, line: str) -> bool:
    lowered = text.lower()
    line_lower = line.lower()
    return any(tok in lowered or tok in line_lower for tok in ALLOW_ENGLISH_HOOK_TOKENS)


def scan_harness(harness: str) -> dict:
    state = load_state(ROOT / '.omx/state/master-ux-loop.json')
    resolved_harness = resolve_harness_token(HARNESS_ALIASES.get(harness, harness), state)
    files = []
    korean = 0
    english = 0
    exempt_english = 0
    samples = []
    for root in active_file_roots(resolved_harness):
        for path in root.rglob('*'):
            if path.suffix not in {'.ts', '.tsx'} or not should_scan_file(path):
                continue
            text = path.read_text(encoding='utf-8', errors='ignore')
            lines = text.splitlines()
            file_candidates = 0
            for lineno, line in enumerate(lines, start=1):
                for match in STRING_RE.finditer(line):
                    literal = match.group(2)
                    if not should_consider(literal, line):
                        continue
                    file_candidates += 1
                    if HANGUL_RE.search(literal):
                        korean += 1
                    elif LATIN_RE.search(literal):
                        if is_english_hook(literal, line):
                            exempt_english += 1
                        else:
                            english += 1
                            if len(samples) < 12:
                                samples.append({'file': str(path.relative_to(ROOT)), 'line': lineno, 'text': literal[:120]})
            files.append({'file': str(path.relative_to(ROOT)), 'candidate_strings': file_candidates})
    total_effective = korean + english
    korean_ratio = round(korean / total_effective, 4) if total_effective else 1.0
    ok = korean_ratio >= 0.7
    return {
        'ok': ok,
        'harness': harness,
        'resolved_harness': resolved_harness,
        'korean_visible_strings': korean,
        'english_visible_strings': english,
        'exempt_english_hook_strings': exempt_english,
        'korean_ratio': korean_ratio,
        'threshold': 0.7,
        'files': files,
        'offenders': samples,
        'errors': [] if ok else [f'Korean-first visible copy ratio is {korean_ratio:.2f}, below 0.70 threshold'],
        'warnings': [] if ok else ['영어 UI 문자열이 많습니다. aria/live-region hook만 영어로 남기고 visible copy는 한국어 우선으로 바꾸세요.'],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--harness', required=True)
    parser.add_argument('--output', default=str(REPORT_PATH))
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()

    report = scan_harness(args.harness)
    Path(args.output).write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    if not args.quiet:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
