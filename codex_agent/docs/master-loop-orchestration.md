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

## Lean step runtime profiles

The orchestrator now applies step-specific MCP budgets instead of letting every
`codex exec` start the full MCP stack.

- **design**
  - enabled: `stitch`, `omx_memory`, `omx_code_intel`
  - disabled: `playwright`, `omx_state`, `omx_trace`
- **critique**
  - enabled: `omx_memory`, `omx_code_intel`
  - disabled: `stitch`, `playwright`, `omx_state`, `omx_trace`
- **ko-copy**
  - enabled: `omx_memory`, `omx_code_intel`
  - disabled: `stitch`, `playwright`, `omx_state`, `omx_trace`
- **verify**
  - enabled: `playwright`, `omx_memory`
  - disabled: `stitch`, `omx_code_intel`, `omx_state`, `omx_trace`

Purpose:
- keep heavy MCP proxies out of steps that do not need them
- reduce duplicate `stitch-mcp` / `playwright-mcp` buildup
- make background automation viable again after safe-mode debugging

## OpenClaw is no longer in the hot path

The worker and watchdog no longer restart or sync `openclaw-gateway` on every
tick or worker start.

Current policy:
- benchmark automation should run without OpenClaw
- Telegram alerts may start the gateway lazily only when an alert is actually sent

Purpose:
- keep the steady-state benchmark loop independent from gateway resource spikes

## Step flow inside one bounded cycle

For an active harness, the orchestrator runs focused steps in order:

1. **designer step**
   - persona: `.codex/prompts/designer.md`
   - output artifacts:
     - `design.prompt.md`
     - `design.log`
     - `design.last.txt`
     - `designer-notes.md`
2. **ko-copy gate**
   - `scripts/master_loop_ui_language_gate.py`
   - runs immediately after design so Korean-first corrections happen even if critique later rejects
   - enforces Korean-first visible copy ratio
3. **critic step**
   - persona: `.codex/prompts/critic.md`
   - reads designer + ko-copy artifacts and produces a reject/approve critique
4. **verifier step**
   - persona: `.codex/prompts/verifier.md`
   - final bounded proof before Python gates
   - uses `benchmark/real_eval_rubric.md` as a directional UI/UX quality bar for bounded verification notes
   - writes browser-review evidence using `benchmark/templates/browser_review_report.template.md`
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

### Runtime budget guard
The watchdog now records and enforces per-tick process budgets:
- `active_orchestrator_count`
- `active_worker_count`
- `active_codex_exec_count`
- `active_stitch_mcp_count`
- `active_playwright_mcp_count`
- `active_automation_process_count`

If the budget is exceeded, the watchdog:
1. kills duplicate worker/orchestrator trees
2. kills duplicate `stitch-mcp` / `playwright-mcp`
3. records `runtime_guard_*` state
4. skips relaunch for that tick

Purpose:
- avoid WSL-wide CPU/RAM spikes
- prefer cleanup + backoff over runaway relaunch loops

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

### Reset / relaunch brief
When a project was previously completed and manual design or ko-copy edits are made afterward,
reset the loop before relaunching.

- primary operator guide: `docs/master-loop-reset-watchdog-guidance.md`
- reset entrypoint: `scripts/openclaw_master_loop_reset.sh`

The reset path archives prior completion markers plus derived quality reports so the next
watchdog/worker cycle starts from a clean `in_progress` state instead of inheriting stale
completion metadata.

### Real-eval rubric as a design/UX bar
`benchmark/real_eval_rubric.md` is not the same as the lab-comparison rubric.

Current usage in the bounded loop:
- **designer step** reads it as a product-quality target, especially for
  - 접근성/반응형
  - 디자인 완성도와 인터랙션 품질
  - 사용자 플로우 완성도
  - 복구 가능성
- **critic step** evaluates the patch against those same categories
- **verifier step** records a bounded evidence-based pass/warn/fail note for those categories

Important:
- bounded-cycle evidence does **not** automatically mean full real-eval pass
- full real-eval still requires live LLM, repeated runs, and recoverability proof

### Default deferred harness
`single_agent` is now treated as a fixed deferred/default-excluded harness for the automatic master loop.

Implications:
- reset/relaunch starts from `sequential_pipeline`
- full-project regression rescans do not requeue `single_agent`
- `single_agent` can still be inspected or run manually, but it is no longer part of the default automatic lane

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
