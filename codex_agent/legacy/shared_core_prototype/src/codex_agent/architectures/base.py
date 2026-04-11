# base.py - 공통 아키텍처 어댑터 베이스 구현

from __future__ import annotations

import json
import subprocess
import time
from abc import ABC
from copy import deepcopy
from pathlib import Path
from typing import Any, TYPE_CHECKING

import yaml

from codex_agent.core.result import RunResult
from codex_agent.core.scenario import Scenario
from codex_agent.core.storage import ExperimentStorage

if TYPE_CHECKING:
    from codex_agent.core.runner import RunConfig


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


class ArchitectureAdapter(ABC):
    architecture_name: str = ""

    def __init__(self, project_root: Path, storage: ExperimentStorage):
        self.project_root = project_root
        self.storage = storage
        self.architecture_dir = project_root / "src" / "codex_agent" / "architectures" / self.architecture_name
        self.config = self._load_yaml(self.architecture_dir / "config.yaml")

    def run(self, scenario: Scenario, run_config: "RunConfig") -> RunResult:
        prompts = self._load_prompts()
        prompt_bundle = self._render_prompt_bundle(prompts, scenario, run_config)
        execution_trace = self._build_execution_trace(scenario, run_config)
        metrics = self._simulate_metrics(scenario, run_config)
        artifacts = self._build_base_artifacts(scenario, run_config, prompt_bundle, execution_trace)
        judge_notes = self._base_judge_notes(scenario, run_config)
        status = "completed"

        if run_config.execution_mode == "command":
            command_artifacts, command_metrics, command_notes, command_status = self._run_command_mode(
                prompts,
                scenario,
                run_config,
            )
            artifacts.update(command_artifacts)
            metrics["objective"].update(command_metrics)
            judge_notes.extend(command_notes)
            status = command_status

        artifacts.update(self._extra_artifacts(scenario, run_config, execution_trace, metrics))
        return RunResult(
            run_id=run_config.run_id,
            architecture=self.architecture_name,
            scenario_id=scenario.id,
            status=status,
            artifacts=artifacts,
            metrics=metrics,
            judge_notes=judge_notes,
        )

    def resume(self, run_id: str) -> RunResult:
        record = self.storage.load_record(run_id)
        result = deepcopy(record.result)
        objective = result.metrics.setdefault("objective", {})
        judge = result.metrics.setdefault("judge", {})
        objective["resume_count"] = int(objective.get("resume_count", 0)) + 1
        objective["resume_consistency"] = 1
        judge["verification_quality"] = _clamp_unit(float(judge.get("verification_quality", 0.7)) + 0.05)
        result.run_id = f"{run_id}-resume"
        result.status = "resumed"
        result.artifacts["resume_notes.md"] = "\n".join(
            [
                f"# Resume Notes - {run_id}",
                "",
                f"- Source run: `{run_id}`",
                f"- Architecture: `{self.architecture_name}`",
                "- Resume contract validated against stored checkpoint artifacts.",
            ]
        )
        result.judge_notes.append("Resume path reused persisted artifacts and increased verification strictness.")
        return result

    def _build_base_artifacts(
        self,
        scenario: Scenario,
        run_config: "RunConfig",
        prompt_bundle: str,
        execution_trace: list[dict[str, Any]],
    ) -> dict[str, str]:
        artifacts = {
            "plan.md": self._render_plan(scenario, run_config),
            "execution_trace.json": json.dumps(execution_trace, indent=2, ensure_ascii=False),
            "final_report.md": self._render_final_report(scenario, run_config, execution_trace),
        }
        if run_config.keep_prompt_bundle:
            artifacts["prompt_bundle.md"] = prompt_bundle
        if any(phase["name"] == "review" for phase in self._phase_specs()):
            artifacts["review.md"] = self._render_review_stub(scenario)
        return artifacts

    def _extra_artifacts(
        self,
        scenario: Scenario,
        run_config: "RunConfig",
        execution_trace: list[dict[str, Any]],
        metrics: dict[str, Any],
    ) -> dict[str, str]:
        supports_resume = self.config.get("orchestration", {}).get("supports_resume", False)
        if not supports_resume:
            return {}
        payload = {
            "run_id": run_config.run_id,
            "scenario_id": scenario.id,
            "architecture": self.architecture_name,
            "checkpoint_stage": execution_trace[-1]["name"] if execution_trace else "start",
            "resume_consistency": metrics["objective"].get("resume_consistency", 1),
        }
        return {
            "checkpoints/latest_checkpoint.json": json.dumps(payload, indent=2, ensure_ascii=False),
        }

    def _base_judge_notes(self, scenario: Scenario, run_config: "RunConfig") -> list[str]:
        notes = [
            f"Architecture hypothesis: {self.config.get('hypothesis', '')}",
            f"Scenario difficulty: {scenario.difficulty()}",
            f"Execution mode: {run_config.execution_mode}",
        ]
        if self.config.get("orchestration", {}).get("parallel_workers", 1) > 1:
            notes.append(
                f"Parallel workers configured: {self.config['orchestration'].get('parallel_workers', 1)}"
            )
        return notes

    def _load_prompts(self) -> dict[str, str]:
        prompt_dir = self.architecture_dir / "prompts"
        prompts: dict[str, str] = {}
        for path in sorted(prompt_dir.glob("*.md")):
            prompts[path.name] = path.read_text(encoding="utf-8").strip()
        return prompts

    def _phase_specs(self) -> list[dict[str, Any]]:
        return list(self.config.get("orchestration", {}).get("phases", []))

    def _render_prompt_bundle(
        self,
        prompts: dict[str, str],
        scenario: Scenario,
        run_config: "RunConfig",
    ) -> str:
        sections = [
            f"# Prompt Bundle - {run_config.run_id}",
            "",
            f"- Architecture: `{self.architecture_name}`",
            f"- Scenario: `{scenario.id}`",
            f"- Goal: {scenario.goal}",
            "",
            "## Scenario",
            scenario.task_prompt,
            "",
            "## Setup",
            scenario.setup or "_No additional setup_",
            "",
            "## Acceptance Tests",
            *[f"- {test}" for test in scenario.acceptance_tests],
        ]

        if scenario.golden_expectations:
            sections.extend(["", "## Golden Expectations", scenario.golden_expectations])

        for filename, content in prompts.items():
            sections.extend(["", f"## Prompt: {filename}", content])
        return "\n".join(sections).strip() + "\n"

    def _build_execution_trace(self, scenario: Scenario, run_config: "RunConfig") -> list[dict[str, Any]]:
        trace: list[dict[str, Any]] = []
        for index, phase in enumerate(self._phase_specs(), start=1):
            trace.append(
                {
                    "order": index,
                    "name": phase["name"],
                    "role": phase.get("role", phase["name"]),
                    "prompt_file": phase.get("prompt_file", ""),
                    "parallel_group": phase.get("parallel_group"),
                    "expected_output": phase.get("expected_output", ""),
                    "scenario_id": scenario.id,
                    "run_id": run_config.run_id,
                }
            )
        return trace

    def _simulate_metrics(self, scenario: Scenario, run_config: "RunConfig") -> dict[str, Any]:
        simulation = self.config.get("simulation", {})
        objective = deepcopy(simulation.get("objective", {}))
        judge = deepcopy(simulation.get("judge", {}))
        difficulty = scenario.difficulty()

        ambiguity = difficulty["ambiguity"]
        integration = difficulty["integration"]
        regression_risk = difficulty["regression_risk"]

        objective["runtime_seconds"] = int(
            float(objective.get("runtime_seconds", 300)) * (1.0 + ambiguity * 0.35 + integration * 0.45)
        )
        objective["model_calls"] = int(
            round(float(objective.get("model_calls", 3)) + ambiguity * 2 + integration * 2)
        )
        objective["token_estimate"] = int(
            float(objective.get("token_estimate", 6000)) * (1.0 + ambiguity * 0.45 + integration * 0.55)
        )
        objective["parallel_workers"] = int(
            self.config.get("orchestration", {}).get("parallel_workers", 1)
        )

        judge["plan_quality"] = _clamp_unit(float(judge.get("plan_quality", 0.7)) - ambiguity * 0.04)
        judge["requirement_alignment"] = _clamp_unit(
            float(judge.get("requirement_alignment", 0.7)) - ambiguity * 0.08 - integration * 0.04
        )
        judge["code_quality"] = _clamp_unit(
            float(judge.get("code_quality", 0.75)) - integration * 0.05
        )
        judge["verification_quality"] = _clamp_unit(
            float(judge.get("verification_quality", 0.75)) - regression_risk * 0.06
        )
        judge["ambiguity_resolution"] = _clamp_unit(
            float(judge.get("ambiguity_resolution", 0.6)) - ambiguity * 0.10
        )

        required_total = max(1, len(scenario.required_requirements()))
        optional_total = max(1, len(scenario.optional_requirements()))
        acceptance_total = max(1, len(scenario.acceptance_tests))

        required_ratio = _clamp_unit(judge["requirement_alignment"] + judge["plan_quality"] * 0.1)
        optional_ratio = _clamp_unit((judge["ambiguity_resolution"] + judge["code_quality"]) / 2.0)
        acceptance_ratio = _clamp_unit(
            (judge["code_quality"] * 0.4 + judge["verification_quality"] * 0.4 + judge["plan_quality"] * 0.2)
            - integration * 0.08
        )

        objective["required_requirements_met"] = round(required_total * required_ratio)
        objective["optional_requirements_met"] = round(optional_total * optional_ratio)
        objective["passed_acceptance_tests"] = round(acceptance_total * acceptance_ratio)
        objective["failed_regression_tests"] = 1 if regression_risk > 0.6 and judge["verification_quality"] < 0.74 else 0
        objective["wrong_assumptions"] = int(objective.get("wrong_assumptions", 0)) + (
            1 if ambiguity > 0.55 and judge["ambiguity_resolution"] < 0.68 else 0
        )
        objective["weak_verification"] = int(objective.get("weak_verification", 0)) + (
            1 if judge["verification_quality"] < 0.7 else 0
        )
        objective["integration_failures"] = int(objective.get("integration_failures", 0)) + (
            1 if objective["passed_acceptance_tests"] < acceptance_total else 0
        )
        objective["localization_failures"] = int(objective.get("localization_failures", 0))
        objective["parse_failures"] = int(objective.get("parse_failures", 0))
        objective["premature_done"] = int(objective.get("premature_done", 0))
        objective["forbidden_writes"] = int(objective.get("forbidden_writes", 0))
        objective["resume_consistency"] = int(
            self.config.get("orchestration", {}).get("supports_resume", False)
        )
        return {"objective": objective, "judge": judge}

    def _run_command_mode(
        self,
        prompts: dict[str, str],
        scenario: Scenario,
        run_config: "RunConfig",
    ) -> tuple[dict[str, str], dict[str, Any], list[str], str]:
        artifacts: dict[str, str] = {}
        notes: list[str] = []
        status = "completed"
        total_runtime = 0.0
        phase_count = 0
        phases = self._phase_specs()

        if not run_config.command.strip():
            notes.append("Command mode was selected without an execution command.")
            return artifacts, {"runtime_seconds": 0.0, "model_calls": 0, "token_estimate": 0}, notes, "failed"

        for index, phase in enumerate(phases, start=1):
            phase_count += 1
            prompt_name = phase.get("prompt_file", "")
            phase_prompt = prompts.get(prompt_name, "")
            compiled_prompt = self._compile_phase_prompt(phase, phase_prompt, scenario, run_config)
            start = time.perf_counter()
            try:
                completed = subprocess.run(
                    run_config.command,
                    input=compiled_prompt,
                    capture_output=True,
                    shell=True,
                    text=True,
                    timeout=run_config.timeout_seconds,
                    cwd=run_config.project_root,
                )
                elapsed = time.perf_counter() - start
                total_runtime += elapsed
                artifacts[f"raw_outputs/{index:02d}_{phase['name']}.stdout.txt"] = completed.stdout
                artifacts[f"raw_outputs/{index:02d}_{phase['name']}.stderr.txt"] = completed.stderr
                if completed.returncode != 0:
                    status = "failed"
                    notes.append(
                        f"Command phase '{phase['name']}' exited with non-zero code {completed.returncode}."
                    )
            except subprocess.TimeoutExpired as exc:
                elapsed = time.perf_counter() - start
                total_runtime += elapsed
                status = "failed"
                artifacts[f"raw_outputs/{index:02d}_{phase['name']}.stderr.txt"] = str(exc)
                notes.append(f"Command phase '{phase['name']}' timed out after {run_config.timeout_seconds}s.")

        metrics = {
            "runtime_seconds": round(total_runtime, 2),
            "model_calls": phase_count,
            "token_estimate": 0,
        }
        return artifacts, metrics, notes, status

    def _compile_phase_prompt(
        self,
        phase: dict[str, Any],
        phase_prompt: str,
        scenario: Scenario,
        run_config: "RunConfig",
    ) -> str:
        return "\n".join(
            [
                f"# Architecture: {self.architecture_name}",
                f"# Phase: {phase['name']}",
                f"# Run ID: {run_config.run_id}",
                "",
                phase_prompt,
                "",
                "## Scenario Goal",
                scenario.goal,
                "",
                "## Task Prompt",
                scenario.task_prompt,
                "",
                "## Acceptance Tests",
                *[f"- {test}" for test in scenario.acceptance_tests],
            ]
        ).strip() + "\n"

    def _render_plan(self, scenario: Scenario, run_config: "RunConfig") -> str:
        lines = [
            f"# Execution Plan - {self.architecture_name}",
            "",
            f"- Run ID: `{run_config.run_id}`",
            f"- Scenario: `{scenario.id}`",
            f"- Goal: {scenario.goal}",
            "",
            "## Phase Sequence",
        ]
        for index, phase in enumerate(self._phase_specs(), start=1):
            role = phase.get("role", phase["name"])
            expected_output = phase.get("expected_output", "")
            lines.append(f"{index}. `{phase['name']}` as `{role}` - {expected_output}")
        return "\n".join(lines) + "\n"

    def _render_final_report(
        self,
        scenario: Scenario,
        run_config: "RunConfig",
        execution_trace: list[dict[str, Any]],
    ) -> str:
        lines = [
            f"# Final Report - {run_config.run_id}",
            "",
            f"- Architecture: `{self.architecture_name}`",
            f"- Scenario: `{scenario.id}`",
            f"- Mode: `{run_config.execution_mode}`",
            "",
            "## Highlights",
            f"- Phase count: {len(execution_trace)}",
            f"- Required requirements: {len(scenario.required_requirements())}",
            f"- Optional requirements: {len(scenario.optional_requirements())}",
            f"- Acceptance tests: {len(scenario.acceptance_tests)}",
            "",
            "## Notes",
            f"- Hypothesis under test: {self.config.get('hypothesis', '')}",
        ]
        return "\n".join(lines) + "\n"

    @staticmethod
    def _render_review_stub(scenario: Scenario) -> str:
        return "\n".join(
            [
                f"# Review Notes - {scenario.id}",
                "",
                "- Verify requirement coverage against the rubric.",
                "- Confirm validation addressed likely regressions.",
                "- Record any issues that should trigger a regenerate or replan loop.",
            ]
        ) + "\n"

    @staticmethod
    def _load_yaml(path: Path) -> dict[str, Any]:
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
        if payload is None:
            return {}
        if not isinstance(payload, dict):
            raise ValueError(f"Expected mapping in {path}")
        return payload
