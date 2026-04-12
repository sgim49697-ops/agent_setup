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
QUALITY_GATE="$ROOT/scripts/master_loop_quality_gate.py"

update_state() {
  python3 "$STATE_HELPER" "$STATE" "$@"
}

mkdir -p "$ROOT/.omx/logs" "$ROOT/.omx/state"
if [[ "${MASTER_LOOP_SAFE_MODE_BYPASS:-0}" != "1" ]]; then
  if python3 - <<'PY'
from master_loop_state import safe_mode_enabled
raise SystemExit(0 if safe_mode_enabled() else 1)
PY
  then
    printf '[%s] Detached tmux worker refused to start because safe mode is enabled\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$LOG"
    exit 90
  fi
fi
if [[ "${MASTER_LOOP_SYNC_OPENCLAW_ON_START:-0}" == "1" ]]; then
  python3 "$ROOT/scripts/openclaw_sync_codex_oauth.py" --quiet || true
fi
printf '[%s] Detached tmux worker starting codex exec master loop\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$LOG"

FINISH_REASON="unknown"
FINAL_STATUS="unknown"
cleanup_children() {
  # Kill entire subprocess tree (orchestrator python + codex) so signal arrival
  # does not orphan them. Without this, watchdog's tmux kill-window + our HUP
  # trap would leave python3/codex alive under the tmux server.
  pkill -TERM -P $$ 2>/dev/null || true
  sleep 1
  pkill -KILL -P $$ 2>/dev/null || true
}
on_exit() {
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  cleanup_children
  python3 "$STATE_HELPER" "$STATE" last_worker_finish_at "$ts" 2>/dev/null || true
  python3 "$STATE_HELPER" "$STATE" last_worker_exit_status "$FINAL_STATUS" 2>/dev/null || true
  python3 "$STATE_HELPER" "$STATE" last_worker_finish_reason "$FINISH_REASON" 2>/dev/null || true
  printf '[%s] Wrapper EXIT trap fired (status=%s reason=%s)\n' "$ts" "$FINAL_STATUS" "$FINISH_REASON" >> "$LOG"
}
trap 'FINISH_REASON=signal-term; FINAL_STATUS=143; cleanup_children; exit 143' TERM
trap 'FINISH_REASON=signal-hup;  FINAL_STATUS=129; cleanup_children; exit 129' HUP
trap 'FINISH_REASON=signal-int;  FINAL_STATUS=130; cleanup_children; exit 130' INT
trap on_exit EXIT

readarray -t CONTEXT < <(python3 - <<'PY'
import json
from pathlib import Path
from master_loop_state import load_state, normalize_remaining_harnesses, resolve_harness_token
root=Path('/home/user/projects/agent_setup/codex_agent')
state=load_state(root / '.omx/state/master-ux-loop.json')
cycle = int(state.get('cycle', 0)) + 1
remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
current = str(state.get('current_harness') or '').strip()
current = resolve_harness_token(current, state) if current else ''
if not current or current == 'benchmark_foundation':
    current = remaining[0] if remaining else 'benchmark_foundation'
phase = str(state.get('current_phase') or 'cycle-resume')
stagnant = int(state.get('stagnant_cycle_count', 0))
regressions = int(state.get('remaining_regression_count', 0))
review_only = int(state.get('review_only_failures', 0))
remaining_json = json.dumps(remaining, ensure_ascii=False)
quality = {}
qpath = root / '.omx/state/master-loop-quality-gate.json'
if qpath.exists():
    try:
        quality = json.loads(qpath.read_text(encoding='utf-8'))
    except Exception:
        quality = {}
last_gate_errors = quality.get('errors', []) if quality.get('active_harness') == current else []
last_gate_warnings = quality.get('warnings', []) if quality.get('active_harness') == current else []
print(cycle)
print(current)
print(phase)
print(stagnant)
print(regressions)
print(review_only)
print(remaining_json)
print(' | '.join(last_gate_errors))
print(' | '.join(last_gate_warnings))
print(int(state.get('quality_gate_failure_streak', 0)))
print(str(state.get('last_quality_gate_signature') or ''))
print(int(state.get('current_harness_cycle_streak', 0)))
PY
)
CURRENT_CYCLE="${CONTEXT[0]}"
ACTIVE_HARNESS="${CONTEXT[1]}"
CURRENT_PHASE="${CONTEXT[2]}"
STAGNANT_COUNT="${CONTEXT[3]}"
REGRESSION_COUNT="${CONTEXT[4]}"
REVIEW_ONLY_FAILURES="${CONTEXT[5]}"
REMAINING_JSON="${CONTEXT[6]}"
LAST_GATE_ERRORS="${CONTEXT[7]}"
LAST_GATE_WARNINGS="${CONTEXT[8]}"
QUALITY_GATE_STREAK="${CONTEXT[9]}"
LAST_GATE_SIGNATURE="${CONTEXT[10]}"
HARNESS_STREAK="${CONTEXT[11]}"

