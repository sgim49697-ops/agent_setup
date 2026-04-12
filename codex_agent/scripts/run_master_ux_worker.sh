#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/user/projects/agent_setup/codex_agent
export PYTHONPATH="$ROOT/scripts:${PYTHONPATH:-}"
LOG="$ROOT/.omx/logs/master-ux-benchmark-v2.log"
LAST="$ROOT/.omx/logs/master-ux-benchmark-v2.last.txt"
STATE="$ROOT/.omx/state/master-ux-loop.json"
CYCLE_MARKER="$ROOT/.omx/logs/master-ux-benchmark-v2-cycle-complete.md"
PROJECT_FINAL_MARKER="$ROOT/.omx/logs/master-ux-benchmark-v2-project-final.md"
LEGACY_FINAL_MARKER="$ROOT/.omx/logs/master-ux-benchmark-v2-final.md"
CODEX_BIN="/home/user/.npm-global/bin/codex"
STATE_HELPER="$ROOT/scripts/master_loop_state.py"
VALIDATOR="$ROOT/scripts/master_loop_validator.py"
TRACE_SANITY="$ROOT/scripts/master_loop_trace_sanity.py"
BASELINE="$ROOT/scripts/master_loop_baseline_metrics.py"

update_state() {
  python3 "$STATE_HELPER" "$STATE" "$@"
}

mkdir -p "$ROOT/.omx/logs" "$ROOT/.omx/state"
python3 "$ROOT/scripts/openclaw_sync_codex_oauth.py" --restart-gateway-if-needed --quiet || true
printf '[%s] Detached tmux worker starting codex exec master loop\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$LOG"
CURRENT_CYCLE=$(python3 - <<'PY'
from pathlib import Path
from master_loop_state import load_state
p=Path('/home/user/projects/agent_setup/codex_agent/.omx/state/master-ux-loop.json')
state=load_state(p)
print(int(state.get('cycle', 0)) + 1)
PY
)
update_state status running
update_state project_status in_progress
update_state cycle_status running
update_state cycle "$CURRENT_CYCLE"
update_state next_cycle_required __false__
update_state current_phase cycle-resume
update_state current_harness benchmark_foundation
update_state last_worker_start_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
update_state last_progress_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
update_state last_progress_summary "cycle-$CURRENT_CYCLE launched"

PROMPT=$(cat <<'PROMPT_EOF'
Continue the master UX benchmark v2 plan in /home/user/projects/agent_setup/codex_agent.

Rules:
- Do not stop for intermediate reports.
- Read .omx/plans/master-ux-benchmark-v2-loop-2026-04-12.md first unless a newer next-cycle plan exists.
- Read current repo state and continue from the latest completed point.
- Benchmark v2 docs, journey scaffolding, and harness directives are already in place.
- Continue sequentially through remaining benchmark phases and then through all 7 harnesses sequentially.
- This worker is ONE BOUNDED CYCLE, not the whole project. cycle_completed != project_completed.
- If remaining_harnesses is not empty, never mark the project as complete and never write `.omx/logs/master-ux-benchmark-v2-project-final.md`.
- Only write `.omx/logs/master-ux-benchmark-v2-project-final.md` when the entire project is truly finished and remaining_harnesses is `[]`.
- If the project is still incomplete at the end of this run, explicitly write `.omx/logs/master-ux-benchmark-v2-cycle-complete.md` and update the state so the next cycle is required.
- Use `python3 scripts/master_loop_state.py .omx/state/master-ux-loop.json <key> <value> ...` to keep these fields fresh during work: current_phase, current_harness, last_progress_at, last_progress_summary, remaining_harnesses, cycle_status, project_status, next_cycle_required, hard_blocker, blocker_reason.
- `remaining_harnesses` must be kept as a JSON array string, not a CSV string.
- `current_harness` is mandatory whenever project_status=in_progress. Update it whenever you switch harnesses.
- Use fine-grained phase tokens instead of repeating generic `benchmark-cycle`: prefer `<harness>-edit`, `<harness>-verify`, `<harness>-browser-review`, `quality_gate`, `cycle-validation`, `cycle-resume`.
- Before visible UI/UX edits, read `docs/stitch-ux-reference.md` and use Stitch MCP first. If the active harness has UX debt, consult the shared Stitch project/screen/design-system before editing code.
- If the active harness is `orchestrator_worker`, use Stitch screen `projects/11015732894783859302/screens/a9c46f1393b341f8bb24da291814c1d2` and asset `assets/2271c2a16ec8460c91f7d85b87099fe9` as the default UI reference.
- If the active harness is `parallel_sections`, use Stitch screen `projects/11015732894783859302/screens/d8a6e9d589d7433181abc1a96b8c6108` and the same shared asset as the default UI reference.
- After each substantial step, append concise progress to .omx/logs/master-ux-benchmark-v2.log and .omx/notepad, including which Stitch asset or screen was referenced for UI work.
- User-visible product copy and outputs should be Korean-first unless a stable English test hook is specifically needed.
- Every Stitch-informed UI change must be followed by Playwright browser review plus benchmark smoke/journey validation.
- Never rely on ad-hoc `npm run preview` ports. Use `python3 scripts/harness_preview.py ensure <harness>` to get a stable preview URL on the dedicated 4273-4279 range before Playwright navigation.
- Record the stable preview URL you used in `last_progress_summary` whenever a browser review starts or finishes.
- Do not stop after writing a replan note. Replan-only completion is a failure.
- Review-only completion is a failure. If you review, you must either patch, verify, or clearly record a hard blocker.
- If remaining_harnesses does not shrink in a cycle, explain why in last_progress_summary.
- Before bounded completion or project completion, run these checks and repair anything they flag:
  - `python3 scripts/master_loop_validator.py --rewrite --quiet`
  - `python3 scripts/master_loop_trace_sanity.py --quiet`
  - `python3 scripts/master_loop_baseline_metrics.py --quiet`
- If blocked, write `.omx/logs/master-ux-benchmark-v2.blocked` with the blocker reason and set hard_blocker=true in state.
- Stop only at a hard blocker, a bounded cycle completion, or true full-project completion.
PROMPT_EOF
)

cd "$ROOT"
set +e
"$CODEX_BIN" exec \
  --dangerously-bypass-approvals-and-sandbox \
  --color never \
  -C "$ROOT" \
  -o "$LAST" \
  "$PROMPT" >> "$LOG" 2>&1
STATUS=$?
set -e
printf '[%s] Detached tmux worker exited with status %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$STATUS" >> "$LOG"
python3 "$VALIDATOR" --rewrite --quiet || true
python3 "$TRACE_SANITY" --quiet || true
python3 "$BASELINE" --quiet || true
update_state last_worker_exit_status "$STATUS"
update_state last_worker_finish_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [ "$STATUS" -eq 0 ] && { [ -f "$PROJECT_FINAL_MARKER" ] || [ -f "$LEGACY_FINAL_MARKER" ]; }; then
  update_state status completed
  update_state project_status project_completed
  update_state cycle_status completed
  update_state next_cycle_required __false__
elif [ "$STATUS" -eq 0 ] && [ -f "$CYCLE_MARKER" ]; then
  update_state status cycle_completed
  update_state project_status in_progress
  update_state cycle_status completed
  update_state next_cycle_required __true__
elif [ "$STATUS" -eq 0 ]; then
  update_state status cycle_completed
  update_state project_status in_progress
  update_state cycle_status completed
  update_state next_cycle_required __true__
else
  update_state status idle
  update_state cycle_status failed
  update_state project_status in_progress
  update_state next_cycle_required __true__
fi
exit "$STATUS"
