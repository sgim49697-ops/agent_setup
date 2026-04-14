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
JSX_TEXT_RE = re.compile(r'>([^<>{}]+?)<')
TEMPLATE_EXPR_RE = re.compile(r'\$\{[^}]*\}')
HANGUL_RE = re.compile(r'[가-힣]')
LATIN_RE = re.compile(r'[A-Za-z]')
WHITESPACE_RE = re.compile(r'\s+')
ESCAPE_ONLY_RE = re.compile(r'^(?:\\[nrtbfv0]|\\u[0-9A-Fa-f]{4}|\\x[0-9A-Fa-f]{2}|\s)+$')
KEYBOARD_TOKEN_RE = re.compile(r'^(?:Arrow(?:Up|Down|Left|Right)|Home|End|Page(?:Up|Down)|Escape|Enter|Tab|Space|Backspace|Delete|F\d{1,2})$')
NON_VISIBLE_PROP_RE = re.compile(
    r'(?:^|[\s<{(,])(?:'
    r'classname|data-testid|data-test|href|src|id|role|variant|status|kind|path|type|size|color|tone|target|rel|'
    r'htmlfor|tabindex|viewbox|xmlns|fill|stroke|d|cx|cy|x|y|rx|ry|r|width|height|icon|as|to|key|value|name'
    r')\s*[:=]\s*\{?\s*$',
)
VISIBLE_COPY_CONTEXT_RE = re.compile(
    r'(?:^|[\s<{(,])(?:'
    r'label|title|headline|description|summary|copy|caption|message|text|body|cta|eyebrow|helper|placeholder|prompt|'
    r'hint|note|statuslabel|steplabel|buttonlabel|emptytitle|emptybody|paneltitle|sectiontitle|kicker|subheadline'
    r')\s*[:=]\s*\{?\s*$',
)
NON_VISIBLE_LINE_TOKENS = ('import ', ' from ', 'console.', 'http://', 'https://')
HOOK_CONTEXT_TOKENS = ('aria-', 'arialabel', 'aria-label', 'aria-labelledby', 'aria-describedby', 'data-testid', 'data-test', 'live-region')
ALLOW_ENGLISH_HOOK_TOKENS = (
    'copy markdown',
    'generate post',
    'research results',
    'outline',
    'section drafts',
    'review notes',
    'final post',
    'export-ready',
    'review-complete',
)
HARNESS_ALIASES = {
    'benchmark_foundation': 'single_agent',
}
EXCLUDED_DIR_NAMES = {'assets', '__tests__', 'node_modules'}
EXCLUDED_SUFFIXES = ('.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.d.ts')


def active_file_roots(harness: str) -> list[Path]:
    base = ROOT / harness / 'app' / 'src'
    return [base] if base.exists() else []


def should_scan_file(path: Path) -> bool:
    if path.suffix not in {'.ts', '.tsx'}:
        return False
    if any(part in EXCLUDED_DIR_NAMES for part in path.parts):
        return False
    return not any(str(path).endswith(suffix) for suffix in EXCLUDED_SUFFIXES)


def normalize_candidate(text: str) -> str:
    cleaned = TEMPLATE_EXPR_RE.sub(' ', text)
    cleaned = cleaned.replace('&nbsp;', ' ')
    cleaned = WHITESPACE_RE.sub(' ', cleaned).strip()
    return cleaned


def line_number_for_offset(text: str, offset: int) -> int:
    return text.count('\n', 0, offset) + 1


