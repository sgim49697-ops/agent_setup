# result.py - 실행 결과와 평가 결과 데이터 모델

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class ScoreCard:
    task_success: float
    requirement_coverage: float
    regression_score: float
    efficiency_score: float
    process_score: float
    overall_score: float
    objective_metrics: dict[str, Any] = field(default_factory=dict)
    judge_metrics: dict[str, Any] = field(default_factory=dict)
    failure_taxonomy: dict[str, int] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ScoreCard":
        return cls(**payload)


@dataclass(slots=True)
class RunResult:
    run_id: str
    architecture: str
    scenario_id: str
    status: str
    artifacts: dict[str, str] = field(default_factory=dict)
    metrics: dict[str, Any] = field(default_factory=dict)
    judge_notes: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RunResult":
        return cls(**payload)


@dataclass(slots=True)
class RunRecord:
    run_id: str
    run_dir: str
    scenario_id: str
    architecture: str
    model_profile: str
    config: dict[str, Any]
    result: RunResult
    scorecard: ScoreCard
    created_at: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["result"] = self.result.to_dict()
        payload["scorecard"] = self.scorecard.to_dict()
        return payload

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RunRecord":
        return cls(
            run_id=payload["run_id"],
            run_dir=payload["run_dir"],
            scenario_id=payload["scenario_id"],
            architecture=payload["architecture"],
            model_profile=payload["model_profile"],
            config=payload["config"],
            result=RunResult.from_dict(payload["result"]),
            scorecard=ScoreCard.from_dict(payload["scorecard"]),
            created_at=payload.get("created_at", utc_now_iso()),
        )
