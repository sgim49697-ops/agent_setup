# execution_model.md - evaluator_optimizer 실행 모델

## 흐름

1. writer가 기본 제품 흐름과 UI를 만든다.
2. reviewer가 pass/fail 기준으로 문제를 식별한다.
3. optimizer가 피드백을 반영한다.
4. 필요한 경우 루프를 반복한다.

## 규칙

- reviewer는 품질 기준을 구체적으로 남긴다.
- revise는 실제 수정 결과를 남긴다.
- 최대 반복 횟수는 제한한다.
