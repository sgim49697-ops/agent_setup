# AGENTS.md - evaluator_optimizer workspace rules

## Mission

이 워크스페이스에서는 writer → reviewer → optimizer 루프를 **최소 3회, 최대 15회** 반복하여 `기술 블로그 포스트 자동 생성기`를 점진적으로 개선한다.

**이 하네스의 핵심은 루프 횟수와 개선 폭이다.** 한 번에 완벽한 코드를 쓰려 하지 말고, 의도적으로 빠르게 초안을 내고 리뷰→수정을 반복해서 품질을 끌어올려라.

## Token Policy (필수)

- **컨텍스트 절약을 위해 루프를 줄이지 마라.** 이 하네스의 목적 자체가 반복이다.
- 코드를 한 번에 완벽하게 쓰려는 시도는 이 하네스의 규칙 위반이다.
- 매 루프마다 전체 코드를 새로 읽고 리뷰해야 한다. 이전 루프 기억에 의존하지 마라.
- compact나 요약 없이 루프 전체를 진행한다.
- **루프 3회 미만으로 완료 선언하면 자동 실패로 간주한다.**

## Product Summary

- 입력: `topic`, `audience`, `tone`, `length`
- 필수 단계: `Research results` → `Outline` → `Section drafts` → `Review notes` → `Final post`
- 필수 액션: `Generate post`, `Copy markdown`
- 백엔드 금지, 로컬 상태 또는 mock 데이터 사용

## Execution Model

### Phase 1: Writer (초안)
- 동작하는 end-to-end 흐름을 만든다. 완벽하지 않아도 된다.
- 빌드가 통과하고 기본 UI가 작동하면 Phase 2로 넘긴다.
- **이 단계에서 polish하지 마라.** reviewer가 잡아야 할 일을 미리 하면 루프가 무의미해진다.

### Phase 2-N: Review → Revise 루프 (최소 3회)
- 매 iteration마다:
  1. **Reviewer**: `harness/prompt_sets/reviewer.md`의 체크리스트 9개 항목을 모두 평가
  2. **Reviewer**: 각 항목을 PASS/FAIL/PARTIAL로 판정하고, FAIL 항목마다 구체적 수정 지시 작성
  3. **Optimizer**: FAIL/PARTIAL 항목을 실제 코드 변경으로 해결
  4. **Optimizer**: 빌드 확인 (`npm run build`)
  5. **기록**: `runs/iteration_log.md`에 해당 iteration 결과 append

- **종료 조건**: 9개 항목 중 8개 이상 PASS **그리고** 최소 3회 루프 완료
- **강제 종료**: 15회 도달 시 현재 상태로 마감

### Phase Final: 평가
- scorecard 작성 + evaluate.py 실행
- `runs/iteration_log.md`에 전체 루프 요약 기록

## Deliverables

- 구현 코드: `app/`
- 루프 기록: `runs/iteration_log.md` (매 iteration PASS/FAIL 기록, **필수**)
- 실행 메모: `runs/run_manifest.json`, `runs/artifact_index.json`
- 리뷰 보고서: `reports/review_report.md`
- 점수 파일: `reports/scorecard.json`
- 통합 평가: `reports/evaluation_report.json`

## Post-Implementation: 평가 실행 (필수)

구현이 끝나면 반드시 아래를 순서대로 실행한다. **평가 없이 완료 선언하지 않는다.**

1. 앱 빌드 확인:
   ```bash
   cd app && npm install --prefer-offline && npm run build
   ```

2. `reports/scorecard.json` 작성 (`benchmark/rubric.md` 기준, **7.0 미만이면 루프 추가**)

3. 3-layer 평가 실행:
   ```bash
   cd /home/user/projects/agent_setup/codex_agent
   HARNESS=evaluator_optimizer uv run python scripts/evaluate.py
   ```

4. 통과 기준 확인:
   - L1 Playwright smoke pass rate ≥ 90% (이 하네스는 다른 하네스보다 높은 기준)
   - L2 빌드 성공
   - L3 overall_score ≥ 7.5 (이 하네스는 반복 개선했으므로 높은 기준)
   - `reports/evaluation_report.json` 존재
   - `runs/iteration_log.md`에 최소 3회 iteration 기록

5. 미달 시 **루프를 더 돌려서** 코드를 수정하고 다시 평가

UI가 Playwright 테스트를 통과하려면 `benchmark/evaluation_guide.md`의 "테스트 통과를 위한 UI 구현 필수사항" 섹션을 참고한다.

## Done When

- `runs/iteration_log.md`에 **최소 3회** iteration이 기록되어 있다.
- 마지막 iteration에서 reviewer 체크리스트 9개 중 8개 이상 PASS다.
- reviewer 피드백이 실제 수정으로 이어졌음이 iteration_log에 드러난다.
- **`reports/evaluation_report.json`이 존재하고, final_score ≥ 8.0 이다.**
- L1 smoke pass rate ≥ 90%
- L3 overall_score ≥ 7.5

## Forbidden

- **3회 미만 루프로 완료 선언하기**
- reviewer를 형식적 체크리스트로만 쓰기 (FAIL 항목 없이 전부 PASS 처리)
- revise 없이 reviewer만 남기고 종료하기
- 초안에서 polish까지 한 번에 끝내기 (루프를 무력화)
- 스펙 외 백엔드/API 서버 추가
- 토큰 절약을 이유로 루프를 생략하거나 축소하기


## UX Benchmark v2 Directive (additive)

이 하네스의 결과 UI 메타포는 **revision history loop** 다. 반복 개선 구조를 반영해 **revision history / improvement loop** 중심 UX로 구현한다.

### v2 규칙

- 초안 -> review -> revision의 개선 역사성이 사용자의 핵심 인식 포인트여야 한다.
- loop evidence는 중요하지만 기본 사용자 여정을 압도하면 안 된다.
- 각 iteration은 요약 중심으로 보여주고, 상세 evidence는 접을 수 있게 한다.
- Final/export는 마지막 승인된 revision과 직접 연결되어야 한다.

### v2 금지 패턴

- 기본 사용자 화면을 한 페이지 evidence board처럼 만들기
- scorecard/run artifact/review trace를 hero 근처에 모두 전면 노출하기
- 현재 단계와 다음 행동이 모호한 상태로 구현하기

