---
name: ko-copy
description: Korean-first UI copy enforcement with English test hook allowlist
---

# ko-copy

## Purpose

UI 가시 텍스트를 한국어 우선으로 정리하고, 영어는 테스트 훅/접근성 보조 레이어에만 남기도록 강제한다.

## Use when

- visible UI copy가 영어-first로 남아 있을 때
- quality gate가 Korean-first ratio로 실패했을 때
- harness edit phase를 마무리하기 직전

## Rules

- visible product copy는 한국어 우선
- English는 아래 케이스만 허용
  - `aria-label`
  - `data-testid`
  - live-region / accessibility hook text
  - smoke/journey의 안정적 test hook
- 코드 식별자/enum/status token과 실제 사용자 가시 카피를 구분한다

## Procedure

1. active harness를 정한다.
2. `python3 scripts/master_loop_ui_language_gate.py --harness <harness>` 실행
3. offender 목록을 보고 visible English copy를 한국어 우선으로 바꾼다.
4. aria/live-region hook이 필요한 경우만 영어를 남긴다.
5. 수정 후 다시 language gate를 실행해 ratio를 확인한다.
6. 결과를 `.omx/logs/master-ux-benchmark-v2.log`와 state summary에 남긴다.

## Expected outcome

- Korean-first ratio >= 0.70
- visible copy의 영어 의존도 감소
- test hook 안정성 유지
