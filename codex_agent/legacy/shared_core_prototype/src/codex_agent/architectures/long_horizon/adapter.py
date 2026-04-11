# adapter.py - 장기 실행형 어댑터

from codex_agent.architectures.base import ArchitectureAdapter


class LongHorizonAdapter(ArchitectureAdapter):
    architecture_name = "long_horizon"
