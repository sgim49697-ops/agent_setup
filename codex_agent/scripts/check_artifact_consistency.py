# check_artifact_consistency.py - benchmark 산출물 간 모순을 탐지한다.

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
    "omx_evaluator_optimizer",
]


def load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    problems: list[str] = []

    for harness in HARNESSES:
        base = root / harness
        run_manifest = load_json(base / "runs" / "run_manifest.json")
        artifact_index = load_json(base / "runs" / "artifact_index.json")
        scorecard = load_json(base / "reports" / "scorecard.json")
        evaluation = load_json(base / "reports" / "evaluation_report.json")

        if evaluation is None:
            problems.append(f"{harness}: missing reports/evaluation_report.json")
            continue

        final = evaluation.get("final", {})
        l1 = evaluation.get("l1_playwright", {})
        l3 = evaluation.get("l3_scorecard") or {}

        if scorecard is not None and l3.get("overall_score") != scorecard.get("overall_score"):
            problems.append(
                f"{harness}: scorecard overall ({scorecard.get('overall_score')}) "
                f"!= evaluation_report l3 overall ({l3.get('overall_score')})"
            )

        if run_manifest is not None:
            status = run_manifest.get("status")
            smoke_total = l1.get("smoke_total", 0)
            smoke_passed = l1.get("smoke_passed", 0)
            if status == "completed" and smoke_total > 0 and smoke_passed == 0:
                problems.append(f"{harness}: manifest says completed but smoke passed is 0/{smoke_total}")

        if artifact_index is not None:
            deliverables = set(artifact_index.get("deliverables", []))
            expected = {
                "runs/run_manifest.json",
                "runs/artifact_index.json",
                "reports/review_report.md",
                "reports/scorecard.json",
                "reports/evaluation_report.json",
            }
            missing = sorted(expected - deliverables)
            if missing:
                problems.append(f"{harness}: artifact_index missing deliverables {missing}")

        if final.get("final_score") is None:
            problems.append(f"{harness}: evaluation_report missing final.final_score")

    if problems:
        for item in problems:
            print(f"INCONSISTENT: {item}")
        return 1

    print("Artifact consistency checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
