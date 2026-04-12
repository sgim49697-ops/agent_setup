#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/home/user/projects/agent_setup"
WORKSPACE_NAME="codex_agent"
WORKSPACE_PATH="$REPO_ROOT/$WORKSPACE_NAME"
STATE_PATH="$WORKSPACE_PATH/.omx/state/master-ux-loop.json"
PUSH=1
MESSAGE=""
NO_PUSH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      PUSH=1
      shift
      ;;
    --no-push)
      NO_PUSH=1
      shift
      ;;
    --message)
      MESSAGE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--push] [--no-push] [--message <msg>]" >&2
      exit 1
      ;;
  esac
done

if [[ "$NO_PUSH" -eq 1 ]]; then
  PUSH=0
fi

cd "$REPO_ROOT"

if [[ -z "$MESSAGE" ]]; then
  MESSAGE="Preserve automation progress for codex_agent"
fi

# Stage only the codex_agent subtree. Git will respect .gitignore rules in that subtree.
git add -A -- "$WORKSPACE_NAME"

if ! python3 "$WORKSPACE_PATH/scripts/git_guard_large_files.py"; then
  exit 2
fi

if ! python3 "$WORKSPACE_PATH/scripts/git_secret_scan.py"; then
  exit 3
fi

if git diff --cached --quiet -- "$WORKSPACE_NAME"; then
  echo "No staged changes under $WORKSPACE_NAME."
  exit 0
fi

echo "=== staged diff stat ==="
git diff --cached --stat -- "$WORKSPACE_NAME"
echo

PHASE="unknown"
HARNESS="unknown"
CYCLE="unknown"
if [[ -f "$STATE_PATH" ]]; then
  PHASE=$(python3 - <<'PY'
import json
from pathlib import Path
state = json.loads(Path('/home/user/projects/agent_setup/codex_agent/.omx/state/master-ux-loop.json').read_text(encoding='utf-8'))
print(state.get('current_phase', 'unknown'))
PY
)
  HARNESS=$(python3 - <<'PY'
import json
from pathlib import Path
state = json.loads(Path('/home/user/projects/agent_setup/codex_agent/.omx/state/master-ux-loop.json').read_text(encoding='utf-8'))
print(state.get('current_harness', 'unknown'))
PY
)
  CYCLE=$(python3 - <<'PY'
import json
from pathlib import Path
state = json.loads(Path('/home/user/projects/agent_setup/codex_agent/.omx/state/master-ux-loop.json').read_text(encoding='utf-8'))
print(state.get('cycle', 'unknown'))
PY
)
fi

COMMIT_MSG_FILE=$(mktemp)
cat > "$COMMIT_MSG_FILE" <<EOF
$MESSAGE

Automated checkpoint scoped to the codex_agent subtree.
This snapshot preserves the current automation/debugging state
without widening scope to sibling workspaces.

Constraint: Auto checkpoint must stay inside codex_agent subtree
Constraint: Large files and secret-like tokens are blocked before commit
Confidence: medium
Scope-risk: narrow
Directive: Keep current_harness and remaining_harnesses coherent before broadening automation rules
Tested: git_guard_large_files.py; git_secret_scan.py; auto checkpoint staging
Not-tested: Remote CI behavior after this checkpoint
Related: cycle=$CYCLE phase=$PHASE harness=$HARNESS
EOF

git commit -F "$COMMIT_MSG_FILE"
rm -f "$COMMIT_MSG_FILE"

if [[ "$PUSH" -eq 1 ]]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git push origin "$CURRENT_BRANCH"
fi

echo "Checkpoint commit complete."
