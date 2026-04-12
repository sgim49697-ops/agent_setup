# ia_contract.md - UX Benchmark v2 정보구조 계약

이 문서는 v2 benchmark에서 **정보구조와 화면 밀도**에 대한 규칙을 정의한다.

## 1. 기본 원칙

- 사용자 기본 화면은 action-first여야 한다.
- evidence는 comparison-friendly하되, product UX를 오염시키지 않아야 한다.
- 현재 단계에서 지금 꼭 필요한 정보만 전면 노출한다.

## 2. 화면 밀도 가이드

권장:

- 첫 화면 핵심 패널 2~3개
- 한 step 핵심 카드 3개 이하
- primary CTA 1개
- secondary CTA 최대 2개

비권장:

- 모든 산출물/evidence를 기본 화면에 동시에 노출
- scorecard, artifact, run manifest를 hero 아래에 바로 노출
- 사용자 action보다 시스템 trace가 더 눈에 띄는 화면

## 3. Evidence 분리 방식

다음 방식 중 하나 이상을 권장한다.

- Debug / Evidence 탭
- Drawer / Side panel
- Accordion / collapsed section
- 별도 route (`/debug`, `/review`, `/trace`)

## 4. Final/export step 규칙

- final post와 export action은 같은 단계 또는 같은 맥락에서 보여야 한다.
- export 전 단계에서는 copy action을 약하게 노출하거나, guard 메시지와 함께 보여준다.
- export 성공/실패 피드백은 명확해야 한다.

## 5. 하네스별 구조 차별화

하네스는 내부 구조뿐 아니라 결과 UI에서도 차별화되어야 한다.

예:
- wizard
- stepper
- decision tree
- task board
- revision history
- gauntlet / gate flow
