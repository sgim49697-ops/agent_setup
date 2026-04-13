#!/usr/bin/env python3
# master_loop_defer_harness.py - move a problematic harness out of the active lane without marking it complete
from __future__ import annotations

import argparse
import json
from pathlib import Path

from master_loop_state import load_state, normalize_remaining_harnesses, preferred_remaining_harness, save_state

ROOT = Path("/home/user/projects/agent_setup/codex_agent")
STATE_PATH = ROOT / ".omx/state/master-ux-loop.json"
LOG_DIR = ROOT / ".omx/logs/harness-deferred"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--harness", required=True)
    parser.add_argument("--reason", default="manual defer")
    parser.add_argument("--state", default=str(STATE_PATH))
    args = parser.parse_args()

    state_path = Path(args.state)
    previous = load_state(state_path)
    state = dict(previous)
    harness = args.harness
    reason = args.reason.strip() or "manual defer"

    remaining = normalize_remaining_harnesses(state.get("remaining_harnesses"))
    if harness not in remaining:
        return 0

    deferred = normalize_remaining_harnesses(state.get("deferred_harnesses"))
    if harness not in deferred:
        deferred.append(harness)

    reordered = [item for item in remaining if item != harness] + [harness]
    state["remaining_harnesses"] = reordered
    state["deferred_harnesses"] = deferred
    state["current_harness"] = preferred_remaining_harness(state)
    state["current_phase"] = "cycle-resume"
    state["status"] = "idle"
    state["cycle_status"] = "idle"
    state["next_cycle_required"] = True
    state["last_progress_summary"] = f"{harness} deferred: {reason}"

    save_state(state_path, state, previous=previous)

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    marker = {
        "harness": harness,
        "reason": reason,
        "remaining_harnesses_after": reordered,
        "deferred_harnesses_after": deferred,
        "next_current_harness": state["current_harness"],
    }
    marker_path = LOG_DIR / f"cycle-{state.get('cycle')}-{harness}.json"
    marker_path.write_text(json.dumps(marker, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(marker, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
