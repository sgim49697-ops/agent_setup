# metrics.md - 공통 평가 지표 정의

## 1. Task Success

- acceptance test 통과율
- 필수 산출물 생성 여부
- 시나리오 목표 달성 여부

## 2. Requirement Coverage

- 필수 요구사항 충족률
- 선택 요구사항 충족률
- 모호한 요구 해석의 설명 가능성

## 3. Regression / Safety

- 기존 테스트 회귀 여부
- 금지된 파일/범위 외 수정 여부
- 실행 실패, 파싱 실패, premature done 비율

## 4. Efficiency

- 총 실행 시간
- 모델 호출 수
- 토큰 비용 추정치
- 재시도, 재계획 횟수
- 멀티에이전트 구조에서 병렬성 대비 실제 절감 효과

## 5. Process Quality

- 계획 품질
- 검증 루프 품질
- evaluator가 잡은 결함 수
- self-check 없이 완료 선언한 비율
- 장기 실행형의 resume 일관성

## 종합 점수 계산

기본 가중치는 `configs/global.yaml`에서 관리한다.

- `task_success`: 0.30
- `requirement_coverage`: 0.25
- `regression_score`: 0.20
- `efficiency_score`: 0.10
- `process_score`: 0.15

실험 간 공정성을 위해 가중치 변경은 별도 실험 배치로 분리한다.
