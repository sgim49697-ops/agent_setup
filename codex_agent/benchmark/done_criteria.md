# done_criteria.md - 공통 완료 기준

아래를 모두 만족해야 완료로 본다.

- 앱이 로컬에서 실행 가능하다.
- 필수 입력 필드와 단계 영역이 모두 존재한다.
- 사용자가 생성 플로우를 끝까지 따라갈 수 있다.
- 최종 포스트가 화면에 렌더링된다.
- `Copy markdown` 또는 동등한 export 액션이 동작한다.
- 모바일/데스크톱 화면이 모두 usable 하다.
- 기본 접근성 레이블이 존재한다.
- `run_manifest.json`, `artifact_index.json`, `review_report.md`, `scorecard.json`을 남긴다.
- 3-layer 평가를 통과한다:
  - L1: `HARNESS=<name> uv run python scripts/evaluate.py` 실행 시 Playwright smoke test pass rate ≥ 80%
  - L2: 빌드 성공 (`npm run build` 정상 종료)
  - L3: `reports/scorecard.json`의 `overall_score` ≥ 6.0
- `reports/evaluation_report.json`이 자동 생성되어야 한다.

## UX Benchmark v2 additive done criteria

v2 실험에서는 아래를 추가로 충족하는 것을 권장한다.

- 첫 화면에서 서비스 목적과 다음 행동이 5초 안에 이해된다.
- 필수 산출물이 모두 존재하되, 한 화면 정보량이 과도하지 않다.
- 사용자는 Research → Outline → Draft → Review → Final/Export 흐름을 따라갈 수 있다.
- product UI와 evidence UI가 적절히 분리되어 있다.
- 하네스별 interaction model 차이가 실제 결과 화면에서도 드러난다.
- 수동 또는 자동 journey review 결과가 `benchmark/manual_ui_review/` 아래에 남아 있다.
