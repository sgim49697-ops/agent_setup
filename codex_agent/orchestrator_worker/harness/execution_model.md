# execution_model.md - orchestrator_worker 실행 모델

## 흐름

1. orchestrator가 제품을 하위 작업으로 쪼갠다.
2. worker가 UI, state, content surface를 나눠 맡는다.
3. orchestrator가 통합과 final review를 수행한다.

## 규칙

- 각 worker는 겹치지 않는 책임을 가진다.
- 통합 기준이 먼저 정의되어야 한다.
- final reviewer는 통합 후 일관성을 본다.
