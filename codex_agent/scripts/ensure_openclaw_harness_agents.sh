#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/user/projects/agent_setup/codex_agent
HARNESSES=(single_agent sequential_pipeline parallel_sections router orchestrator_worker evaluator_optimizer omx_evaluator_optimizer)
for h in "${HARNESSES[@]}"; do
  if ! openclaw agents list | grep -q "^- ${h}$"; then
    openclaw agents add "$h" --workspace "$ROOT/$h" --non-interactive --model openai-codex/gpt-5.3-codex >/dev/null
    echo "added $h"
  else
    echo "exists $h"
  fi
done
python3 "$ROOT/scripts/openclaw_sync_codex_oauth.py" --restart-gateway-if-needed --quiet >/dev/null || true
