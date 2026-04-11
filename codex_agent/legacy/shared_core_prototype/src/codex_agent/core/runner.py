# runner.py - 실험 실행 수명주기와 CLI 진입점용 코어

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from codex_agent.core.evaluator import Evaluator
from codex_agent.core.registry import ArchitectureRegistry
from codex_agent.core.result import RunRecord
from codex_agent.core.scenario import Scenario
from codex_agent.core.storage import ExperimentStorage


def _load_yaml(path: Path) -> dict[str, Any]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise ValueError(f"Expected mapping in {path}")
    return payload


def _default_project_root() -> Path:
    return Path(__file__).resolve().parents[3]


@dataclass(slots=True)
class RunConfig:
    architecture: str
    scenario_id: str
    model_profile: str
    model_settings: dict[str, Any]
    execution_mode: str
    command: str
    timeout_seconds: int
    budgets: dict[str, Any]
    repeat_index: int
    label: str | None
    run_id: str
    run_dir: str
    project_root: str
    keep_prompt_bundle: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ExperimentRunner:
    def __init__(self, project_root: Path | None = None):
        self.project_root = (project_root or _default_project_root()).resolve()
        self.global_config = _load_yaml(self.project_root / "configs" / "global.yaml")
        self.model_config = _load_yaml(self.project_root / "configs" / "models.yaml")

        paths = self.global_config.get("paths", {})
        runs_dir = self.project_root / paths.get("runs_dir", "runs")

        self.storage = ExperimentStorage(self.project_root, runs_dir)
        self.registry = ArchitectureRegistry(self.project_root, self.storage)
        self.evaluator = Evaluator(
            weights=self.global_config.get("evaluation", {}).get("weights", {}),
            budgets=self.global_config.get("budgets", {}),
            failure_taxonomy=self.global_config.get("evaluation", {}).get("failure_taxonomy", []),
        )

    def available_architectures(self) -> list[str]:
        return self.registry.names()

    def available_scenarios(self) -> list[str]:
        scenario_root = self._scenario_root()
        return sorted(path.name for path in scenario_root.iterdir() if path.is_dir())

    def load_scenario(self, scenario_id: str) -> Scenario:
        scenario_dir = self._scenario_root() / scenario_id
        if not scenario_dir.exists():
            available = ", ".join(self.available_scenarios())
            raise FileNotFoundError(f"Scenario '{scenario_id}' not found. Available: {available}")
        return Scenario.from_directory(scenario_dir)

    def build_run_config(
        self,
        architecture: str,
        scenario_id: str,
        repeat_index: int = 1,
        model_profile: str | None = None,
        label: str | None = None,
        overrides: dict[str, Any] | None = None,
    ) -> RunConfig:
        overrides = overrides or {}
        execution = self.global_config.get("execution", {})
        budgets = dict(self.global_config.get("budgets", {}))
        budgets.update(overrides.get("budgets", {}))

        selected_profile = model_profile or self.model_config.get("default_profile", "balanced")
        model_settings = dict(self.model_config.get("profiles", {}).get(selected_profile, {}))
        run_id = self._make_run_id(architecture, scenario_id, repeat_index, label)
        run_dir = self.storage.prepare_run_dir(run_id)

        return RunConfig(
            architecture=architecture,
            scenario_id=scenario_id,
            model_profile=selected_profile,
            model_settings=model_settings,
            execution_mode=str(overrides.get("execution_mode", execution.get("mode", "simulate"))),
            command=str(overrides.get("command", execution.get("command", ""))),
            timeout_seconds=int(overrides.get("timeout_seconds", execution.get("timeout_seconds", 900))),
            budgets=budgets,
            repeat_index=repeat_index,
            label=label,
            run_id=run_id,
            run_dir=str(run_dir),
            project_root=str(self.project_root),
            keep_prompt_bundle=bool(overrides.get("keep_prompt_bundle", execution.get("keep_prompt_bundle", True))),
            metadata=dict(overrides.get("metadata", {})),
        )

    def run(
        self,
        architecture: str,
        scenario_id: str,
        repeat: int = 1,
        model_profile: str | None = None,
        label: str | None = None,
        overrides: dict[str, Any] | None = None,
    ) -> list[RunRecord]:
        scenario = self.load_scenario(scenario_id)
        adapter = self.registry.create(architecture)
        records: list[RunRecord] = []

        for repeat_index in range(1, repeat + 1):
            config = self.build_run_config(
                architecture=architecture,
                scenario_id=scenario_id,
                repeat_index=repeat_index,
                model_profile=model_profile,
                label=label,
                overrides=overrides,
            )
            result = adapter.run(scenario, config)
            scorecard = self.evaluator.evaluate(result, scenario)
            record = self.storage.persist_run(result, scorecard, scenario, config.to_dict(), config.model_profile)
            records.append(record)
        return records

    def resume(
        self,
        architecture: str,
        run_id: str,
        model_profile: str | None = None,
        overrides: dict[str, Any] | None = None,
    ) -> RunRecord:
        adapter = self.registry.create(architecture)
        resumed_result = adapter.resume(run_id)
        scenario = self.load_scenario(resumed_result.scenario_id)
        resumed_config = self.build_run_config(
            architecture=architecture,
            scenario_id=resumed_result.scenario_id,
            repeat_index=1,
            model_profile=model_profile,
            label=f"resume-{run_id}",
            overrides=overrides,
        )
        resumed_result.run_id = resumed_config.run_id
        scorecard = self.evaluator.evaluate(resumed_result, scenario)
        return self.storage.persist_run(
            resumed_result,
            scorecard,
            scenario,
            resumed_config.to_dict(),
            resumed_config.model_profile,
        )

    def _scenario_root(self) -> Path:
        path_value = self.global_config.get("paths", {}).get("scenarios_dir", "src/codex_agent/scenarios")
        return self.project_root / path_value

    @staticmethod
    def _make_run_id(architecture: str, scenario_id: str, repeat_index: int, label: str | None) -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        suffix = f"-{label}" if label else ""
        return f"{timestamp}-{architecture}-{scenario_id}-r{repeat_index}{suffix}"
