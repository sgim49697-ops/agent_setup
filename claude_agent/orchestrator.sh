#!/usr/bin/env bash
# orchestrator.sh - Claude Code 순환 에이전트 오케스트레이터

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# ── 유틸리티 ──

log() {
    local msg="[$(date '+%H:%M:%S')] $1"
    echo "$msg" | tee -a "$LOG_FILE"
}

die() {
    log "FATAL: $1"
    exit 1
}

# state 초기화
init_state() {
    rm -f "$STATE_DIR/plan.md" "$STATE_DIR/evaluation.json"
    rm -rf "$CODE_DIR"
    mkdir -p "$CODE_DIR"
    log "State 초기화 완료"
}

# Claude 호출 래퍼
call_claude() {
    local prompt="$1"
    $CLAUDE_CMD $CLAUDE_OPTS "$prompt" 2>>"$LOG_FILE"
}

# Generator 출력에서 파일 추출 → state/code/ 에 저장
parse_generated_files() {
    local output="$1"
    local current_file=""
    local writing=false

    while IFS= read -r line; do
        if [[ "$line" =~ ^===FILE:\ (.+)=== ]]; then
            current_file="${BASH_REMATCH[1]}"
            writing=true
            mkdir -p "$CODE_DIR/$(dirname "$current_file")"
            > "$CODE_DIR/$current_file"
        elif [[ "$line" == "===END_FILE===" ]]; then
            writing=false
            log "  파일 생성: $current_file"
        elif $writing && [[ -n "$current_file" ]]; then
            echo "$line" >> "$CODE_DIR/$current_file"
        fi
    done <<< "$output"
}

# 생성된 코드를 하나의 텍스트로 합침
collect_code() {
    local result=""
    while IFS= read -r -d '' file; do
        local rel="${file#$CODE_DIR/}"
        result+="===FILE: $rel===\n"
        result+="$(cat "$file")\n"
        result+="===END_FILE===\n\n"
    done < <(find "$CODE_DIR" -type f -print0 2>/dev/null)
    echo -e "$result"
}

# ── 에이전트 호출 ──

run_planner() {
    local user_request="$1"
    local context="${2:-}"

    local system_prompt
    system_prompt="$(cat "$PROMPTS_DIR/planner.md")"

    local prompt="$system_prompt

---
## 사용자 요구사항
$user_request"

    if [[ -n "$context" ]]; then
        prompt+="

---
## 재계획 컨텍스트
$context"
    fi

    log "▶ Planner 호출 중..."
    local result
    result="$(call_claude "$prompt")"
    echo "$result" > "$STATE_DIR/plan.md"
    log "  계획 저장 완료 ($(wc -l < "$STATE_DIR/plan.md")줄)"
    echo "$result"
}

run_generator() {
    local plan="$1"
    local feedback="${2:-}"

    local system_prompt
    system_prompt="$(cat "$PROMPTS_DIR/generator.md")"

    local prompt="$system_prompt

---
## 계획
$plan"

    if [[ -n "$feedback" ]]; then
        prompt+="

---
## Evaluator 피드백 (이전 시도에서 지적된 사항)
$feedback"
    fi

    log "▶ Generator 호출 중..."
    local result
    result="$(call_claude "$prompt")"

    # 코드 디렉토리 초기화 후 파싱
    rm -rf "$CODE_DIR" && mkdir -p "$CODE_DIR"
    parse_generated_files "$result"

    echo "$result"
}

run_evaluator() {
    local user_request="$1"
    local plan="$2"
    local code="$3"

    local system_prompt
    system_prompt="$(cat "$PROMPTS_DIR/evaluator.md")"

    local prompt="$system_prompt

---
## 사용자 요구사항
$user_request

---
## 계획
$plan

---
## 생성된 코드
$code"

    log "▶ Evaluator 호출 중..."
    local result
    result="$(call_claude "$prompt")"
    echo "$result" > "$STATE_DIR/evaluation.json"
    echo "$result"
}

# 평가 결과에서 VERDICT 추출
extract_verdict() {
    local evaluation="$1"
    if echo "$evaluation" | grep -q "VERDICT: PASS"; then
        echo "PASS"
    elif echo "$evaluation" | grep -q "VERDICT: REPLAN"; then
        echo "REPLAN"
    else
        echo "FAIL"
    fi
}

# ── 메인 루프 ──

main() {
    if [[ $# -lt 1 ]]; then
        echo "사용법: $0 \"구현할 내용을 설명하세요\""
        echo "예시:  $0 \"Python으로 REST API 서버를 만들어줘\""
        exit 1
    fi

    local user_request="$1"
    mkdir -p "$LOGS_DIR"

    log "========================================="
    log "에이전트 하네스 시작"
    log "요청: $user_request"
    log "========================================="

    init_state

    local replan_count=0
    local generate_count=0
    local plan=""
    local feedback=""
    local replan_context=""

    # 1) 최초 계획 수립
    plan="$(run_planner "$user_request")"

    while true; do
        # 2) 코드 생성
        generate_count=$((generate_count + 1))
        log "--- 생성 시도 #$generate_count ---"

        local generator_output
        generator_output="$(run_generator "$plan" "$feedback")"

        local code
        code="$(collect_code)"

        if [[ -z "$code" ]]; then
            die "Generator가 파일을 생성하지 못했습니다"
        fi

        # 3) 평가
        local evaluation
        evaluation="$(run_evaluator "$user_request" "$plan" "$code")"
        local verdict
        verdict="$(extract_verdict "$evaluation")"
        log "  판정: $verdict"

        case "$verdict" in
            PASS)
                log "========================================="
                log "✓ 완료! 생성된 코드: $CODE_DIR/"
                log "========================================="
                echo ""
                echo "=== 최종 결과 ==="
                echo "코드 위치: $CODE_DIR/"
                echo "평가 결과: $STATE_DIR/evaluation.json"
                echo "로그: $LOG_FILE"
                find "$CODE_DIR" -type f | sed 's|^|  |'
                exit 0
                ;;
            FAIL)
                if [[ $generate_count -ge $MAX_GENERATE_RETRIES ]]; then
                    die "Generator 최대 재시도 횟수($MAX_GENERATE_RETRIES) 초과"
                fi
                feedback="$evaluation"
                log "  → Generator 재시도 예정"
                ;;
            REPLAN)
                replan_count=$((replan_count + 1))
                if [[ $replan_count -ge $MAX_REPLAN_RETRIES ]]; then
                    die "Planner 최대 재계획 횟수($MAX_REPLAN_RETRIES) 초과"
                fi
                generate_count=0
                feedback=""
                replan_context="## 이전 계획
$plan

## Evaluator 피드백
$evaluation

## 생성된 코드 상태
$code"
                plan="$(run_planner "$user_request" "$replan_context")"
                log "  → 재계획 완료, Generator 재시작"
                ;;
        esac
    done
}

main "$@"
