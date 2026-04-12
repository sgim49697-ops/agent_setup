# compare_scorecards.py - 하네스별 3-layer 평가 결과를 비교한다.

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


def load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    root = Path(__file__).resolve().parents[1]

    # ── 통합 평가 리포트 (evaluation_report.json) ──
    print("## 통합 평가 (L1 + L2 + L3)")
    print()
    print("| harness | L1 smoke | L2 build | L3 subj | FINAL | smoke rate | files | lines | bundle KB |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")

    for harness in HARNESSES:
        harness_dir = root / harness
        report = load_json(harness_dir / "reports" / "evaluation_report.json")

        if report is None:
            print(f"| {harness} | - | - | - | - | - | - | - | - |")
            continue

        f = report.get("final", {})
        l1 = report.get("l1_playwright", {})
        l2 = report.get("l2_quantitative", {})

        smoke_rate = f"{l1.get('smoke_passed', 0)}/{l1.get('smoke_total', 0)}"
        bundle_kb = round(l2.get("bundle_bytes", 0) / 1024, 1)

        print(
            f"| {harness} "
            f"| {f.get('l1_smoke_score', '-')} "
            f"| {f.get('l2_build_score', '-')} "
            f"| {f.get('l3_subjective_score', '-')} "
            f"| **{f.get('final_score', '-')}** "
            f"| {smoke_rate} "
            f"| {l2.get('source_files', '-')} "
            f"| {l2.get('source_lines', '-')} "
            f"| {bundle_kb} |"
        )

    # ── L3 상세 (기존 scorecard) ──
    print()
    print("## L3 상세 (주관 scorecard)")
    print()
    print("| harness | overall | task | ux | visual | responsive | a11y | process |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")

    for harness in HARNESSES:
        scorecard = load_json(root / harness / "reports" / "scorecard.json")
        if scorecard is None:
            print(f"| {harness} | - | - | - | - | - | - | - |")
            continue
        print(
            f"| {harness} | {scorecard.get('overall_score', '-')} | "
            f"{scorecard.get('task_success', '-')} | {scorecard.get('ux_score', '-')} | "
            f"{scorecard.get('visual_quality', '-')} | {scorecard.get('responsiveness', '-')} | "
            f"{scorecard.get('a11y_score', '-')} | {scorecard.get('process_adherence', '-')} |"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
