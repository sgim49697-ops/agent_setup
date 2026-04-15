# test_openclaw_master_loop_watchdog.py - regression tests for completion shutdown behavior
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / 'scripts'))

import openclaw_master_loop_watchdog as watchdog  # noqa: E402


class OpenclawMasterLoopWatchdogTests(unittest.TestCase):
    def test_shutdown_completion_observers_stops_timer_and_tmux_session(self) -> None:
        with patch.object(watchdog.subprocess, 'run') as subprocess_run, \
            patch.object(watchdog, 'tmux_has_session', return_value=True), \
            patch.object(watchdog, 'run') as tmux_run, \
            patch.object(watchdog, 'log') as log:
            watchdog.shutdown_completion_observers()

        subprocess_run.assert_called_once_with(
            ['systemctl', '--user', 'stop', 'ux-master-loop-watchdog.timer'],
            check=False,
            capture_output=True,
            text=True,
        )
        tmux_run.assert_called_once_with(['tmux', 'kill-session', '-t', watchdog.SESSION])
        log.assert_any_call('closed ux-master-bg tmux session after project completion')
        log.assert_any_call('stopped ux-master-loop-watchdog.timer after project completion')

    def test_shutdown_completion_observers_skips_tmux_when_session_missing(self) -> None:
        with patch.object(watchdog.subprocess, 'run') as subprocess_run, \
            patch.object(watchdog, 'tmux_has_session', return_value=False), \
            patch.object(watchdog, 'run') as tmux_run, \
            patch.object(watchdog, 'log') as log:
            watchdog.shutdown_completion_observers()

        subprocess_run.assert_called_once()
        tmux_run.assert_not_called()
        log.assert_called_once_with('stopped ux-master-loop-watchdog.timer after project completion')


if __name__ == '__main__':
    unittest.main()
