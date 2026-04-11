# registry.py - 아키텍처 어댑터 레지스트리

from __future__ import annotations

from pathlib import Path

from codex_agent.architectures.long_horizon.adapter import LongHorizonAdapter
from codex_agent.architectures.manager_workers.adapter import ManagerWorkersAdapter
from codex_agent.architectures.reviewer_optimizer.adapter import ReviewerOptimizerAdapter
from codex_agent.architectures.scaffolded_single.adapter import ScaffoldedSingleAdapter
from codex_agent.architectures.single_loop.adapter import SingleLoopAdapter
from codex_agent.architectures.workflow_pipeline.adapter import WorkflowPipelineAdapter
from codex_agent.core.storage import ExperimentStorage


class ArchitectureRegistry:
    def __init__(self, project_root: Path, storage: ExperimentStorage):
        self.project_root = project_root
        self.storage = storage
        self._registry = {
            "workflow_pipeline": WorkflowPipelineAdapter,
            "single_loop": SingleLoopAdapter,
            "scaffolded_single": ScaffoldedSingleAdapter,
            "reviewer_optimizer": ReviewerOptimizerAdapter,
            "manager_workers": ManagerWorkersAdapter,
            "long_horizon": LongHorizonAdapter,
        }

    def create(self, name: str):
        try:
            adapter_cls = self._registry[name]
        except KeyError as exc:
            available = ", ".join(sorted(self._registry))
            raise KeyError(f"Unknown architecture '{name}'. Available: {available}") from exc
        return adapter_cls(self.project_root, self.storage)

    def names(self) -> list[str]:
        return sorted(self._registry)
