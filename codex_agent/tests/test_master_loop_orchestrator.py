# test_master_loop_orchestrator.py - regression tests for ko-copy ordering in bounded orchestration
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / 'scripts'))

import master_loop_orchestrator as orch  # noqa: E402


class MasterLoopOrchestratorTests(unittest.TestCase):
    def test_orchestrate_runs_ko_copy_before_critique(self) -> None:
        calls: list[str] = []
        with tempfile.TemporaryDirectory() as tmp:
            artifact_dir = Path(tmp)
            with patch.object(orch, 'cycle_dir', return_value=artifact_dir), \
                patch.object(orch, 'DESIGN_MAX_RETRIES', 0), \
                patch.object(orch, 'update_state'), \
                patch.object(orch, 'log'), \
                patch.object(orch, 'step_design', side_effect=lambda *args, **kwargs: calls.append('design') or 0), \
                patch.object(orch, 'step_ko_copy', side_effect=lambda *args, **kwargs: calls.append('ko-copy') or 0), \
                patch.object(orch, 'step_critique', side_effect=lambda *args, **kwargs: calls.append('critique') or (0, False)), \
                patch.object(orch, 'step_verify', side_effect=lambda *args, **kwargs: calls.append('verify') or 0), \
                patch.object(orch, 'step_python_gates', side_effect=lambda *args, **kwargs: calls.append('gates') or 0), \
                patch.object(orch, 'step_complete_harness', side_effect=lambda *args, **kwargs: calls.append('complete') or 0):
                rc = orch.orchestrate('single_agent', 7, 'ctx')

        self.assertEqual(calls, ['design', 'ko-copy', 'critique', 'gates'])
        self.assertEqual(rc, 23)

    def test_prompts_include_single_agent_guard_hunt_list_and_real_eval_rubric(self) -> None:
        prompt = orch.build_design_prompt('single_agent', 1, 'ctx', Path('/tmp/artifact'))
        self.assertIn('JSX text nodes', prompt)
        self.assertIn('single_agent Korean-first guard', prompt)
        self.assertIn('benchmark/real_eval_rubric.md', prompt)
        self.assertIn('디자인 완성도와 인터랙션 품질', prompt)

        ko_prompt = orch.build_ko_copy_fix_prompt('single_agent', 1, Path('/tmp/artifact'), {'ok': False})
        self.assertIn('Submit, Cancel, Loading, Next, Back, Skip, Done, Save', ko_prompt)
        self.assertIn('quoted strings AND JSX text nodes', ko_prompt)

        critique_prompt = orch.build_critique_prompt('single_agent', 1, Path('/tmp/artifact'), prior_rounds=0)
        self.assertIn('real_eval_rubric', critique_prompt)
        self.assertIn('recoverability', critique_prompt)

        verify_prompt = orch.build_verify_prompt('single_agent', 1, Path('/tmp/artifact'))
        self.assertIn('benchmark/real_eval_rubric.md', verify_prompt)
        self.assertIn('Do NOT claim a full `real_eval pass`', verify_prompt)


if __name__ == '__main__':
    unittest.main()
