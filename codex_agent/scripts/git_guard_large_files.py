#!/usr/bin/env python3
"""Guard against accidentally committing large files from the codex_agent workspace."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path("/home/user/projects/agent_setup")
WORKSPACE = ROOT / "codex_agent"
MAX_BYTES = 5 * 1024 * 1024


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)


def rel_to_workspace(path: Path) -> bool:
    try:
        path.resolve().relative_to(WORKSPACE.resolve())
        return True
    except Exception:
        return False


def main() -> int:
    proc = run(["git", "diff", "--cached", "--name-only", "-z"])
    if proc.returncode != 0:
        print(proc.stderr.strip(), file=sys.stderr)
        return proc.returncode

    entries = [Path(p) for p in proc.stdout.split("\0") if p]
    problems: list[tuple[int, str]] = []

    for rel in entries:
        abs_path = ROOT / rel
        if not abs_path.is_file():
            continue
        if not rel_to_workspace(abs_path):
            continue
        size = abs_path.stat().st_size
        if size > MAX_BYTES:
            problems.append((size, str(rel)))

    if problems:
        print("Refusing to continue: large staged files detected in codex_agent.", file=sys.stderr)
        for size, rel in sorted(problems, reverse=True):
            print(f"- {size / (1024 * 1024):.2f} MiB  {rel}", file=sys.stderr)
        print(
            "Add a narrower .gitignore rule, move the artifact outside the repo, or explicitly change the threshold in scripts/git_guard_large_files.py.",
            file=sys.stderr,
        )
        return 2

    print("Large-file guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
