---
name: stagnant-breaker
description: Break repeated stalled benchmark cycles by forcing a blocker decision or sharper plan
---

# stagnant-breaker

## Purpose

같은 harness가 여러 cycle 동안 줄지 않거나 같은 gate 오류가 반복될 때, 무한 relaunch 대신 막힘 지점을 분명히 한다.

## Use when

- `stagnant_cycle_count >= 3`
- 같은 quality gate failure가 반복될 때
- review-only / replan-only / no-artifact 패턴이 누적될 때

## Procedure

1. active harness의 최신 state, trace, quality gate를 읽는다.
2. `.codex/prompts/architect.md` 관점으로 실제 막힘 원인을 요약한다.
3. 둘 중 하나를 강제한다.
   - **명시적 수정 계획**: 이번 cycle에서 줄일 정확한 remaining target 제시
   - **hard blocker 선언**: 사람이 개입해야 할 이유를 state/block marker에 기록
4. 결과를 `.omx/logs/master-ux-benchmark-v2.log`와 state에 남긴다.

## Rules

- vague replan 금지
- browser-review만 반복하는 패턴이면 실패로 간주
- hard blocker면 blocker reason을 구체적으로 남긴다
