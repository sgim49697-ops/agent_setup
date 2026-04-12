#!/usr/bin/env python3
"""Utility helpers for updating and normalizing the UX master-loop state file."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HARNESSES = [
    "single_agent",
    "sequential_pipeline",
    "parallel_sections",
    "router",
    "orchestrator_worker",
    "evaluator_optimizer",
    "omx_evaluator_optimizer",
]

BOOL_FIELDS = {
    "hard_blocker",
    "next_cycle_required",
}
INT_FIELDS = {
    "cycle",
    "relaunch_count",
}
LIST_FIELDS = {
    "remaining_harnesses",
    "completed_harnesses",
}
STRING_FIELDS = {
    "status",
    "project_status",
    "cycle_status",
    "current_phase",
    "current_harness",
    "last_progress_summary",
    "blocker_reason",
    "last_launch_reason",
}
REQUIRED_STATE_FIELDS = [
    "status",
    "project_status",
    "cycle_status",
    "cycle",
    "current_phase",
    "current_harness",
    "remaining_harnesses",
    "last_progress_at",
    "last_progress_summary",
    "next_cycle_required",
    "hard_blocker",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off", "", "null", "none"}:
            return False
    return bool(value)


def parse_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def parse_jsonish(value: str) -> Any:
    text = value.strip()
    if not text:
        return text
    if text.startswith("[") or text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return value
    return value


def normalize_remaining_harnesses(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, tuple):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        text = value.strip()
        if text.lower() in {"", "[]", "null", "none"}:
            return []
        parsed = parse_jsonish(text)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
        return [item.strip() for item in text.split(",") if item.strip()]
    return [str(value).strip()] if str(value).strip() else []


def infer_current_harness(state: dict[str, Any]) -> str:
    current = str(state.get("current_harness") or "").strip()
    if current:
        return current

    phase = str(state.get("current_phase") or "").strip()
    for harness in HARNESSES:
        if harness == phase or harness in phase:
            return harness

    remaining = normalize_remaining_harnesses(state.get("remaining_harnesses"))
    if remaining:
        return remaining[0]

    return "benchmark_foundation"


def coerce_field(key: str, value: Any) -> Any:
    if isinstance(value, str):
        if value == "__true__":
            return True
        if value == "__false__":
            return False
        if value == "__null__":
            return None
        value = parse_jsonish(value)

    if key in BOOL_FIELDS:
        return parse_bool(value)
    if key in INT_FIELDS:
        return parse_int(value)
    if key in LIST_FIELDS:
        return normalize_remaining_harnesses(value)
    if key in STRING_FIELDS:
        if value is None:
            return ""
        return str(value)
    return value


def normalize_state(state: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(state)
    for key, value in list(normalized.items()):
        normalized[key] = coerce_field(key, value)

    normalized.setdefault("status", "idle")
    normalized.setdefault("project_status", "in_progress")
    normalized.setdefault("cycle_status", "idle")
    normalized.setdefault("cycle", 0)
    normalized.setdefault("current_phase", "benchmark_foundation")
    normalized.setdefault("last_progress_summary", "state initialized")
    normalized.setdefault("remaining_harnesses", HARNESSES.copy())
    normalized.setdefault("next_cycle_required", True)
    normalized.setdefault("hard_blocker", False)
    normalized.setdefault("blocker_reason", "")
    normalized["remaining_harnesses"] = normalize_remaining_harnesses(normalized.get("remaining_harnesses"))
    normalized["current_harness"] = infer_current_harness(normalized)
    return normalized


def load_state(path: Path) -> dict[str, Any]:
    if path.exists():
        return normalize_state(json.loads(path.read_text(encoding="utf-8")))
    return normalize_state({})


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = normalize_state(state)
    normalized["updated_at"] = utc_now()
    path.write_text(json.dumps(normalized, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


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
        state[key] = coerce_field(key, value)

    save_state(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
