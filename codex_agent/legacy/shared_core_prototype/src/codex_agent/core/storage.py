# storage.py - 실행 결과 저장과 로딩 담당

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from codex_agent.core.result import RunRecord, RunResult, ScoreCard
from codex_agent.core.scenario import Scenario


class ExperimentStorage:
    def __init__(self, project_root: Path, runs_dir: Path):
        self.project_root = project_root
        self.runs_dir = runs_dir
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def prepare_run_dir(self, run_id: str) -> Path:
        run_dir = self.runs_dir / run_id
        (run_dir / "artifacts").mkdir(parents=True, exist_ok=True)
        return run_dir

    def save_artifacts(self, run_dir: Path, artifacts: dict[str, str]) -> None:
        for relative_path, content in artifacts.items():
            artifact_path = run_dir / "artifacts" / relative_path
            artifact_path.parent.mkdir(parents=True, exist_ok=True)
            artifact_path.write_text(content, encoding="utf-8")

    def persist_run(
        self,
        result: RunResult,
        scorecard: ScoreCard,
        scenario: Scenario,
        config: dict[str, Any],
        model_profile: str,
    ) -> RunRecord:
        run_dir = self.prepare_run_dir(result.run_id)
        self.save_artifacts(run_dir, result.artifacts)

        manifest = {
            "run_id": result.run_id,
            "architecture": result.architecture,
            "scenario_id": result.scenario_id,
            "scenario_goal": scenario.goal,
            "model_profile": model_profile,
            "status": result.status,
            "config": config,
            "source_scenario_dir": scenario.source_dir,
        }

        self._write_json(run_dir / "manifest.json", manifest)
        self._write_json(run_dir / "result.json", result.to_dict())
        self._write_json(run_dir / "scorecard.json", scorecard.to_dict())
        self._write_text(run_dir / "summary.md", self._render_summary(result, scorecard, scenario))

        return RunRecord(
            run_id=result.run_id,
            run_dir=str(run_dir),
            scenario_id=result.scenario_id,
            architecture=result.architecture,
            model_profile=model_profile,
            config=config,
            result=result,
            scorecard=scorecard,
            created_at=result.created_at,
        )

    def load_record(self, run_id: str) -> RunRecord:
        run_dir = self.runs_dir / run_id
        if not run_dir.exists():
            raise FileNotFoundError(f"Run {run_id} not found in {self.runs_dir}")

        manifest = self._read_json(run_dir / "manifest.json")
        result = RunResult.from_dict(self._read_json(run_dir / "result.json"))
        scorecard = ScoreCard.from_dict(self._read_json(run_dir / "scorecard.json"))
        return RunRecord(
            run_id=manifest["run_id"],
            run_dir=str(run_dir),
            scenario_id=manifest["scenario_id"],
            architecture=manifest["architecture"],
            model_profile=manifest["model_profile"],
            config=manifest.get("config", {}),
            result=result,
            scorecard=scorecard,
        )

    def list_records(self) -> list[RunRecord]:
        records: list[RunRecord] = []
        for result_file in sorted(self.runs_dir.glob("*/result.json")):
            run_id = result_file.parent.name
            try:
                records.append(self.load_record(run_id))
            except FileNotFoundError:
                continue
        return records

    @staticmethod
    def _render_summary(result: RunResult, scorecard: ScoreCard, scenario: Scenario) -> str:
        return "\n".join(
            [
                f"# Run Summary - {result.run_id}",
                "",
                f"- Architecture: `{result.architecture}`",
                f"- Scenario: `{result.scenario_id}`",
                f"- Goal: {scenario.goal}",
                f"- Status: `{result.status}`",
                f"- Overall score: **{scorecard.overall_score:.1f}**",
                "",
                "## Score Breakdown",
                f"- Task success: {scorecard.task_success:.1f}",
                f"- Requirement coverage: {scorecard.requirement_coverage:.1f}",
                f"- Regression / safety: {scorecard.regression_score:.1f}",
                f"- Efficiency: {scorecard.efficiency_score:.1f}",
                f"- Process quality: {scorecard.process_score:.1f}",
                "",
                "## Notes",
                *[f"- {note}" for note in scorecard.notes],
            ]
        ).strip() + "\n"

    @staticmethod
    def _write_json(path: Path, payload: dict[str, Any]) -> None:
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    @staticmethod
    def _read_json(path: Path) -> dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _write_text(path: Path, content: str) -> None:
        path.write_text(content, encoding="utf-8")
