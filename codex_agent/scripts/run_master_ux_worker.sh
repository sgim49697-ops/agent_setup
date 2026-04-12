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
python3 "$ROOT/scripts/openclaw_sync_codex_oauth.py" --restart-gateway-if-needed --quiet || true
printf '[%s] Detached tmux worker starting codex exec master loop\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$LOG"

readarray -t CONTEXT < <(python3 - <<'PY'
import json
from pathlib import Path
from master_loop_state import load_state, normalize_remaining_harnesses
root=Path('/home/user/projects/agent_setup/codex_agent')
state=load_state(root / '.omx/state/master-ux-loop.json')
cycle = int(state.get('cycle', 0)) + 1
remaining = normalize_remaining_harnesses(state.get('remaining_harnesses'))
current = str(state.get('current_harness') or '').strip()
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

STITCH_REF='shared asset assets/2271c2a16ec8460c91f7d85b87099fe9'
if [[ "$ACTIVE_HARNESS" == "orchestrator_worker" ]]; then
  STITCH_REF='screen projects/11015732894783859302/screens/a9c46f1393b341f8bb24da291814c1d2 + asset assets/2271c2a16ec8460c91f7d85b87099fe9'
elif [[ "$ACTIVE_HARNESS" == "parallel_sections" ]]; then
  STITCH_REF='screen projects/11015732894783859302/screens/d8a6e9d589d7433181abc1a96b8c6108 + asset assets/2271c2a16ec8460c91f7d85b87099fe9'
fi

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
4. For browser review, never use ad-hoc preview ports. Use: `python3 scripts/harness_preview.py ensure $ACTIVE_HARNESS` and record the returned stable URL in last_progress_summary.
5. Visible copy must be Korean-first. English is allowed only for stable test hooks in aria/live-region text.
6. Keep state fresh with `python3 scripts/master_loop_state.py .omx/state/master-ux-loop.json <key> <value> ...`, including current_phase, current_harness, last_progress_at, last_progress_summary, remaining_harnesses.
7. At the end, run `python3 scripts/master_loop_quality_gate.py --active-harness $ACTIVE_HARNESS --enforce`. If the project is not truly complete, write only the cycle-complete marker.

Dynamic guards:
$MUST_SHRINK_LINE
$REVIEW_ONLY_LINE
$QUALITY_GATE_MEMORY
$QUALITY_GATE_WARNING_MEMORY
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
elif [ "$STATUS" -eq 0 ] && [ "$QUALITY_STATUS" -eq 0 ] && [ -f "$CYCLE_MARKER" ]; then
  update_state status cycle_completed
  update_state project_status in_progress
  update_state cycle_status completed
  update_state next_cycle_required __true__
elif [ "$STATUS" -eq 0 ] && [ "$QUALITY_STATUS" -eq 0 ]; then
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
