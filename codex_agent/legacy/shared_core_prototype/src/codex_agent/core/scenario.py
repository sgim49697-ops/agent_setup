# scenario.py - 시나리오 로더와 데이터 모델

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip() if path.exists() else ""


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise ValueError(f"Expected mapping in {path}")
    return payload


def _extract_list_items(markdown: str) -> list[str]:
    items: list[str] = []
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if line.startswith(("- ", "* ")):
            items.append(line[2:].strip())
            continue
        if len(line) > 2 and line[0].isdigit():
            prefix, _, remainder = line.partition(". ")
            if prefix.isdigit() and remainder:
                items.append(remainder.strip())
    return items


@dataclass(slots=True)
class Scenario:
    id: str
    category: str
    goal: str
    repo_fixture: str
    task_prompt: str
    acceptance_tests: list[str]
    rubric: dict[str, Any]
    setup: str = ""
    golden_expectations: str = ""
    source_dir: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_directory(cls, directory: Path) -> "Scenario":
        rubric = _load_yaml(directory / "rubric.yaml")
        task_prompt = _read_text(directory / "task.md")
        setup = _read_text(directory / "setup.md")
        acceptance_tests_md = _read_text(directory / "acceptance_tests.md")
        golden_expectations = _read_text(directory / "golden_expectations.md")

        scenario_id = rubric.get("id", directory.name)
        category = rubric.get("category", "feature")
        goal = rubric.get("goal", "")
        repo_fixture = rubric.get("repo_fixture", "")
        acceptance_tests = rubric.get("acceptance_tests") or _extract_list_items(acceptance_tests_md)

        metadata = {
            "difficulty": rubric.get("difficulty", {}),
            "requirements": rubric.get("requirements", {}),
            "scoring": rubric.get("scoring", {}),
        }

        return cls(
            id=scenario_id,
            category=category,
            goal=goal,
            repo_fixture=repo_fixture,
            task_prompt=task_prompt,
            acceptance_tests=acceptance_tests,
            rubric=rubric,
            setup=setup,
            golden_expectations=golden_expectations,
            source_dir=str(directory),
            metadata=metadata,
        )

    def required_requirements(self) -> list[str]:
        requirements = self.rubric.get("requirements", {})
        return list(requirements.get("required", []))

    def optional_requirements(self) -> list[str]:
        requirements = self.rubric.get("requirements", {})
        return list(requirements.get("optional", []))

    def required_artifacts(self) -> list[str]:
        scoring = self.rubric.get("scoring", {})
        return list(scoring.get("required_artifacts", []))

    def difficulty(self) -> dict[str, float]:
        difficulty = self.rubric.get("difficulty", {})
        return {
            "ambiguity": float(difficulty.get("ambiguity", 0.0)),
            "integration": float(difficulty.get("integration", 0.0)),
            "regression_risk": float(difficulty.get("regression_risk", 0.0)),
        }
