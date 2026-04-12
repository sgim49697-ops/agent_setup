#!/usr/bin/env python3
"""Rotate, compress, and prune master-loop logs without stopping automation."""
from __future__ import annotations

import argparse
import gzip
import json
import shutil
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/home/user/projects/agent_setup/codex_agent')
DEFAULT_ACTIVE_LOG = ROOT / '.omx/logs/master-ux-benchmark-v2.log'
DEFAULT_ARCHIVE_DIR = ROOT / '.omx/logs/archive'


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def tail_lines(path: Path, limit: int) -> list[str]:
    out: deque[str] = deque(maxlen=limit)
    with path.open('r', encoding='utf-8', errors='ignore') as fh:
        for line in fh:
            out.append(line)
    return list(out)


def rotate_active_log(active_log: Path, archive_dir: Path, threshold_mb: int, retain_lines: int) -> dict:
    result = {'rotated': False}
    if not active_log.exists():
        return result
    size_mb = active_log.stat().st_size / 1024 / 1024
    result['active_log_mb'] = round(size_mb, 2)
    if size_mb <= threshold_mb:
        return result

    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_target = archive_dir / f'{active_log.stem}-{utc_stamp()}-rotated.log'
    shutil.copy2(active_log, archive_target)
    tail = tail_lines(active_log, retain_lines)
    active_log.write_text(''.join(tail), encoding='utf-8')
    result.update({
        'rotated': True,
        'archive_target': str(archive_target),
        'retained_lines': retain_lines,
    })
    return result


def gzip_file(path: Path) -> Path:
    gz_path = path.with_suffix(path.suffix + '.gz')
    with path.open('rb') as src, gzip.open(gz_path, 'wb', compresslevel=6) as dst:
        shutil.copyfileobj(src, dst)
    path.unlink(missing_ok=True)
    return gz_path


def compress_archives(archive_dir: Path, older_hours: int, over_mb: int) -> dict:
    result = {'compressed': []}
    if not archive_dir.exists():
        return result
    cutoff = time.time() - older_hours * 3600
    for path in sorted(archive_dir.iterdir()):
        if not path.is_file() or path.suffix.endswith('.gz'):
            continue
        stat = path.stat()
        if stat.st_mtime > cutoff:
            continue
        if stat.st_size < over_mb * 1024 * 1024:
            continue
        gz_path = gzip_file(path)
        result['compressed'].append({'source': str(path), 'target': str(gz_path)})
    return result


def prune_archives(archive_dir: Path, older_days: int | None) -> dict:
    result = {'deleted': [], 'enabled': False}
    if older_days is None:
        return result
    result['enabled'] = True
    if not archive_dir.exists():
        return result
    cutoff = time.time() - older_days * 86400
    for path in sorted(archive_dir.iterdir()):
        try:
            stat = path.stat()
        except FileNotFoundError:
            continue
        if stat.st_mtime >= cutoff:
            continue
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        else:
            path.unlink(missing_ok=True)
        result['deleted'].append(str(path))
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--active-log', default=str(DEFAULT_ACTIVE_LOG))
    parser.add_argument('--archive-dir', default=str(DEFAULT_ARCHIVE_DIR))
    parser.add_argument('--active-threshold-mb', type=int, default=25)
    parser.add_argument('--retain-lines', type=int, default=4000)
    parser.add_argument('--compress-older-hours', type=int, default=1)
    parser.add_argument('--compress-over-mb', type=int, default=50)
    parser.add_argument('--delete-older-days', type=int, default=None)
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()

    active_log = Path(args.active_log)
    archive_dir = Path(args.archive_dir)
    report = {
        'rotated': rotate_active_log(active_log, archive_dir, args.active_threshold_mb, args.retain_lines),
        'compressed': compress_archives(archive_dir, args.compress_older_hours, args.compress_over_mb),
        'pruned': prune_archives(archive_dir, args.delete_older_days),
    }
    if not args.quiet:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
