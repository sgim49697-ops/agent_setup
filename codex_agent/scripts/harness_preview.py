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


def launch_window(harness: str, port: int) -> None:
    ensure_tmux_session()
    name = window_name(harness)
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


def ensure_preview(harness: str) -> dict[str, Any]:
    if harness not in HARNESS_PORTS:
        raise SystemExit(f'unknown harness: {harness}')
    port = HARNESS_PORTS[harness]
    url = f'http://{HOST}:{port}/'
    app = app_dir(harness)
    if not app.exists():
        raise SystemExit(f'app directory missing: {app}')

    state = read_state(harness)
    if socket_open(HOST, port):
        state.update({'harness': harness, 'port': port, 'url': url, 'status': 'running'})
        write_state(harness, state)
        return state

    launch_window(harness, port)
    ok = wait_for_port(port)
    state = {
        'harness': harness,
        'port': port,
        'url': url,
        'status': 'running' if ok else 'failed',
        'window': window_name(harness),
        'log': str(log_path(harness)),
    }
    write_state(harness, state)
    return state


def stop_preview(harness: str) -> dict[str, Any]:
    ensure_tmux_session()
    name = window_name(harness)
    if name in session_windows():
        run(['tmux', 'kill-window', '-t', f'{SESSION}:{name}'])
    state = read_state(harness)
    state.update({'harness': harness, 'port': HARNESS_PORTS[harness], 'url': f'http://{HOST}:{HARNESS_PORTS[harness]}/', 'status': 'stopped'})
    write_state(harness, state)
    return state


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='cmd', required=True)

    ensure_p = sub.add_parser('ensure')
    ensure_p.add_argument('harness', choices=sorted(HARNESS_PORTS))

    status_p = sub.add_parser('status')
    status_p.add_argument('harness', choices=sorted(HARNESS_PORTS))

    stop_p = sub.add_parser('stop')
    stop_p.add_argument('harness', choices=sorted(HARNESS_PORTS))

    args = parser.parse_args()

    if args.cmd == 'ensure':
        payload = ensure_preview(args.harness)
    elif args.cmd == 'stop':
        payload = stop_preview(args.harness)
    else:
        payload = read_state(args.harness)
        if not payload:
            payload = {
                'harness': args.harness,
                'port': HARNESS_PORTS[args.harness],
                'url': f'http://{HOST}:{HARNESS_PORTS[args.harness]}/',
                'status': 'unknown',
            }
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
