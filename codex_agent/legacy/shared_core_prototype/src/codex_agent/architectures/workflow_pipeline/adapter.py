# adapter.py - 고정 파이프라인형 어댑터

from codex_agent.architectures.base import ArchitectureAdapter


class WorkflowPipelineAdapter(ArchitectureAdapter):
    architecture_name = "workflow_pipeline"
