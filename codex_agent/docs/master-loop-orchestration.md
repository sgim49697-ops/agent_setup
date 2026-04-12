# master-loop-orchestration.md - bounded cycle orchestration stages and safeguards

## Current execution model

The UX benchmark automation no longer relies only on one giant prompt. A bounded cycle is executed by:

1. `scripts/run_master_ux_worker.sh` — wrapper / lifecycle guard
2. `scripts/master_loop_orchestrator.py` — step orchestrator
3. step artifacts under `.omx/cycles/cycle-<n>-<harness>/`
4. `scripts/openclaw_master_loop_watchdog.py` — process freshness + recycle logic
5. `scripts/master_loop_quality_gate.py` — outcome-focused quality gate

When background runtime safety is more important than throughput, use
`docs/master-loop-safe-mode.md` and run one orchestrator step at a time.

## Step flow inside one bounded cycle

For an active harness, the orchestrator runs focused steps in order:

1. **designer step**
   - persona: `.codex/prompts/designer.md`
   - output artifacts:
     - `design.prompt.md`
     - `design.log`
     - `design.last.txt`
     - `designer-notes.md`
2. **critic step**
   - persona: `.codex/prompts/critic.md`
   - reads designer artifacts and produces a reject/approve critique
3. **ko-copy gate**
   - `scripts/master_loop_ui_language_gate.py`
   - enforces Korean-first visible copy ratio
4. **verifier step**
   - persona: `.codex/prompts/verifier.md`
   - final bounded proof before Python gates
5. **harness gate**
   - `scripts/master_loop_quality_gate.py`
   - validator + trace + ui language + artifact freshness + regression rescan
6. **completion step**
   - `scripts/master_loop_complete_harness.py`
   - removes the harness from `remaining_harnesses`
   - writes a per-harness completion marker
   - requeues impacted harnesses when shared files changed

## Safeguards

### Wrapper exit protection
`run_master_ux_worker.sh` now uses:
- `trap ... EXIT`
- `trap TERM/HUP/INT`
- `cleanup_children()` via `pkill -P $$`

Purpose:
- kill orchestrator + codex child processes on wrapper exit
- reduce orphaned child trees under tmux
- write `last_worker_finish_at`, `last_worker_exit_status`, and `last_worker_finish_reason`

### Watchdog pre-kill recording
`openclaw_master_loop_watchdog.py` now records state before forced recycle:
- `last_worker_finish_at`
- `last_worker_interrupt_at`
- `last_worker_interrupt_reason`
- `last_worker_finish_reason=watchdog-kill:<reason>`

Purpose:
- make recycle/kill paths visible even when wrapper tail logic is interrupted

### Orchestrator lock
`master_loop_orchestrator.py` takes an exclusive flock on:
- `.omx/state/orchestrator.lock`

If the lock is already held, the orchestrator exits with a non-zero code instead of double-running.

Purpose:
- prevent duplicate step pipelines from editing the same harness concurrently
- support safe-mode manual steps without background duplicate runs

### Full regression rescan on `remaining_harnesses=[]`
`master_loop_quality_gate.py` rescans **all harnesses** when the queue becomes empty.
If any harness regressed, it is re-added to `remaining_harnesses` and set as `current_harness`.

Purpose:
- prevent false global completion after a later regression

### Shared-file requeue
`master_loop_complete_harness.py` inspects changed files via git status.
If the completed harness changed shared roots (`benchmark/`, `scripts/`, `docs/`, `.omx/config`, `AGENTS.md`) or another harness subtree, previously completed harnesses can be requeued.

Purpose:
- catch cross-harness regressions caused by shared-file edits

## Observability

Useful files:
- `.omx/state/master-ux-loop.json`
- `.omx/state/master-loop-quality-gate.json`
- `.omx/state/master-loop-validator.json`
- `.omx/state/master-loop-trace-sanity.json`
- `.omx/state/master-loop-baseline-metrics.json`
- `.omx/logs/harness-complete/`
- `.omx/cycles/cycle-<n>-<harness>/`

Useful command:
```bash
bash scripts/openclaw_master_loop_status.sh
```

The status output now includes:
- `worker_elapsed_sec`
- `last_worker_start_at`
- `last_worker_finish_at`
- `last_worker_interrupt_at`
- `last_worker_interrupt_reason`
- `quality_gate_failure_streak`
- `current_harness_cycle_streak`

## Current limitation

`last_worker_finish_at` is better than before but still not perfect. The wrapper EXIT trap and watchdog pre-kill write reduce stale timestamps, but long-running or abrupt tmux/window teardown paths can still leave the last clean finish older than the most recent interrupt. Treat:
- `worker_elapsed_sec`
- `last_worker_interrupt_at`
- `last_worker_interrupt_reason`

as the more reliable liveness signals during recycle-heavy periods.
