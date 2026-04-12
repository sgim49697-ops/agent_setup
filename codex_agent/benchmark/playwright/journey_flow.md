# journey_flow.md - UX Benchmark v2 여정 테스트 계약

이 문서는 v2 benchmark에서 기대하는 **사용자 여정 중심** Playwright 테스트 흐름을 정의한다.

## 목표

존재 기반 smoke test를 보완하여, 사용자가 실제로 **단계를 따라 이동하며 생성/검토/export** 하는지 검증한다.

## 기본 여정

1. 앱 진입
2. Brief/Input 단계 확인
3. Topic / Audience / Tone / Length 입력
4. primary CTA 실행
5. Research 단계 진입 확인
6. Research 승인 또는 다음 단계 action 실행
7. Outline 단계 진입 확인
8. Outline 승인 또는 다음 단계 action 실행
9. Draft / Review 단계 이동 확인
10. Final / Export 단계에서만 export action이 강하게 노출되는지 확인

## 권장 step 식별 방식

v2 구현은 아래 중 하나 이상을 제공하는 것을 권장한다.

- `data-journey-step="<name>"`
- `aria-current="step"`
- stepper / nav / breadcrumb의 현재 단계 표시
- route path (`/research`, `/outline`, `/draft`, `/review`, `/final`)

## 권장 action 라벨

테스트 친화성을 위해 아래 계열 라벨을 권장한다.

- Research:
  - `Use research`
  - `Continue to outline`
  - `Approve research`
- Outline:
  - `Approve outline`
  - `Continue to draft`
- Review:
  - `Apply revisions`
  - `Continue to final`
- Final:
  - `Copy markdown`

## 실패로 간주할 패턴

- 모든 산출물이 첫 화면에 동시에 펼쳐져 있고 step 이동이 없는 경우
- current step / next action이 불명확한 경우
- export가 final 단계와 분리되어 앞단계에서 과하게 노출되는 경우
- evidence/debug 정보가 사용자 기본 여정을 압도하는 경우
