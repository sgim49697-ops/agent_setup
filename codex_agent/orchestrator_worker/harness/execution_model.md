# execution_model.md - orchestrator_worker 실행 모델

## 흐름

1. orchestrator가 제품을 하위 작업으로 쪼갠다.
2. worker가 UI, state, content surface를 나눠 맡는다.
3. orchestrator가 통합과 final review를 수행한다.

## 규칙

- 각 worker는 겹치지 않는 책임을 가진다.
- 통합 기준이 먼저 정의되어야 한다.
- final reviewer는 통합 후 일관성을 본다.


## 마지막 단계: 자동 평가

구현 완료 후 반드시 실행한다. 이 단계를 건너뛰면 Done 조건을 만족하지 못한다.

```bash
cd /home/user/projects/agent_setup/codex_agent
HARNESS=orchestrator_worker uv run python scripts/evaluate.py
```

평가가 생성하는 `reports/evaluation_report.json`의 `final_score ≥ 7.0`이어야 완료다.
미달 시 코드를 수정하고 다시 평가한다.


## UX Benchmark v2 Presentation Model (additive)

이 하네스는 v2 기준에서 **task orchestration workspace** 로 보여야 한다.

### 권장 여정 구조

- Brief/Input 후 orchestration plan을 요약한다.
- worker output은 카드/stream/ownership view 중 하나로 정리한다.
- integration/review 단계에서 orchestrator가 결과를 묶는 흐름을 명확히 한다.
- Final/export는 통합 결과물 중심으로 제시한다.

### Product UI / Evidence UI 분리

- product UI는 현재 단계와 다음 행동 중심으로 구성한다.
- evidence/debug/scorecard/review trace는 탭, drawer, collapsed section, 또는 별도 route로 분리할 수 있다.
- 필수 산출물은 모두 존재해야 하지만 동시에 한 화면에 전부 펼칠 필요는 없다.

