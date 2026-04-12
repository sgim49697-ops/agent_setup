# done_criteria.md - evaluator_optimizer 완료 기준 (강화)

아래를 **모두** 만족해야 완료로 본다.

## 기본 완료 기준

- 앱이 로컬에서 실행 가능하다.
- 필수 입력 필드와 단계 영역이 모두 존재한다.
- 사용자가 생성 플로우를 끝까지 따라갈 수 있다.
- 최종 포스트가 화면에 렌더링된다.
- `Copy markdown` 또는 동등한 export 액션이 동작한다.
- 모바일/데스크톱 화면이 모두 usable 하다.
- 기본 접근성 레이블이 존재한다.
- `run_manifest.json`, `artifact_index.json`, `review_report.md`, `scorecard.json`을 남긴다.

## evaluator_optimizer 전용 기준 (강화)

- `runs/iteration_log.md`에 **최소 3회** iteration 기록이 존재한다.
- 각 iteration에 reviewer 판정 (PASS/PARTIAL/FAIL 수)이 명시되어 있다.
- 마지막 iteration에서 reviewer 체크리스트 9개 중 **8개 이상 PASS**다.
- iteration 간 FAIL→PASS 개선이 추적 가능하다.

## 3-layer 평가 기준 (이 하네스는 상향 적용)

- `HARNESS=evaluator_optimizer uv run python scripts/evaluate.py` (프로젝트 루트에서)
- L1 Playwright smoke pass rate ≥ **90%** (일반 하네스: 80%)
- L2 빌드 성공
- L3 scorecard `overall_score` ≥ **7.5** (일반 하네스: 6.0)
- `reports/evaluation_report.json`이 자동 생성되어야 한다.
- `final_score` ≥ **8.0** (일반 하네스: 7.0)


## UX Benchmark v2 additive completion gates

이 하네스는 공통 완료 기준 외에 아래를 추가로 만족하는 것을 권장한다.

- 첫 화면에서 이 하네스의 UI 메타포(**revision history loop**)가 느껴진다.
- 사용자는 현재 단계와 다음 행동을 바로 이해할 수 있다.
- 필수 산출물이 모두 존재하되 한 화면 정보량이 과도하지 않다.
- product UI와 evidence UI가 적절히 분리되어 있다.
- final/export는 마지막 단계 문맥에서 가장 명확하게 노출된다.
- manual UI review에서 "무슨 앱인지 모르겠다" 수준의 혼란이 줄어든다.

