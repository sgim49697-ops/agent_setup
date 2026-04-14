# test_master_loop_state.py - regression tests for default deferred harness selection
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / 'scripts'))

import master_loop_state as state_mod  # noqa: E402


class MasterLoopStateTests(unittest.TestCase):
    def test_automation_harnesses_excludes_single_agent(self) -> None:
        self.assertIn('single_agent', state_mod.DEFAULT_DEFERRED_HARNESSES)
        self.assertNotIn('single_agent', state_mod.automation_harnesses())
        self.assertEqual(state_mod.automation_harnesses()[0], 'sequential_pipeline')

    def test_preferred_remaining_harness_skips_default_deferred(self) -> None:
        state = {
            'remaining_harnesses': ['single_agent', 'sequential_pipeline', 'parallel_sections'],
            'deferred_harnesses': [],
        }
        self.assertEqual(state_mod.preferred_remaining_harness(state), 'sequential_pipeline')
        self.assertEqual(state_mod.preferred_remaining_harness(state, include_deferred=True), 'single_agent')


if __name__ == '__main__':
    unittest.main()
