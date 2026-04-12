# done_criteria.md - omx_evaluator_optimizer 완료 기준

아래를 모두 만족해야 완료로 본다.

## 기본 완료 기준

- 앱이 로컬에서 실행 가능하다.
- 필수 입력 필드와 단계 영역이 모두 존재한다.
- 사용자가 생성 플로우를 끝까지 따라갈 수 있다.
- 최종 포스트가 화면에 렌더링된다.
- `Copy markdown` 또는 동등한 export 액션이 동작한다.
- 모바일/데스크톱 화면이 모두 usable 하다.
- 기본 접근성 레이블이 존재한다.

## OMX evaluator_optimizer 전용 기준

- `runs/iteration_log.md`에 **최소 10회** iteration 기록이 존재한다.
- `runs/verification_log.md`에 **최소 10회** verification cycle 기록이 존재한다.
- 마지막 iteration에서 reviewer 체크리스트 9개 모두 PASS다.
- iteration 간 FAIL/PARTIAL → PASS 개선이 추적 가능하다.

## 평가 기준

- `python scripts/validate_workspace.py`
- `python scripts/compare_scorecards.py`
- `HARNESS=omx_evaluator_optimizer uv run python scripts/evaluate.py`

위 흐름이 증거와 함께 반복되어야 한다.

- L1 Playwright smoke pass rate = **100%**
- L2 build 성공
- L3 scorecard `overall_score` ≥ **9.2**
- `reports/evaluation_report.json` 자동 생성
- `final_score` ≥ **9.4**

## 산출물

- `runs/run_manifest.json`
- `runs/artifact_index.json`
- `runs/iteration_log.md`
- `runs/verification_log.md`
- `reports/review_report.md`
- `reports/scorecard.json`
- `reports/evaluation_report.json`


## UX Benchmark v2 additive completion gates

이 하네스는 공통 완료 기준 외에 아래를 추가로 만족하는 것을 권장한다.

- 첫 화면에서 이 하네스의 UI 메타포(**quality gauntlet**)가 느껴진다.
- 사용자는 현재 단계와 다음 행동을 바로 이해할 수 있다.
- 필수 산출물이 모두 존재하되 한 화면 정보량이 과도하지 않다.
- product UI와 evidence UI가 적절히 분리되어 있다.
- final/export는 마지막 단계 문맥에서 가장 명확하게 노출된다.
- manual UI review에서 "무슨 앱인지 모르겠다" 수준의 혼란이 줄어든다.

