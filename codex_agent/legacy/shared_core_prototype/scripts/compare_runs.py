# compare_runs.py - 저장된 실행 결과를 집계 비교하는 CLI

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from codex_agent.core.runner import ExperimentRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Compare saved codex_agent runs.")
    parser.add_argument("--architecture", help="Filter by architecture name.")
    parser.add_argument("--scenario", help="Filter by scenario id.")
    parser.add_argument("--latest", type=int, help="Only include the latest N runs after filtering.")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of markdown table.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    runner = ExperimentRunner(PROJECT_ROOT)
    records = runner.storage.list_records()

    if args.architecture:
        records = [record for record in records if record.architecture == args.architecture]
    if args.scenario:
        records = [record for record in records if record.scenario_id == args.scenario]
    if args.latest:
        records = sorted(records, key=lambda record: record.created_at, reverse=True)[: args.latest]

    grouped: dict[tuple[str, str], list] = defaultdict(list)
    for record in records:
        grouped[(record.architecture, record.scenario_id)].append(record)

    rows = []
    for (architecture, scenario_id), bucket in sorted(grouped.items()):
        overall = [record.scorecard.overall_score for record in bucket]
        runtimes = [float(record.scorecard.objective_metrics.get("runtime_seconds", 0)) for record in bucket]
        model_calls = [float(record.scorecard.objective_metrics.get("model_calls", 0)) for record in bucket]
        rows.append(
            {
                "architecture": architecture,
                "scenario": scenario_id,
                "runs": len(bucket),
                "avg_overall": round(statistics.mean(overall), 2),
                "avg_runtime": round(statistics.mean(runtimes), 2),
                "avg_model_calls": round(statistics.mean(model_calls), 2),
            }
        )

    if args.json:
        print(json.dumps(rows, indent=2, ensure_ascii=False))
        return 0

    if not rows:
        print("No runs found.")
        return 0

    print("| architecture | scenario | runs | avg_overall | avg_runtime | avg_model_calls |")
    print("| --- | --- | ---: | ---: | ---: | ---: |")
    for row in rows:
        print(
            f"| {row['architecture']} | {row['scenario']} | {row['runs']} | "
            f"{row['avg_overall']:.2f} | {row['avg_runtime']:.2f} | {row['avg_model_calls']:.2f} |"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
