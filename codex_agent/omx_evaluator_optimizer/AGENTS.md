# AGENTS.md - omx_evaluator_optimizer workspace rules

## Mission

이 워크스페이스에서는 writer → reviewer → optimizer 루프를 **최소 10회, 최대 20회** 반복하여 `기술 블로그 포스트 자동 생성기`를 극단적으로 압박 테스트한다.

`evaluator_optimizer`가 반복 개선 실험이라면, `omx_evaluator_optimizer`는 **반복 개선 + 반복 검증 가혹 모드**다. 기준을 통과하는 것만으로는 부족하다. 거의 더 줄일 결함이 없을 때까지 밀어붙인다.

## Token / Loop Policy (필수)

- **루프를 줄이지 마라.** 이 하네스의 목적은 방어적 조기 종료를 깨는 것이다.
- 초안에서 polish까지 한 번에 끝내려 하지 마라.
- 매 루프마다 reviewer가 다시 판정하고, optimizer가 다시 수정한다.
- **최소 10회 루프 전에 완료 선언 금지**
- **최소 10회 verification cycle 전에 완료 선언 금지**
- reviewer가 9개 항목 전부 PASS 하기 전에는 release candidate로 간주하지 않는다.

## Product Summary

- 입력: `topic`, `audience`, `tone`, `length`
- 필수 단계: `Research results` → `Outline` → `Section drafts` → `Review notes` → `Final post`
- 필수 액션: `Generate post`, `Copy markdown`
- 백엔드 금지, 로컬 상태 또는 mock 데이터 사용

## Execution Model

### Phase 1: Writer (의도적으로 rough한 초안)

- 동작하는 end-to-end 흐름을 만든다.
- build가 통과하고 기본 UX가 이어지면 reviewer에게 넘긴다.
- 첫 초안에서 모든 디테일을 해결하지 마라. reviewer가 잡을 거리와 optimizer가 실제로 해결할 거리를 남겨라.

### Phase 2-N: Review → Revise 루프 (최소 10회)

매 iteration마다:
1. `harness/prompt_sets/reviewer.md`의 9개 항목을 전부 평가
2. PASS / PARTIAL / FAIL 판정과 구체적 수정 지시 작성
3. optimizer가 실제 코드로 수정
4. `npm run build` 확인
5. `runs/iteration_log.md` append
6. 필요 시 `runs/verification_log.md`에 구조/비교/평가 결과 append

## Verification Pressure (필수)

이 하네스는 앱만 만드는 것이 아니라, compare/evaluate/validate를 반복적으로 돌려도 품질이 유지되는지 보는 실험이다.

필수:
- `python scripts/validate_workspace.py`
- `python scripts/compare_scorecards.py`
- `HARNESS=omx_evaluator_optimizer uv run python scripts/evaluate.py`

위 흐름을 **총 10회 이상** 반복해 검증한다.

## Deliverables

- 구현 코드: `app/`
- 루프 기록: `runs/iteration_log.md`
- 검증 기록: `runs/verification_log.md`
- 실행 메모: `runs/run_manifest.json`, `runs/artifact_index.json`
- 리뷰 보고서: `reports/review_report.md`
- 점수 파일: `reports/scorecard.json`
- 통합 평가: `reports/evaluation_report.json`

## Done When

아래를 모두 만족해야 한다:

- `runs/iteration_log.md`에 **최소 10회** iteration 기록이 있다.
- 마지막 iteration에서 reviewer 체크리스트 **9개 전부 PASS**다.
- `runs/verification_log.md`에 **최소 10회** verification cycle 기록이 있다.
- L1 Playwright smoke pass rate = **100%**
- L2 build 성공
- L3 overall_score ≥ **9.2**
- `reports/evaluation_report.json` 존재
- `final_score ≥ 9.4`

## Forbidden

- 10회 미만 루프로 완료 선언하기
- 검증 로그 없이 “많이 돌렸다”고 주장하기
- reviewer가 FAIL/PARTIAL 없이 형식적으로 통과시키기
- revise 없이 review만 남기고 종료하기
- 스펙 외 백엔드/API 서버 추가
- 기존 다른 하네스의 기록을 지우거나 덮어써서 비교 결과를 왜곡하기


## UX Benchmark v2 Directive (additive)

이 하네스의 결과 UI 메타포는 **quality gauntlet** 다. 강화형 평가 구조를 반영해 **quality gauntlet / gate flow** 중심 UX로 구현한다.

### v2 규칙

- loop와 verification pressure가 이 하네스의 차별점이지만, product UI를 evidence가 덮어버리면 안 된다.
- 사용자는 현재 gate, 다음 gate, release 기준을 쉽게 이해해야 한다.
- verification/evidence surface는 product journey와 분리된 secondary layer로 두는 것이 바람직하다.
- 최종 release candidate와 export는 마지막 gate 통과와 강하게 연결되어야 한다.

### v2 금지 패턴

- 기본 사용자 화면을 한 페이지 evidence board처럼 만들기
- scorecard/run artifact/review trace를 hero 근처에 모두 전면 노출하기
- 현재 단계와 다음 행동이 모호한 상태로 구현하기

