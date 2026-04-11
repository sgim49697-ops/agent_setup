# adapter.py - 자유 루프형 단일 에이전트 어댑터

from codex_agent.architectures.base import ArchitectureAdapter


class SingleLoopAdapter(ArchitectureAdapter):
    architecture_name = "single_loop"