STITCH_REF=$(ACTIVE_HARNESS="$ACTIVE_HARNESS" python3 - <<'PY'
import json, os
from pathlib import Path
root=Path('/home/user/projects/agent_setup/codex_agent')
refs_path=root/'.omx/config/stitch-refs.json'
active=os.environ.get('ACTIVE_HARNESS','')
try:
    refs=json.loads(refs_path.read_text(encoding='utf-8'))
except Exception:
    refs={}
shared=refs.get('shared_asset','assets/2271c2a16ec8460c91f7d85b87099fe9')
entry=(refs.get('harnesses') or {}).get(active, {})
screen=entry.get('screen')
asset=entry.get('asset', shared)
if screen:
    print(f'screen {screen} + asset {asset}')
else:
    print(f'shared asset {asset}')
PY
)

MUST_SHRINK_LINE="- If the cycle truly cannot shrink remaining_harnesses, declare a hard blocker with evidence."
if [[ "$STAGNANT_COUNT" -ge 3 || "$REGRESSION_COUNT" -gt 0 ]]; then
  MUST_SHRINK_LINE="- Recovery-critical cycle: you must shrink remaining_harnesses by at least 1 this cycle, or declare a hard blocker with evidence. Leaving it unchanged is failure."
fi

REVIEW_ONLY_LINE="- Review-only cycles are forbidden. Include an edit phase before any browser-review phase."
if [[ "$REVIEW_ONLY_FAILURES" -gt 0 ]]; then
  REVIEW_ONLY_LINE="- Previous cycles failed as review-only. This cycle must include a concrete edit phase and then re-verify; browser-review alone is failure."
fi

QUALITY_GATE_MEMORY="- No unresolved quality gate findings are recorded for this harness."
if [[ -n "$LAST_GATE_ERRORS" ]]; then
  QUALITY_GATE_MEMORY="- Previous cycle failed quality gate for $ACTIVE_HARNESS because: $LAST_GATE_ERRORS"
fi
QUALITY_GATE_WARNING_MEMORY=""
if [[ -n "$LAST_GATE_WARNINGS" ]]; then
  QUALITY_GATE_WARNING_MEMORY="- Previous cycle warning for $ACTIVE_HARNESS: $LAST_GATE_WARNINGS"
fi

RETRY_MODE_LINE='- Normal retry mode: keep iterating until the active harness passes quality gates; do not escalate quality issues to a human blocker.'
if [[ "$QUALITY_GATE_STREAK" -ge 3 ]]; then
  RETRY_MODE_LINE="- Repeated quality-gate failure streak=$QUALITY_GATE_STREAK for $ACTIVE_HARNESS. You must explicitly run designer -> critic -> executor, then \$ko-copy, then verify again in the same bounded cycle. Do not human-escalate this quality issue; keep retrying until it passes. Last failure signature: $LAST_GATE_SIGNATURE"
fi

DESIGNER_VERIFIER_LINE='- Use designer-grade review from .codex/prompts/designer.md and verifier-grade review from .codex/prompts/verifier.md when the harness reaches its edit/closure boundary.'

BUDGET_LINE='- Harness cycle budget is healthy.'
if [[ "$HARNESS_STREAK" -ge 8 ]]; then
  BUDGET_LINE="- Harness cycle budget exceeded for $ACTIVE_HARNESS (streak=$HARNESS_STREAK, budget=8). Invoke \$stagnant-breaker immediately and either remove the harness this cycle or produce a sharper plan with a fresh artifact."
fi

MEMORY_LINE='- At cycle start, use omx_memory MCP (`project_memory_read` and `notepad_read`) to recover harness-specific lessons. After verify/gate completion, use `notepad_write_working` to persist one concrete learning for this harness.'

ROUTER_OBSERVE_LINE=''
if [[ "$ACTIVE_HARNESS" == "router" && "$HARNESS_STREAK" -le 3 ]]; then
  ROUTER_OBSERVE_LINE='- Router early-observation mode: during the first 3 router cycles, explicitly confirm the Stitch router reference still fits the actual routing UI before patching.'
fi

update_state status running
update_state project_status in_progress
update_state cycle_status running
update_state cycle "$CURRENT_CYCLE"
update_state next_cycle_required __false__
update_state current_phase cycle-resume
update_state current_harness "$ACTIVE_HARNESS"
update_state last_worker_start_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
update_state last_progress_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
update_state last_progress_summary "cycle-$CURRENT_CYCLE launched for $ACTIVE_HARNESS"

