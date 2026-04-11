# compare_scorecards.py - 하네스별 최신 점수카드를 비교한다.

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


def load_latest_scorecard(harness_dir: Path) -> dict | None:
    candidates = sorted(harness_dir.glob("reports/**/*.json"))
    candidates += sorted(harness_dir.glob("reports/*.json"))
    if not candidates:
        return None
    latest = max(candidates, key=lambda path: path.stat().st_mtime)
    payload = json.loads(latest.read_text(encoding="utf-8"))
    payload["_source"] = str(latest.relative_to(harness_dir))
    return payload


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    print("| harness | overall | task | ux | visual | responsive | a11y | process | source |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
    for harness in HARNESSES:
        harness_dir = root / harness
        scorecard = load_latest_scorecard(harness_dir)
        if scorecard is None:
            print(f"| {harness} | - | - | - | - | - | - | - | missing |")
            continue
        print(
            f"| {harness} | {scorecard.get('overall_score', '-')} | "
            f"{scorecard.get('task_success', '-')} | {scorecard.get('ux_score', '-')} | "
            f"{scorecard.get('visual_quality', '-')} | {scorecard.get('responsiveness', '-')} | "
            f"{scorecard.get('a11y_score', '-')} | {scorecard.get('process_adherence', '-')} | "
            f"{scorecard.get('_source', '-')} |"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
