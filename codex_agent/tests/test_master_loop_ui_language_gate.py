# test_master_loop_ui_language_gate.py - regression tests for Korean-first UI language gate heuristics
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / 'scripts'))

import master_loop_ui_language_gate as gate  # noqa: E402


class MasterLoopUiLanguageGateTests(unittest.TestCase):
    def write_state(self, root: Path) -> None:
        state_dir = root / '.omx' / 'state'
        state_dir.mkdir(parents=True, exist_ok=True)
        (state_dir / 'master-ux-loop.json').write_text(
            json.dumps(
                {
                    'status': 'running',
                    'project_status': 'in_progress',
                    'cycle_status': 'running',
                    'current_phase': 'single_agent-edit',
                    'current_harness': 'single_agent',
                    'remaining_harnesses': ['single_agent'],
                    'last_progress_at': '2026-04-14T00:00:00Z',
                    'last_progress_summary': 'test run',
                    'next_cycle_required': True,
                    'hard_blocker': False,
                }
            ),
            encoding='utf-8',
        )

    def write_source(self, root: Path, relative_path: str, content: str) -> None:
        path = root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')

    def test_scan_harness_counts_jsx_text_and_nested_component_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_state(root)
            self.write_source(
                root,
                'single_agent/app/src/components/Wizard.tsx',
                '''export function Wizard() {
  return (
    <section>
      <h1>초안 흐름</h1>
      <button>다음 단계로 이동</button>
    </section>
  )
}
''',
            )
            with patch.object(gate, 'ROOT', root):
                report = gate.scan_harness('single_agent')

        files = {entry['file'] for entry in report['files']}
        self.assertIn('single_agent/app/src/components/Wizard.tsx', files)
        self.assertGreaterEqual(report['korean_visible_strings'], 2)
        self.assertEqual(report['english_visible_strings'], 0)

    def test_scan_harness_ignores_non_visible_prop_values_and_escape_sequences(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_state(root)
            self.write_source(
                root,
                'single_agent/app/src/App.tsx',
                '''export function App() {
  const helper = "\\n"
  return (
    <main>
      <div className="shell" data-testid="panel-shell">
        <button size="medium" variant="primary" status="idle">저장하기</button>
        <span aria-label="Topic">주제</span>
      </div>
    </main>
  )
}
''',
            )
            with patch.object(gate, 'ROOT', root):
                report = gate.scan_harness('single_agent')

        self.assertEqual(report['english_visible_strings'], 0)
        self.assertGreaterEqual(report['exempt_hook_strings'], 1)
        offender_texts = [entry['text'] for entry in report['offenders']]
        self.assertNotIn('\\n', offender_texts)

    def test_scan_harness_counts_visible_english_jsx_copy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_state(root)
            self.write_source(
                root,
                'single_agent/app/src/App.tsx',
                '''export function App() {
  return (
    <main>
      <button>Next</button>
      <p>작업을 시작하세요</p>
    </main>
  )
}
''',
            )
            with patch.object(gate, 'ROOT', root):
                report = gate.scan_harness('single_agent')

        self.assertEqual(report['english_visible_strings'], 1)
        self.assertGreaterEqual(report['korean_visible_strings'], 1)


if __name__ == '__main__':
    unittest.main()
