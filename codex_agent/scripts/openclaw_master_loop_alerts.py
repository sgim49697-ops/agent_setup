#!/usr/bin/env python3
"""Non-blocking Telegram alerts for repeated failures or obvious external issues."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from collections import deque
from pathlib import Path
from typing import Any

from master_loop_state import load_state, normalize_remaining_harnesses

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
DEFAULT_STATE_PATH = ROOT / '.omx/state/master-ux-loop.json'
DEFAULT_ALERT_STATE_PATH = ROOT / '.omx/state/master-loop-alerts.json'
DEFAULT_LOG_PATH = ROOT / '.omx/logs/master-ux-benchmark-v2.log'
ALERT_CHAT_ID = '8194519852'
ALERT_CHANNEL = 'telegram'
ALERT_REPEAT_THRESHOLD = 50
ALERT_STAGNANT_THRESHOLD = 50
ALERT_COOLDOWN_SEC = 60 * 60

AUTH_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        r'token_invalidated',
        r'refresh_token_reused',
        r'Failed to refresh token',
        r'401 Unauthorized',
        r'access token could not be refreshed',
        r'authentication token has been invalidated',
    ]
]
NETWORK_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        r'ENOTFOUND',
        r'EHOSTUNREACH',
        r'ECONNREFUSED',
        r'ETIMEDOUT',
        r'network is unreachable',
        r'failed to connect to websocket',
        r'transport channel closed',
    ]
]


def now_ts() -> int:
    return int(time.time())


def read_alert_state(path: Path) -> dict[str, Any]:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            return {}
    return {}


def write_alert_state(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def tail_lines(path: Path, max_lines: int = 300) -> list[str]:
    if not path.exists():
        return []
    dq: deque[str] = deque(maxlen=max_lines)
    with path.open('r', encoding='utf-8', errors='ignore') as fh:
        for line in fh:
            dq.append(line.rstrip('\n'))
    return list(dq)


def detect_recent_external_issue(lines: list[str]) -> tuple[str, str] | None:
    for line in reversed(lines):
        for pat in AUTH_PATTERNS:
            if pat.search(line):
                return ('external-auth', line[:400])
        for pat in NETWORK_PATTERNS:
            if pat.search(line):
                return ('external-network', line[:400])
    return None


def build_alerts(state: dict[str, Any], lines: list[str]) -> list[dict[str, str]]:
    alerts: list[dict[str, str]] = []
    current_harness = str(state.get('current_harness') or '').strip()
    remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
    qg_streak = int(state.get('quality_gate_failure_streak', 0))
    stagnant = int(state.get('stagnant_cycle_count', 0))
    qg_sig = str(state.get('last_quality_gate_signature') or '').strip()
    cycle = int(state.get('cycle', 0))

    if qg_streak >= ALERT_REPEAT_THRESHOLD and qg_sig:
        alerts.append({
            'kind': 'repeat-quality-failure',
            'signature': qg_sig,
            'message': (
                f'⚠️ codex_agent 자동화 경고\n'
                f'- 유형: 동일 quality gate 실패 반복\n'
                f'- cycle: {cycle}\n'
                f'- harness: {current_harness}\n'
                f'- failure_streak: {qg_streak}\n'
                f'- remaining: {remaining}\n'
                f'- 사유: {qg_sig}\n'
                f'- 자동화는 계속 진행 중이며, 이 알림은 중단 없이 전달된 상태 보고입니다.'
            ),
        })

    if stagnant >= ALERT_STAGNANT_THRESHOLD:
        alerts.append({
            'kind': 'stagnant-cycle',
            'signature': f'stagnant:{current_harness}:{stagnant}',
            'message': (
                f'⚠️ codex_agent 자동화 정체 경고\n'
                f'- cycle: {cycle}\n'
                f'- harness: {current_harness}\n'
                f'- stagnant_cycle_count: {stagnant}\n'
                f'- remaining: {remaining}\n'
                f'- 자동화는 계속 진행 중이며, 이 알림은 장기 정체 감지 보고입니다.'
            ),
        })

    external = detect_recent_external_issue(lines)
    if external:
        kind, detail = external
        label = 'OAuth/인증 문제' if kind == 'external-auth' else '네트워크/연결 문제'
        alerts.append({
            'kind': kind,
            'signature': detail,
            'message': (
                f'⚠️ codex_agent 외부 환경 경고\n'
                f'- 유형: {label}\n'
                f'- cycle: {cycle}\n'
                f'- harness: {current_harness}\n'
                f'- 로그: {detail}\n'
                f'- 자동화는 계속 진행 중이며, watchdog가 재시도를 이어갑니다.'
            ),
        })

    return alerts


def should_send(alert_state: dict[str, Any], kind: str, signature: str) -> bool:
    sent = alert_state.get('sent', {})
    key = f'{kind}::{signature}'
    last = sent.get(key, 0)
    return now_ts() - int(last) >= ALERT_COOLDOWN_SEC


def send_alert(message: str, dry_run: bool = False) -> tuple[bool, str]:
    cmd = [
        'openclaw', 'message', 'send',
        '--channel', ALERT_CHANNEL,
        '--target', ALERT_CHAT_ID,
        '--message', message,
        '--json',
    ]
    if dry_run:
        cmd.append('--dry-run')
    proc = subprocess.run(cmd, capture_output=True, text=True)
    output = (proc.stdout or proc.stderr or '').strip()
    return proc.returncode == 0, output[:2000]


def append_log(log_path: Path, msg: str) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open('a', encoding='utf-8') as fh:
        fh.write(f'[{time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}] alert: {msg}\n')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--state', default=str(DEFAULT_STATE_PATH))
    parser.add_argument('--log', default=str(DEFAULT_LOG_PATH))
    parser.add_argument('--alert-state', default=str(DEFAULT_ALERT_STATE_PATH))
    args = parser.parse_args()

    state_path = Path(args.state)
    log_path = Path(args.log)
    alert_state_path = Path(args.alert_state)

    state = load_state(state_path)
    lines = tail_lines(log_path)
    alert_state = read_alert_state(alert_state_path)
    alerts = build_alerts(state, lines)
    if not alerts:
        write_alert_state(alert_state_path, {**alert_state, 'last_scan_at': now_ts()})
        return 0

    sent = alert_state.get('sent', {})
    deliveries: list[dict[str, Any]] = []
    for alert in alerts:
        kind = alert['kind']
        signature = alert['signature']
        if not should_send(alert_state, kind, signature):
            continue
        ok, output = send_alert(alert['message'], dry_run=args.dry_run)
        deliveries.append({'kind': kind, 'signature': signature[:160], 'ok': ok, 'output': output[:400]})
        if ok:
            sent[f'{kind}::{signature}'] = now_ts()
            append_log(log_path, f'sent telegram alert kind={kind}')
        else:
            append_log(log_path, f'failed telegram alert kind={kind}: {output[:240]}')

    write_alert_state(alert_state_path, {
        'last_scan_at': now_ts(),
        'sent': sent,
        'last_deliveries': deliveries,
    })
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