def should_consider(text: str, source: str) -> bool:
    cleaned = normalize_candidate(text)
    if not cleaned:
        return False
    if ESCAPE_ONLY_RE.fullmatch(cleaned):
        return False
    if cleaned.startswith(('./', '../', '/', '#')):
        return False
    if len(cleaned) <= 1:
        return False
    if cleaned in {'root'}:
        return False
    if KEYBOARD_TOKEN_RE.fullmatch(cleaned):
        return False
    if '{' in cleaned or '}' in cleaned:
        return False
    if not (HANGUL_RE.search(cleaned) or LATIN_RE.search(cleaned)):
        return False
    if re.fullmatch(r'[a-z0-9_:-]+', cleaned):
        return False
    if source == 'string' and re.fullmatch(r'[a-z][a-z0-9]+', cleaned):
        return False
    return True


def is_hook_context(prefix: str, line: str) -> bool:
    prefix_lower = prefix.lower()
    line_lower = line.lower()
    return any(token in prefix_lower or token in line_lower for token in HOOK_CONTEXT_TOKENS)


def is_non_visible_string_context(prefix: str, line: str) -> bool:
    prefix_lower = prefix.lower()
    line_lower = line.lower()
    stripped = line_lower.lstrip()
    if any(token in line_lower for token in NON_VISIBLE_LINE_TOKENS):
        return True
    if stripped.startswith(('import ', 'export type ', 'type ', 'interface ', 'enum ')):
        return True
    if is_hook_context(prefix, line):
        return True
    if VISIBLE_COPY_CONTEXT_RE.search(prefix_lower):
        return False
    return bool(NON_VISIBLE_PROP_RE.search(prefix_lower))


def is_english_hook(text: str, prefix: str, line: str) -> bool:
    lowered = text.lower()
    line_lower = line.lower()
    if is_hook_context(prefix, line):
        return True
    return any(tok in lowered or tok in line_lower for tok in ALLOW_ENGLISH_HOOK_TOKENS)


def iter_string_candidates(path: Path, text: str):
    for lineno, line in enumerate(text.splitlines(), start=1):
        for match in STRING_RE.finditer(line):
            literal = match.group(2)
            prefix = line[:match.start()]
            yield lineno, literal, line, prefix


def iter_jsx_text_candidates(text: str):
    for lineno, line in enumerate(text.splitlines(), start=1):
        for match in JSX_TEXT_RE.finditer(line):
            yield lineno, match.group(1)


def scan_harness(harness: str) -> dict:
    state = load_state(ROOT / '.omx/state/master-ux-loop.json')
    resolved_harness = resolve_harness_token(HARNESS_ALIASES.get(harness, harness), state)
    files = []
    korean = 0
    english = 0
    exempt_hooks = 0
    exempt_english = 0
    samples = []

    for root in active_file_roots(resolved_harness):
        for path in sorted(root.rglob('*')):
            if not should_scan_file(path):
                continue
            text = path.read_text(encoding='utf-8', errors='ignore')
            file_candidates = 0

            for lineno, literal, line, prefix in iter_string_candidates(path, text):
                cleaned = normalize_candidate(literal)
                if not should_consider(cleaned, source='string'):
                    continue
                if is_non_visible_string_context(prefix, line):
                    if is_english_hook(cleaned, prefix, line):
                        exempt_english += 1
                    exempt_hooks += 1
                    continue
                file_candidates += 1
                if HANGUL_RE.search(cleaned):
                    korean += 1
                elif LATIN_RE.search(cleaned):
                    english += 1
                    if len(samples) < 12:
                        samples.append({'file': str(path.relative_to(ROOT)), 'line': lineno, 'text': cleaned[:120]})

            if path.suffix == '.tsx':
                for lineno, literal in iter_jsx_text_candidates(text):
                    cleaned = normalize_candidate(literal)
                    if not should_consider(cleaned, source='jsx_text'):
                        continue
                    file_candidates += 1
                    if HANGUL_RE.search(cleaned):
                        korean += 1
                    elif LATIN_RE.search(cleaned):
                        english += 1
                        if len(samples) < 12:
                            samples.append({'file': str(path.relative_to(ROOT)), 'line': lineno, 'text': cleaned[:120]})

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
        'exempt_hook_strings': exempt_hooks,
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
