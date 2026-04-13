#!/usr/bin/env python3
"""Stable preview manager for harness apps so Playwright always gets a live URL."""
from __future__ import annotations

import argparse
import json
import socket
import subprocess
import time
from pathlib import Path
from typing import Any

from master_loop_state import QUALITY_GATE_ALIAS, HARNESSES, load_state, resolve_harness_token

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
SESSION = 'ux-preview-bg'
HOST = '127.0.0.1'
STATE_DIR = ROOT / '.omx/state/previews'
LOG_DIR = ROOT / '.omx/logs/previews'

HARNESS_PORTS = {
    'single_agent': 4273,
    'sequential_pipeline': 4274,
    'parallel_sections': 4275,
    'router': 4276,
    'orchestrator_worker': 4277,
    'evaluator_optimizer': 4278,
    'omx_evaluator_optimizer': 4279,
}
HARNESS_CHOICES = sorted([*HARNESSES, QUALITY_GATE_ALIAS, 'benchmark_foundation'])
HARNESS_ALIASES = {
    'benchmark_foundation': 'single_agent',
}


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True)


def socket_open(host: str, port: int) -> bool:
    sock = socket.socket()
    sock.settimeout(0.5)
    try:
        sock.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def ensure_tmux_session() -> None:
    if run(['tmux', 'has-session', '-t', SESSION]).returncode != 0:
        run(['tmux', 'new-session', '-d', '-s', SESSION, '-n', 'shell', '-c', str(ROOT)])


def window_name(harness: str) -> str:
    return f'preview-{harness}'


def app_dir(harness: str) -> Path:
    return ROOT / harness / 'app'


def log_path(harness: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    return LOG_DIR / f'{harness}.log'


def state_path(harness: str) -> Path:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / f'{harness}.json'


def write_state(harness: str, payload: dict[str, Any]) -> None:
    state_path(harness).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def read_state(harness: str) -> dict[str, Any]:
    path = state_path(harness)
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return {}


def session_windows() -> list[str]:
    proc = run(['tmux', 'list-windows', '-t', SESSION, '-F', '#W'])
    if proc.returncode != 0:
        return []
    return proc.stdout.splitlines()


def cleanup_orphan_preview_processes(harness: str, port: int) -> None:
    app = app_dir(harness)
    pattern = f"{app} && npm run preview -- --host {HOST} --port {port}"
    run(['pkill', '-TERM', '-f', pattern])
    time.sleep(0.5)
    run(['pkill', '-KILL', '-f', pattern])


def launch_window(harness: str, port: int) -> None:
    ensure_tmux_session()
    name = window_name(harness)
    cleanup_orphan_preview_processes(harness, port)
    if name in session_windows():
        run(['tmux', 'kill-window', '-t', f'{SESSION}:{name}'])
    log_file = log_path(harness)
    command = (
        f"bash -lc 'cd {app_dir(harness)} && "
        f"npm run preview -- --host {HOST} --port {port} --strictPort >> {log_file} 2>&1'"
    )
    run(['tmux', 'new-window', '-d', '-t', SESSION, '-n', name, '-c', str(ROOT), command])


def wait_for_port(port: int, timeout_s: float = 20.0) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if socket_open(HOST, port):
            return True
        time.sleep(0.5)
    return False


def resolve_requested_harness(harness: str) -> tuple[str, int]:
    state = load_state(ROOT / '.omx/state/master-ux-loop.json')
    requested = HARNESS_ALIASES.get(harness, harness)
    resolved = resolve_harness_token(requested, state)
    if resolved not in HARNESS_PORTS:
        raise SystemExit(f'unknown harness: {harness}')
    return resolved, HARNESS_PORTS[resolved]


def ensure_preview(harness: str) -> dict[str, Any]:
    resolved, port = resolve_requested_harness(harness)
    url = f'http://{HOST}:{port}/'
    app = app_dir(resolved)
    if not app.exists():
        raise SystemExit(f'app directory missing: {app}')

    state = read_state(resolved)
    if socket_open(HOST, port):
        state.update({'harness': resolved, 'requested_harness': harness, 'resolved_harness': resolved, 'port': port, 'url': url, 'status': 'running'})
        write_state(resolved, state)
        return state

    launch_window(resolved, port)
    ok = wait_for_port(port)
    state = {
        'harness': resolved,
        'requested_harness': harness,
        'resolved_harness': resolved,
        'port': port,
        'url': url,
        'status': 'running' if ok else 'failed',
        'window': window_name(resolved),
        'log': str(log_path(resolved)),
    }
    write_state(resolved, state)
    return state


def stop_preview(harness: str) -> dict[str, Any]:
    ensure_tmux_session()
    resolved, port = resolve_requested_harness(harness)
    name = window_name(resolved)
    if name in session_windows():
        run(['tmux', 'kill-window', '-t', f'{SESSION}:{name}'])
    state = read_state(resolved)
    state.update({'harness': resolved, 'requested_harness': harness, 'resolved_harness': resolved, 'port': port, 'url': f'http://{HOST}:{port}/', 'status': 'stopped'})
    write_state(resolved, state)
    return state


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='cmd', required=True)

    ensure_p = sub.add_parser('ensure')
    ensure_p.add_argument('harness', choices=HARNESS_CHOICES)

    status_p = sub.add_parser('status')
    status_p.add_argument('harness', choices=HARNESS_CHOICES)

    stop_p = sub.add_parser('stop')
    stop_p.add_argument('harness', choices=HARNESS_CHOICES)

    args = parser.parse_args()

    if args.cmd == 'ensure':
        payload = ensure_preview(args.harness)
    elif args.cmd == 'stop':
        payload = stop_preview(args.harness)
    else:
        resolved, port = resolve_requested_harness(args.harness)
        payload = read_state(resolved)
        if not payload:
            payload = {
                'harness': resolved,
                'requested_harness': args.harness,
                'resolved_harness': resolved,
                'port': port,
                'url': f'http://{HOST}:{port}/',
                'status': 'unknown',
            }
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
