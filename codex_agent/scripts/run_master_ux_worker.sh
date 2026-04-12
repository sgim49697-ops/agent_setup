#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/user/projects/agent_setup/codex_agent
LOG="$ROOT/.omx/logs/master-ux-benchmark-v2.log"
LAST="$ROOT/.omx/logs/master-ux-benchmark-v2.last.txt"
STATE="$ROOT/.omx/state/master-ux-loop.json"
CYCLE_MARKER="$ROOT/.omx/logs/master-ux-benchmark-v2-cycle-complete.md"
PROJECT_FINAL_MARKER="$ROOT/.omx/logs/master-ux-benchmark-v2-project-final.md"
LEGACY_FINAL_MARKER="$ROOT/.omx/logs/master-ux-benchmark-v2-final.md"
CODEX_BIN="/home/user/.npm-global/bin/codex"
STATE_HELPER="$ROOT/scripts/master_loop_state.py"

update_state() {
  python3 "$STATE_HELPER" "$STATE" "$1" "$2"
}

mkdir -p "$ROOT/.omx/logs" "$ROOT/.omx/state"
python3 "$ROOT/scripts/openclaw_sync_codex_oauth.py" --restart-gateway-if-needed --quiet || true
printf '[%s] Detached tmux worker starting codex exec master loop\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$LOG"
CURRENT_CYCLE=$(python3 - <<'PY'
import json
from pathlib import Path
p=Path('/home/user/projects/agent_setup/codex_agent/.omx/state/master-ux-loop.json')
if p.exists():
    data=json.loads(p.read_text())
    print(int(data.get('cycle', 0)) + 1)
else:
    print(1)
PY
)
update_state status running
update_state project_status in_progress
update_state cycle_status running
update_state cycle "$CURRENT_CYCLE"
update_state next_cycle_required __false__
update_state current_phase benchmark-cycle
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
- This worker is ONE BOUNDED CYCLE, not the whole project. If the project is still incomplete at the end of this run, explicitly write `.omx/logs/master-ux-benchmark-v2-cycle-complete.md` and update the state so the next cycle is required.
- Only write `.omx/logs/master-ux-benchmark-v2-project-final.md` when the entire project is truly finished.
- Use `python3 scripts/master_loop_state.py .omx/state/master-ux-loop.json <key> <value> ...` to keep these fields fresh during work: current_phase, last_progress_at, last_progress_summary, remaining_harnesses, cycle_status, project_status, next_cycle_required, hard_blocker, blocker_reason.
- After each substantial step, append concise progress to .omx/logs/master-ux-benchmark-v2.log and .omx/notepad.
- User-visible product copy and outputs should be Korean-first unless a stable English test hook is specifically needed.
- Use browser-based review when each harness is ready.
- If UX is still poor, replan and continue.
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
  # Fail-open for automation: if the worker exited cleanly without markers, assume the cycle finished
  # but the overall project still needs another cycle unless a project-final marker exists.
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
