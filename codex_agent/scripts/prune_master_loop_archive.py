#!/usr/bin/env python3
"""Prune old master-loop archive folders and print a concise summary."""
from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
ARCHIVE = ROOT / '.omx/logs/archive'


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--days', type=int, default=7)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    cutoff = time.time() - args.days * 86400
    deleted = []
    kept = []
    if ARCHIVE.exists():
        for path in sorted(ARCHIVE.iterdir()):
            try:
                mtime = path.stat().st_mtime
            except FileNotFoundError:
                continue
            if mtime < cutoff:
                deleted.append(str(path))
                if not args.dry_run:
                    if path.is_dir():
                        shutil.rmtree(path, ignore_errors=True)
                    else:
                        path.unlink(missing_ok=True)
            else:
                kept.append(str(path))

    report = {
        'archive_root': str(ARCHIVE),
        'days': args.days,
        'dry_run': args.dry_run,
        'deleted_count': len(deleted),
        'kept_count': len(kept),
        'deleted': deleted[:20],
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
