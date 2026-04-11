# run_experiment.py - 단일 실험 실행과 resume를 위한 CLI

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from codex_agent.core.runner import ExperimentRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run codex_agent architecture experiments.")
    parser.add_argument("--architecture", help="Architecture name to run.")
    parser.add_argument("--scenario", help="Scenario id to run.")
    parser.add_argument("--repeat", type=int, default=1, help="How many repetitions to run.")
    parser.add_argument("--label", help="Optional label suffix for run ids.")
    parser.add_argument("--mode", choices=["simulate", "command"], help="Override execution mode.")
    parser.add_argument("--command", help="Command to execute in command mode.")
    parser.add_argument("--model-profile", help="Model profile from configs/models.yaml.")
    parser.add_argument("--resume-run", help="Existing run id to resume.")
    parser.add_argument("--list-architectures", action="store_true", help="List registered architectures.")
    parser.add_argument("--list-scenarios", action="store_true", help="List available scenarios.")
    parser.add_argument("--json", action="store_true", help="Print result as JSON.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    runner = ExperimentRunner(PROJECT_ROOT)

    if args.list_architectures:
        print("\n".join(runner.available_architectures()))
        return 0

    if args.list_scenarios:
        print("\n".join(runner.available_scenarios()))
        return 0

    overrides = {}
    if args.mode:
        overrides["execution_mode"] = args.mode
    if args.command:
        overrides["command"] = args.command

    if args.resume_run:
        if not args.architecture:
            parser.error("--resume-run requires --architecture")
        record = runner.resume(
            architecture=args.architecture,
            run_id=args.resume_run,
            model_profile=args.model_profile,
            overrides=overrides or None,
        )
        if args.json:
            print(json.dumps(record.to_dict(), indent=2, ensure_ascii=False))
        else:
            print(f"resumed_run_id={record.run_id}")
            print(f"run_dir={record.run_dir}")
            print(f"overall_score={record.scorecard.overall_score:.1f}")
        return 0

    if not args.architecture or not args.scenario:
        parser.error("Normal execution requires --architecture and --scenario.")

    records = runner.run(
        architecture=args.architecture,
        scenario_id=args.scenario,
        repeat=args.repeat,
        model_profile=args.model_profile,
        label=args.label,
        overrides=overrides or None,
    )

    if args.json:
        print(json.dumps([record.to_dict() for record in records], indent=2, ensure_ascii=False))
        return 0

    for record in records:
        print(f"run_id={record.run_id}")
        print(f"run_dir={record.run_dir}")
        print(f"status={record.result.status}")
        print(f"overall_score={record.scorecard.overall_score:.1f}")
        print("---")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