PROMPT=$(cat <<PROMPT_EOF
Continue one bounded UX benchmark cycle in /home/user/projects/agent_setup/codex_agent.

Current context:
- Active harness: $ACTIVE_HARNESS
- Remaining harnesses: $REMAINING_JSON
- Previous phase: $CURRENT_PHASE
- Stitch reference: $STITCH_REF

Required outcomes for this cycle:
1. Work only on $ACTIVE_HARNESS until you either remove it from remaining_harnesses after real edit+verify+browser-review work, or declare a hard blocker.
2. Use fine-grained phases only: $ACTIVE_HARNESS-edit, $ACTIVE_HARNESS-verify, $ACTIVE_HARNESS-browser-review, quality-gate, cycle-validation, cycle-resume.
3. Before visible UI edits, read docs/stitch-ux-reference.md and use Stitch MCP first.
4. For browser review, never use ad-hoc preview ports. Use: python3 scripts/harness_preview.py ensure $ACTIVE_HARNESS and record the returned stable URL in last_progress_summary.
5. Visible copy must be Korean-first. English is allowed only for stable test hooks in aria/live-region text.
6. Keep state fresh with python3 scripts/master_loop_state.py .omx/state/master-ux-loop.json <key> <value> ..., including current_phase, current_harness, last_progress_at, last_progress_summary, remaining_harnesses.
7. Use \$benchmark-cycle as the baseline workflow shell for this cycle.
8. Before finishing any edit phase, invoke \$ko-copy discipline on the active harness so Korean-first visible copy passes the gate.
9. At the start of each $ACTIVE_HARNESS-edit phase, explicitly use the designer agent to propose and execute the visible UI patch, grounded in Stitch references.
10. Immediately after the edit draft, explicitly use the critic agent to challenge Korean-first copy, information density, a11y, and visual hierarchy; then apply the critic feedback before verify.
11. Before finishing the edit phase, explicitly invoke \$ko-copy discipline on the changed harness and rerun python3 scripts/master_loop_ui_language_gate.py --harness $ACTIVE_HARNESS.
12. During browser-review, use \$visual-verdict if before/after screenshots or reference images are available.
13. Before bounded completion, run verifier-grade judgment from .codex/prompts/verifier.md and then \$code-review on the changed harness scope.
14. Run \$harness-gate semantics via python3 scripts/master_loop_quality_gate.py --active-harness $ACTIVE_HARNESS --enforce.
15. If harness-gate passes with ok=true AND artifact freshness is fresh, REMOVE the active harness from remaining_harnesses in the same cycle by running python3 scripts/master_loop_complete_harness.py --harness $ACTIVE_HARNESS. This removal is the harness completion signal.
16. If the project is not truly complete, write only the cycle-complete marker.

Dynamic guards:
$MUST_SHRINK_LINE
$REVIEW_ONLY_LINE
$QUALITY_GATE_MEMORY
$QUALITY_GATE_WARNING_MEMORY
$DESIGNER_VERIFIER_LINE
$MEMORY_LINE
$ROUTER_OBSERVE_LINE
$BUDGET_LINE
$RETRY_MODE_LINE
- If stagnant_cycle_count >= 3, invoke \$stagnant-breaker semantics to sharpen the plan, but keep the model retrying rather than escalating to a human blocker.
PROMPT_EOF
)

cd "$ROOT"
ORCHESTRATOR="$ROOT/scripts/master_loop_orchestrator.py"
set +e
if [ -x "$ORCHESTRATOR" ] || [ -f "$ORCHESTRATOR" ]; then
  python3 "$ORCHESTRATOR" \
    --active-harness "$ACTIVE_HARNESS" \
    --cycle "$CURRENT_CYCLE" \
    --prompt-context "$PROMPT" >> "$LOG" 2>&1
  STATUS=$?
else
  "$CODEX_BIN" exec \
    --dangerously-bypass-approvals-and-sandbox \
    --color never \
    -C "$ROOT" \
    -o "$LAST" \
    "$PROMPT" >> "$LOG" 2>&1
  STATUS=$?
fi
set -e
FINAL_STATUS="$STATUS"
FINISH_REASON="natural-exit"
printf '[%s] Detached tmux worker exited with status %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$STATUS" >> "$LOG"
python3 "$VALIDATOR" --rewrite --quiet || true
python3 "$TRACE_SANITY" --quiet || true
python3 "$BASELINE" --quiet || true
QUALITY_STATUS=0
python3 "$QUALITY_GATE" --active-harness "$ACTIVE_HARNESS" --enforce --quiet || QUALITY_STATUS=$?
update_state last_worker_exit_status "$STATUS"
update_state last_worker_finish_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
update_state quality_gate_status "$QUALITY_STATUS"

if [ "$STATUS" -eq 0 ] && [ "$QUALITY_STATUS" -eq 0 ] && { [ -f "$PROJECT_FINAL_MARKER" ] || [ -f "$LEGACY_FINAL_MARKER" ]; }; then
  update_state status completed
  update_state project_status project_completed
  update_state cycle_status completed
  update_state next_cycle_required __false__
elif [ "$STATUS" -eq 0 ] && [ "$QUALITY_STATUS" -eq 0 ]; then
  python3 "$ROOT/scripts/master_loop_complete_harness.py" --harness "$ACTIVE_HARNESS" >/dev/null 2>&1 || true
  python3 "$QUALITY_GATE" --active-harness "$ACTIVE_HARNESS" --enforce --quiet >/dev/null 2>&1 || true
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
