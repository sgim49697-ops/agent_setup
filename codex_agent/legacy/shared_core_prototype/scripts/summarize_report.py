# summarize_report.py - 저장된 실행 결과로 Markdown 요약 리포트를 만드는 CLI

from __future__ import annotations

import argparse
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from codex_agent.core.runner import ExperimentRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Summarize saved codex_agent runs.")
    parser.add_argument("--run-id", action="append", help="Specific run id to include. Repeat as needed.")
    parser.add_argument("--latest", type=int, help="Include latest N runs.")
    parser.add_argument("--output", help="Optional markdown file path.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    runner = ExperimentRunner(PROJECT_ROOT)
    records = runner.storage.list_records()
    records = sorted(records, key=lambda record: record.created_at, reverse=True)

    if args.run_id:
        selected = [record for record in records if record.run_id in set(args.run_id)]
    elif args.latest:
        selected = records[: args.latest]
    else:
        selected = records[:5]

    template_path = PROJECT_ROOT / runner.global_config["paths"]["report_template"]
    template = template_path.read_text(encoding="utf-8")

    if not selected:
        content = template.format(
            generated_at=datetime.now(timezone.utc).isoformat(),
            run_count=0,
            run_lines="- No runs available.",
            aggregate_lines="- No aggregates available.",
            observation_lines="- Run `scripts/run_experiment.py` first.",
        )
    else:
        run_lines = "\n".join(
            [
                f"- `{record.run_id}` | `{record.architecture}` | `{record.scenario_id}` | overall {record.scorecard.overall_score:.1f}"
                for record in selected
            ]
        )

        by_architecture: dict[str, list[float]] = {}
        for record in selected:
            by_architecture.setdefault(record.architecture, []).append(record.scorecard.overall_score)

        aggregate_lines = "\n".join(
            [
                f"- `{architecture}` average overall: {statistics.mean(scores):.1f}"
                for architecture, scores in sorted(by_architecture.items())
            ]
        )

        best = max(selected, key=lambda record: record.scorecard.overall_score)
        worst = min(selected, key=lambda record: record.scorecard.overall_score)
        observation_lines = "\n".join(
            [
                f"- Best run: `{best.run_id}` with overall {best.scorecard.overall_score:.1f}",
                f"- Weakest run: `{worst.run_id}` with overall {worst.scorecard.overall_score:.1f}",
                "- Inspect `summary.md` and `scorecard.json` inside each run directory for detailed failure taxonomy.",
            ]
        )

        content = template.format(
            generated_at=datetime.now(timezone.utc).isoformat(),
            run_count=len(selected),
            run_lines=run_lines,
            aggregate_lines=aggregate_lines,
            observation_lines=observation_lines,
        )

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(content, encoding="utf-8")
        print(output_path)
        return 0

    print(content)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
