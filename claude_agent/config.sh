# config.sh - 에이전트 하네스 설정

# 최대 반복 횟수
MAX_GENERATE_RETRIES=3    # Generator 재시도 한도
MAX_REPLAN_RETRIES=2      # Planner 재계획 한도

# 경로
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPTS_DIR="$BASE_DIR/prompts"
STATE_DIR="$BASE_DIR/state"
CODE_DIR="$STATE_DIR/code"
LOGS_DIR="$BASE_DIR/logs"

# Claude CLI 옵션
CLAUDE_CMD="claude"
CLAUDE_OPTS="-p --output-format text"

# 로그 파일 (실행 시마다 타임스탬프)
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$LOGS_DIR/run_${TIMESTAMP}.log"
