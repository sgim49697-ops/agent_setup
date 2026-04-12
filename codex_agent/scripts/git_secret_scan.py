#!/usr/bin/env python3
"""Scan staged codex_agent files for secret-like patterns before commit/push."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path("/home/user/projects/agent_setup")
WORKSPACE_PREFIX = "codex_agent/"

PATTERNS = [
    ("openai_key", re.compile(r"sk-[A-Za-z0-9]{20,}")),
    ("github_token", re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}")),
    ("google_api_key", re.compile(r"AIza[0-9A-Za-z\\-_]{20,}")),
    ("telegram_bot_token", re.compile(r"\\b\\d{8,10}:[A-Za-z0-9_-]{20,}\\b")),
    ("refresh_token", re.compile(r"\\brt_[A-Za-z0-9._\\-]{20,}\\b")),
    ("jwt", re.compile(r"eyJ[a-zA-Z0-9_-]{10,}\\.[a-zA-Z0-9._-]{10,}\\.[a-zA-Z0-9._-]{10,}")),
]


def staged_files() -> list[Path]:
    proc = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "-z"],
        cwd=REPO_ROOT,
        capture_output=True,
        check=False,
    )
    return [
        Path(p.decode())
        for p in proc.stdout.split(b"\0")
        if p and p.decode().startswith(WORKSPACE_PREFIX)
    ]


def main() -> int:
    findings: list[tuple[str, str]] = []

    for rel in staged_files():
        path = REPO_ROOT / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for label, pattern in PATTERNS:
            if pattern.search(text):
                findings.append((str(rel), label))
                break

    if findings:
        print("Secret-like content detected in staged files:", file=sys.stderr)
        for rel, label in findings:
            print(f"- {rel} ({label})", file=sys.stderr)
        print("Commit aborted. Remove or ignore the sensitive content first.", file=sys.stderr)
        return 3

    print("Secret scan passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
