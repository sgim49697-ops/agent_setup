#!/usr/bin/env python3
"""Sync OpenClaw auth-profiles.json with the latest Codex OAuth tokens."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
CODEX_AUTH = Path('/home/user/.codex/auth.json')
OPENCLAW_AGENTS_DIR = Path('/home/user/.openclaw/agents')
BACKUP_ROOT = Path('/home/user/.openclaw/backups')
PROFILE_ID = 'openai-codex:default'
PROVIDER = 'openai-codex'


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def discover_auth_stores() -> list[Path]:
    stores: set[Path] = set()
    cfg_path = Path('/home/user/.openclaw/openclaw.json')
    if cfg_path.exists():
        cfg = load_json(cfg_path)
        for item in cfg.get('agents', {}).get('list', []):
            agent_dir = item.get('agentDir')
            if isinstance(agent_dir, str) and agent_dir:
                agent_dir = agent_dir.replace('/home/node/.openclaw', '/home/user/.openclaw')
                stores.add(Path(agent_dir) / 'auth-profiles.json')
    stores.update(OPENCLAW_AGENTS_DIR.glob('*/agent/auth-profiles.json'))
    return sorted(stores)


def sync_store(store_path: Path, codex_auth: dict, backup_dir: Path) -> bool:
    store_path.parent.mkdir(parents=True, exist_ok=True)
    store = load_json(store_path) if store_path.exists() else {'version': 1, 'profiles': {}}
    tokens = codex_auth['tokens']
    profile = {
        'type': 'oauth',
        'provider': PROVIDER,
        'access': tokens['access_token'],
        'refresh': tokens['refresh_token'],
        'expires': int(CODEX_AUTH.stat().st_mtime * 1000) + 60 * 60 * 1000,
        'accountId': tokens.get('account_id'),
    }

    changed = store.get('profiles', {}).get(PROFILE_ID) != profile
    if not changed:
        return False

    backup_dir.mkdir(parents=True, exist_ok=True)
    if store_path.exists():
        shutil.copy2(store_path, backup_dir / f'{store_path.parent.parent.name}-auth-profiles.json.bak')

    store.setdefault('version', 1)
    store.setdefault('profiles', {})[PROFILE_ID] = profile
    store.setdefault('lastGood', {})[PROVIDER] = PROFILE_ID
    store.setdefault('usageStats', {}).setdefault(PROFILE_ID, {})['lastUsed'] = int(datetime.now(timezone.utc).timestamp() * 1000)
    store_path.write_text(json.dumps(store, indent=2) + '\n', encoding='utf-8')
    return True


def restart_gateway() -> tuple[int, str]:
    cmd = ['systemctl', '--user', 'restart', 'openclaw-gateway']
    proc = subprocess.run(cmd, capture_output=True, text=True)
    output = (proc.stdout + proc.stderr).strip()
    return proc.returncode, output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--restart-gateway-if-needed', action='store_true')
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()

    if not CODEX_AUTH.exists():
        print(f'missing Codex auth file: {CODEX_AUTH}', file=sys.stderr)
        return 1

    codex_auth = load_json(CODEX_AUTH)
    stores = discover_auth_stores()
    if not stores:
        print('no OpenClaw auth stores found', file=sys.stderr)
        return 1

    backup_dir = BACKUP_ROOT / f'oauth-sync-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}'
    changed_paths: list[str] = []
    for store_path in stores:
        if sync_store(store_path, codex_auth, backup_dir):
            changed_paths.append(str(store_path))

    restarted = None
    if changed_paths and args.restart_gateway_if_needed:
        restarted = restart_gateway()

    if not args.quiet:
        print(json.dumps({
            'timestamp': utc_now(),
            'changed': bool(changed_paths),
            'stores_updated': changed_paths,
            'gateway_restarted': restarted[0] == 0 if restarted else False,
            'gateway_restart_output': restarted[1] if restarted else '',
            'backup_dir': str(backup_dir) if changed_paths else '',
        }, ensure_ascii=False, indent=2))

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
