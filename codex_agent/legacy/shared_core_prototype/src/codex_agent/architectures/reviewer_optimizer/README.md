# reviewer_optimizer - 구현자/검증자 분리형

`reviewer_optimizer`는 구현자와 리뷰어를 분리해 결함 탐지율을 높이는 구조입니다. 고위험 변경이나 품질 최우선 상황에서 특히 유리합니다.

## 기대 특성

- 강점: 높은 defect discovery, 강한 verification
- 약점: 시간과 비용이 늘어나기 쉬움

## 실험 포인트

- overall score뿐 아니라 evaluation catches와 runtime을 같이 본다.
- reviewer 기준이 흐리면 오히려 루프만 길어질 수 있다.
