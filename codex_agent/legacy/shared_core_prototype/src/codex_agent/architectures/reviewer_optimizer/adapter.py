# adapter.py - 구현자/검증자 분리형 어댑터

from codex_agent.architectures.base import ArchitectureAdapter


class ReviewerOptimizerAdapter(ArchitectureAdapter):
    architecture_name = "reviewer_optimizer"
