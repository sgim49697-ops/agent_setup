#!/usr/bin/env python3
"""Auto checkpoint/push codex_agent when loop state meaningfully changes."""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/home/user/projects/agent_setup/codex_agent")
REPO_ROOT = ROOT.parent
MASTER_STATE = ROOT / ".omx/state/master-ux-loop.json"
CHECKPOINT_STATE = ROOT / ".omx/state/git-checkpoint-state.json"
CHECKPOINT_SCRIPT = ROOT / "scripts/git_auto_checkpoint.sh"
LOG = ROOT / ".omx/logs/master-ux-benchmark-v2.log"

TRACK_KEYS = [
    "cycle",
    "project_status",
    "cycle_status",
    "current_phase",
    "remaining_harnesses",
    "last_progress_summary",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(f"[{utc_now()}] git-watchdog: {msg}\n")


def read_json(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def signature(state: dict) -> dict:
    return {key: state.get(key) for key in TRACK_KEYS}


def git_has_workspace_changes() -> bool:
    proc = subprocess.run(
        ["git", "status", "--porcelain", "--", "codex_agent"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    return bool(proc.stdout.strip())


def main() -> int:
    if not MASTER_STATE.exists():
        log("master state missing; skip git checkpoint")
        return 0

    state = read_json(MASTER_STATE)
    current = signature(state)
    previous = read_json(CHECKPOINT_STATE).get("signature")

    if current == previous:
        log("no tracked state change; skip git checkpoint")
        return 0

    if not git_has_workspace_changes():
        write_json(CHECKPOINT_STATE, {"signature": current, "updated_at": utc_now()})
        log("state changed but no git changes under codex_agent; signature advanced only")
        return 0

    msg = (
        f"Auto checkpoint cycle={state.get('cycle')} "
        f"phase={state.get('current_phase')} "
        f"status={state.get('cycle_status')}"
    )
    proc = subprocess.run(
        ["bash", str(CHECKPOINT_SCRIPT), "--push", "--message", msg],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )

    if proc.returncode != 0:
        log(f"git checkpoint failed: {proc.stderr.strip() or proc.stdout.strip()}")
        return proc.returncode

    write_json(CHECKPOINT_STATE, {"signature": current, "updated_at": utc_now()})
    log(f"git checkpoint committed+pushed ({msg})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
