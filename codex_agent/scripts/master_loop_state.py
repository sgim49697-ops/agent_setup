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
    "remaining_regression_count",
    "stagnant_cycle_count",
    "review_only_failures",
    "quality_gate_error_count",
    "quality_gate_failure_streak",
    "current_harness_cycle_streak",
}


LIST_FIELDS = {
    "remaining_harnesses",
    "completed_harnesses",
}
JSON_FIELDS = {
    "remaining_cycle_history",
    "phase_history",
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
    "quality_gate_status",
    "last_quality_gate_signature",
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
SPECIAL_HARNESSES = {
    "benchmark_foundation",
    "benchmark_cycle",
    "ux_review",
    "quality_gate",
    "multi_harness",
    "cycle-resume",
    "cycle-validation",
    "next_cycle_pending",
    "validator-recovery",
}


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


def normalize_json_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        parsed = parse_jsonish(value)
        if isinstance(parsed, list):
            return parsed
    return []


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
    if key in JSON_FIELDS:
        return normalize_json_list(value)
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
    normalized.setdefault("remaining_regression_count", 0)
    normalized.setdefault("stagnant_cycle_count", 0)
    normalized.setdefault("review_only_failures", 0)
    normalized.setdefault("quality_gate_error_count", 0)
    normalized.setdefault("quality_gate_failure_streak", 0)
    normalized.setdefault("current_harness_cycle_streak", 0)
    normalized.setdefault("remaining_cycle_history", [])
    normalized.setdefault("phase_history", [])
    normalized["remaining_harnesses"] = normalize_remaining_harnesses(normalized.get("remaining_harnesses"))
    normalized["remaining_cycle_history"] = normalize_json_list(normalized.get("remaining_cycle_history"))
    normalized["phase_history"] = normalize_json_list(normalized.get("phase_history"))
    normalized["current_harness"] = infer_current_harness(normalized)
    return normalized


def enforce_completion_guards(state: dict[str, Any]) -> None:
    remaining = normalize_remaining_harnesses(state.get("remaining_harnesses"))
    project_status = state.get("project_status")
    status = state.get("status")
    current_phase = str(state.get("current_phase") or "")
    current_harness = str(state.get("current_harness") or "")

    if project_status == "project_completed" and remaining:
        raise ValueError("cannot set project_completed while remaining_harnesses is not empty")
    if status == "completed" and project_status != "project_completed":
        raise ValueError("status=completed is reserved for project_completed")
    if project_status == "project_completed" and state.get("next_cycle_required"):
        raise ValueError("cannot keep next_cycle_required=true when project is completed")
    if project_status == "in_progress" and not current_harness:
        raise ValueError("current_harness is required while project_status=in_progress")
    if (
        project_status == "in_progress"
        and remaining
        and current_harness == "benchmark_foundation"
        and current_phase not in {"benchmark_foundation", "cycle-resume", "next_cycle_pending"}
    ):
        raise ValueError("current_harness must not reset to benchmark_foundation during active harness work")


def update_histories(previous: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    current = dict(current)
    now = utc_now()
    prev_remaining = normalize_remaining_harnesses(previous.get("remaining_harnesses"))
    curr_remaining = normalize_remaining_harnesses(current.get("remaining_harnesses"))
    prev_history = normalize_json_list(previous.get("remaining_cycle_history"))
    prev_phase_history = normalize_json_list(previous.get("phase_history"))

    snapshot = {
        "cycle": parse_int(current.get("cycle"), 0),
        "phase": str(current.get("current_phase") or ""),
        "harness": str(current.get("current_harness") or ""),
        "remaining_harnesses": curr_remaining,
        "remaining_count": len(curr_remaining),
        "last_progress_summary": str(current.get("last_progress_summary") or ""),
        "updated_at": str(current.get("last_progress_at") or current.get("updated_at") or now),
    }

    should_append_snapshot = (
        not prev_history
        or snapshot["cycle"] != prev_history[-1].get("cycle")
        or snapshot["remaining_harnesses"] != prev_history[-1].get("remaining_harnesses", [])
        or snapshot["phase"] != prev_history[-1].get("phase")
        or snapshot["harness"] != prev_history[-1].get("harness")
    )
    if should_append_snapshot:
        prev_history.append(snapshot)
    current["remaining_cycle_history"] = prev_history[-40:]

    phase_entry = {
        "cycle": snapshot["cycle"],
        "phase": snapshot["phase"],
        "harness": snapshot["harness"],
        "summary": snapshot["last_progress_summary"],
        "updated_at": snapshot["updated_at"],
    }
    if not prev_phase_history or phase_entry != prev_phase_history[-1]:
        prev_phase_history.append(phase_entry)
    current["phase_history"] = prev_phase_history[-80:]

    current_regressions = parse_int(previous.get("remaining_regression_count"), 0)
    if len(curr_remaining) > len(prev_remaining):
        current_regressions += 1
    current["remaining_regression_count"] = current_regressions

    same_count = 1
    tail = current["remaining_cycle_history"][-6:]
    for earlier in reversed(tail[:-1]):
        if earlier.get("remaining_harnesses", []) == curr_remaining:
            same_count += 1
        else:
            break
    current["stagnant_cycle_count"] = same_count

    harness_streak = 1
    harness_tail = current["remaining_cycle_history"][-12:]
    current_harness = snapshot.get("harness")
    for earlier in reversed(harness_tail[:-1]):
        if earlier.get("harness") == current_harness:
            harness_streak += 1
        else:
            break
    current["current_harness_cycle_streak"] = harness_streak

    return current


def load_state(path: Path) -> dict[str, Any]:
    if path.exists():
        return normalize_state(json.loads(path.read_text(encoding="utf-8")))
    return normalize_state({})


def save_state(path: Path, state: dict[str, Any], previous: dict[str, Any] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = normalize_state(state)
    normalized = update_histories(previous or {}, normalized)
    enforce_completion_guards(normalized)
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

    previous = load_state(state_path)
    state = dict(previous)
    for i in range(0, len(pairs), 2):
        key, value = pairs[i], pairs[i + 1]
        state[key] = coerce_field(key, value)

    save_state(state_path, state, previous=previous)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
