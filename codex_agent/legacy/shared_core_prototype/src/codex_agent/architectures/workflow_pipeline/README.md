# workflow_pipeline - 고정 파이프라인형

`workflow_pipeline`은 `localize -> repair -> validate` 같은 고정 단계를 유지하는 구조입니다. 재현성과 디버깅 편의성이 높고, 국소적인 버그 수정이나 명확한 변경 과제에 잘 맞습니다.

## 기대 특성

- 강점: 일관성, 낮은 분산, 단계별 개선 용이성
- 약점: 요구사항이 애매할 때 전략 전환이 느릴 수 있음

## 실험 포인트

- ambiguity가 낮은 과제에서 baseline으로 쓰기 좋다.
- ambiguity가 높은 과제에서는 requirement coverage와 wrong assumption을 주의 깊게 본다.
