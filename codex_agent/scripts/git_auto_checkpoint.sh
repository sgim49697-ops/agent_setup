#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/home/user/projects/agent_setup"
WORKSPACE_NAME="codex_agent"
WORKSPACE_PATH="$REPO_ROOT/$WORKSPACE_NAME"
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
      echo "Usage: $0 [--push] [--message <msg>]" >&2
      exit 1
      ;;
  esac
done

if [[ "$NO_PUSH" -eq 1 ]]; then
  PUSH=0
fi

cd "$REPO_ROOT"

if [[ -z "$MESSAGE" ]]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  MESSAGE="Checkpoint $WORKSPACE_NAME @ $(date -u +%Y-%m-%dT%H:%M:%SZ) on $BRANCH"
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

git commit -m "$MESSAGE"

if [[ "$PUSH" -eq 1 ]]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git push origin "$CURRENT_BRANCH"
fi

echo "Checkpoint commit complete."
