# validate_workspace.py - codex_agent 레이아웃의 필수 파일 존재 여부를 검사한다.

from __future__ import annotations

import json
from pathlib import Path

HARNESSES = [
    "single_agent",
    "sequential_pipeline",
    "parallel_sections",
    "router",
    "orchestrator_worker",
    "evaluator_optimizer",
]

EXTRA_HARNESSES = [
    "omx_evaluator_optimizer",
]

HARNESSES += EXTRA_HARNESSES

ROOT_REQUIRED = [
    "README.md",
    "benchmark/spec.md",
    "benchmark/rubric.md",
    "benchmark/ui_contract.md",
    "benchmark/review_checklist.md",
    "benchmark/implementation_task.md",
    "benchmark/done_criteria.md",
    "scripts/compare_scorecards.py",
]

HARNESS_REQUIRED = [
    "AGENTS.md",
    "README.md",
    "harness/task.md",
    "harness/done_criteria.md",
    "harness/execution_model.md",
    "spec/spec.md",
    "spec/rubric.md",
    "spec/ui_contract.md",
    "runs/.gitkeep",
    "reports/.gitkeep",
    "app/package.json",
    "app/src/App.tsx",
]


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    missing: list[str] = []

    for relative_path in ROOT_REQUIRED:
        if not (root / relative_path).exists():
            missing.append(relative_path)

    for harness in HARNESSES:
        harness_dir = root / harness
        for relative_path in HARNESS_REQUIRED:
            full_path = harness_dir / relative_path
            if not full_path.exists():
                missing.append(f"{harness}/{relative_path}")

        package_json = harness_dir / "app/package.json"
        if package_json.exists():
            payload = json.loads(package_json.read_text(encoding="utf-8"))
            expected_name = f"@codex-agent/{harness.replace('_', '-')}-app"
            if payload.get("name") != expected_name:
                missing.append(f"{harness}/app/package.json:name != {expected_name}")

    if missing:
        for item in missing:
            print(f"MISSING: {item}")
        return 1

    print("Workspace layout looks complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
