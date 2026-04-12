#!/usr/bin/env python3
# master_loop_manual_step.py - run exactly one orchestrator step while safe mode is enabled
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from master_loop_state import load_state, normalize_remaining_harnesses, safe_mode_enabled

ROOT = Path("/home/user/projects/agent_setup/codex_agent")
STATE_PATH = ROOT / ".omx/state/master-ux-loop.json"
ORCHESTRATOR = ROOT / "scripts/master_loop_orchestrator.py"

VALID_STEPS = ["design", "critique", "ko-copy", "verify", "gates", "complete", "full"]


def resolve_harness(state: dict, explicit: str | None) -> str:
    if explicit:
        return explicit
    current = str(state.get("current_harness") or "").strip()
    if current and current not in {"benchmark_foundation", "quality_gate", "cycle-resume", "cycle-validation"}:
        return current
    remaining = normalize_remaining_harnesses(state.get("remaining_harnesses"))
    if remaining:
        return remaining[0]
    return "single_agent"


def resolve_cycle(state: dict, explicit: int | None) -> int:
    if explicit is not None:
        return explicit
    return int(state.get("cycle", 0)) or 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--step", required=True, choices=VALID_STEPS)
    parser.add_argument("--harness")
    parser.add_argument("--cycle", type=int)
    parser.add_argument("--prompt-context", default="")
    parser.add_argument("--allow-unsafe", action="store_true")
    args = parser.parse_args()

    if not safe_mode_enabled() and not args.allow_unsafe:
        print("safe mode is not enabled; refuse manual step outside safe mode (use --allow-unsafe to override)", file=sys.stderr)
        return 2

    state = load_state(STATE_PATH)
    harness = resolve_harness(state, args.harness)
    cycle = resolve_cycle(state, args.cycle)
    prompt_context = args.prompt_context or f"Manual safe-mode step {args.step} for {harness}."

    env = dict(os.environ)
    env["MASTER_LOOP_SAFE_MODE_BYPASS"] = "1"
    cmd = [
        "python3",
        str(ORCHESTRATOR),
        "--active-harness",
        harness,
        "--cycle",
        str(cycle),
        "--mode",
        args.step,
        "--prompt-context",
        prompt_context,
    ]
    proc = subprocess.run(cmd, cwd=ROOT, env=env)
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
