# adapter.py - 매니저/워커 멀티에이전트 어댑터

from codex_agent.architectures.base import ArchitectureAdapter


class ManagerWorkersAdapter(ArchitectureAdapter):
    architecture_name = "manager_workers"
