#!/usr/bin/env python3
"""Utility helpers for updating the UX master-loop state file."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_state(path: Path) -> dict:
    if path.exists():
      return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = utc_now()
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("usage: master_loop_state.py <state-path> <key> <value> [<key> <value> ...]", file=sys.stderr)
        return 1

    state_path = Path(argv[0])
    pairs = argv[1:]
    if len(pairs) % 2 != 0:
        print("key/value pairs must be even", file=sys.stderr)
        return 1

    state = load_state(state_path)
    for i in range(0, len(pairs), 2):
        key, value = pairs[i], pairs[i + 1]
        if value == "__true__":
            state[key] = True
        elif value == "__false__":
            state[key] = False
        elif value == "__null__":
            state[key] = None
        else:
            state[key] = value

    save_state(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
