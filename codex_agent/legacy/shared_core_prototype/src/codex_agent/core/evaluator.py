# evaluator.py - 공통 점수 산정과 failure taxonomy 계산

from __future__ import annotations

from typing import Any

from codex_agent.core.result import RunResult, ScoreCard
from codex_agent.core.scenario import Scenario


def _clamp_percent(value: float) -> float:
    return max(0.0, min(100.0, value))


class Evaluator:
    def __init__(self, weights: dict[str, float], budgets: dict[str, Any], failure_taxonomy: list[str]):
        self.weights = weights
        self.budgets = budgets
        self.failure_taxonomy = failure_taxonomy

    def evaluate(self, run_result: RunResult, scenario: Scenario) -> ScoreCard:
        objective = dict(run_result.metrics.get("objective", {}))
        judge = dict(run_result.metrics.get("judge", {}))

        task_success = self._score_task_success(run_result, scenario, objective)
        requirement_coverage = self._score_requirement_coverage(scenario, objective, judge)
        regression_score = self._score_regression(objective)
        efficiency_score = self._score_efficiency(objective)
        process_score = self._score_process(run_result, scenario, objective, judge)

        overall_score = _clamp_percent(
            task_success * self.weights.get("task_success", 0.0)
            + requirement_coverage * self.weights.get("requirement_coverage", 0.0)
            + regression_score * self.weights.get("regression_score", 0.0)
            + efficiency_score * self.weights.get("efficiency_score", 0.0)
            + process_score * self.weights.get("process_score", 0.0)
        )

        failure_taxonomy = self._derive_failures(objective)
        notes = self._build_notes(run_result, scenario, objective, judge, overall_score)

        return ScoreCard(
            task_success=task_success,
            requirement_coverage=requirement_coverage,
            regression_score=regression_score,
            efficiency_score=efficiency_score,
            process_score=process_score,
            overall_score=overall_score,
            objective_metrics=objective,
            judge_metrics=judge,
            failure_taxonomy=failure_taxonomy,
            notes=notes,
        )

    def _score_task_success(self, run_result: RunResult, scenario: Scenario, objective: dict[str, Any]) -> float:
        required_artifacts = scenario.required_artifacts()
        acceptance_total = max(1, len(scenario.acceptance_tests))
        artifacts_present = sum(1 for artifact in required_artifacts if artifact in run_result.artifacts)
        artifact_ratio = 1.0 if not required_artifacts else artifacts_present / len(required_artifacts)
        passed_acceptance = objective.get("passed_acceptance_tests", acceptance_total)
        acceptance_ratio = max(0.0, min(1.0, passed_acceptance / acceptance_total))
        status_ratio = 1.0 if run_result.status == "completed" else 0.6 if run_result.status == "resumed" else 0.2
        return _clamp_percent(((artifact_ratio + acceptance_ratio + status_ratio) / 3.0) * 100.0)

    def _score_requirement_coverage(
        self,
        scenario: Scenario,
        objective: dict[str, Any],
        judge: dict[str, Any],
    ) -> float:
        required_total = max(1, len(scenario.required_requirements()))
        optional_total = max(1, len(scenario.optional_requirements()))
        required_met = min(required_total, int(objective.get("required_requirements_met", required_total)))
        optional_met = min(optional_total, int(objective.get("optional_requirements_met", optional_total)))
        explanation_score = float(judge.get("ambiguity_resolution", 0.6))

        required_ratio = required_met / required_total
        optional_ratio = optional_met / optional_total
        combined = required_ratio * 0.7 + optional_ratio * 0.15 + explanation_score * 0.15
        return _clamp_percent(combined * 100.0)

    def _score_regression(self, objective: dict[str, Any]) -> float:
        penalty = (
            float(objective.get("failed_regression_tests", 0)) * 18.0
            + float(objective.get("forbidden_writes", 0)) * 20.0
            + float(objective.get("parse_failures", 0)) * 15.0
            + float(objective.get("premature_done", 0)) * 20.0
        )
        base = 100.0 - penalty
        return _clamp_percent(base)

    def _score_efficiency(self, objective: dict[str, Any]) -> float:
        runtime_budget = max(1.0, float(self.budgets.get("runtime_seconds", 1800)))
        call_budget = max(1.0, float(self.budgets.get("model_calls", 12)))
        token_budget = max(1.0, float(self.budgets.get("token_budget", 50000)))
        replan_budget = max(1.0, float(self.budgets.get("replans", 3)))
        retry_budget = max(1.0, float(self.budgets.get("retries", 4)))

        runtime_ratio = min(1.0, float(objective.get("runtime_seconds", runtime_budget)) / runtime_budget)
        call_ratio = min(1.0, float(objective.get("model_calls", call_budget)) / call_budget)
        token_ratio = min(1.0, float(objective.get("token_estimate", token_budget)) / token_budget)
        replan_ratio = min(1.0, float(objective.get("replans", 0)) / replan_budget)
        retry_ratio = min(1.0, float(objective.get("retries", 0)) / retry_budget)

        score = 100.0 - (
            runtime_ratio * 35.0
            + call_ratio * 25.0
            + token_ratio * 20.0
            + replan_ratio * 10.0
            + retry_ratio * 10.0
        )
        parallel_bonus = min(10.0, float(objective.get("parallel_workers", 1)) - 1.0)
        return _clamp_percent(score + parallel_bonus)

    def _score_process(
        self,
        run_result: RunResult,
        scenario: Scenario,
        objective: dict[str, Any],
        judge: dict[str, Any],
    ) -> float:
        plan_quality = float(judge.get("plan_quality", 0.6))
        verification_quality = float(judge.get("verification_quality", 0.6))
        requirement_alignment = float(judge.get("requirement_alignment", 0.6))
        code_quality = float(judge.get("code_quality", 0.6))
        review_catches = min(1.0, float(objective.get("evaluation_catches", 0)) / 3.0)
        resume_bonus = 0.1 if run_result.architecture == "long_horizon" and objective.get("resume_consistency", 0) else 0.0
        expected_phases = len(scenario.rubric.get("scoring", {}).get("process_expectations", []))
        phase_bonus = min(0.1, expected_phases * 0.02)

        score = (
            plan_quality * 0.25
            + verification_quality * 0.25
            + requirement_alignment * 0.20
            + code_quality * 0.20
            + review_catches * 0.10
            + resume_bonus
            + phase_bonus
        )
        return _clamp_percent(score * 100.0)

    def _derive_failures(self, objective: dict[str, Any]) -> dict[str, int]:
        mapping = {
            "localization_failure": int(objective.get("localization_failures", 0)),
            "wrong_assumption": int(objective.get("wrong_assumptions", 0)),
            "weak_verification": int(objective.get("weak_verification", 0)),
            "integration_failure": int(objective.get("integration_failures", 0)),
            "premature_done": int(objective.get("premature_done", 0)),
        }
        return {key: mapping.get(key, 0) for key in self.failure_taxonomy}

    def _build_notes(
        self,
        run_result: RunResult,
        scenario: Scenario,
        objective: dict[str, Any],
        judge: dict[str, Any],
        overall_score: float,
    ) -> list[str]:
        notes = list(run_result.judge_notes)
        notes.append(f"Scenario goal: {scenario.goal}")
        notes.append(f"Runtime: {objective.get('runtime_seconds', 'n/a')} seconds")
        notes.append(f"Model calls: {objective.get('model_calls', 'n/a')}")
        notes.append(f"Plan quality: {judge.get('plan_quality', 'n/a')}")
        if overall_score >= 80:
            notes.append("This run is strong enough to serve as a baseline candidate.")
        elif overall_score >= 65:
            notes.append("This run is viable, but the architecture still needs targeted tuning.")
        else:
            notes.append("This run needs follow-up before using it as a production default.")
        return notes
