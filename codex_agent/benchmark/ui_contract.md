# ui_contract.md - 공통 UI 계약

## 필수 화면 요소

- `Topic` 입력 필드
- `Audience` 선택 필드
- `Tone` 선택 필드
- `Length` 선택 필드
- primary action: `Generate post`
- 단계 표시기
- `Research results` 영역
- `Outline` 영역
- `Section drafts` 영역
- `Review notes` 영역
- `Final post` 영역
- export action: `Copy markdown`

## 필수 상태

- initial
- loading
- populated
- review complete
- export ready
- error

## 상태 표현 규칙

- loading은 단계별 진행이 드러나야 한다.
- error는 사용자가 다음에 무엇을 해야 하는지 보여줘야 한다.
- populated 상태는 현재 생성된 산출물과 아직 남은 단계를 같이 보여줘야 한다.

## 접근성 계약

- 모든 입력은 시각 라벨과 programmatic label을 갖는다.
- 버튼은 의미 있는 텍스트를 가져야 한다.
- 상태 변화는 필요한 경우 `aria-live` 또는 동등한 피드백으로 전달한다.

## UX Benchmark v2 UI Contract (additive)

이 섹션은 기존 v1 요소 계약을 유지하면서, **더 읽기 쉬운 제품 UX**를 만들기 위한 v2 UI 규칙을 추가한다.

### 1. Product surface vs evidence surface

- 기본 사용자 화면은 **현재 단계 진행**에 필요한 정보만 우선 노출한다.
- 아래 항목은 기본 화면에서 과도하게 전면 노출하지 않는 것을 권장한다:
  - scorecard
  - run manifest
  - artifact index
  - verbose reviewer trace
  - internal loop statistics
- 위 정보는 별도 탭, drawer, accordion, debug route로 분리 가능하다.

### 2. Step presentation rules

- 각 step에는 **명확한 primary action 1개**가 있어야 한다.
- secondary action은 최대 2개를 권장한다.
- 긴 세부 정보는 기본 collapsed 또는 하위 step으로 분리 가능하다.
- step 이동은 버튼, stepper, route, tab, board interaction 등 자유지만 **현재 위치와 다음 행동**이 분명해야 한다.

### 3. Required outputs in v2

다음 산출물은 모두 존재해야 한다:

- `Research results`
- `Outline`
- `Section drafts`
- `Review notes`
- `Final post`

단, v2에서는 위 산출물이 반드시 **동시에 한 화면에 전부 노출될 필요는 없다**.

### 4. Export behavior

- `Copy markdown`는 final/export 단계에서 가장 명확하게 노출되어야 한다.
- export 전 상태에서 copy를 눌렀을 때는 왜 아직 안 되는지 설명해야 한다.
- export 성공/실패 후에는 사용자가 바로 이해할 수 있는 피드백이 필요하다.

### 5. Cognitive load guidance

v2 권장사항:

- 한 step에서 핵심 카드/패널은 3개 이하 권장
- 첫 화면에서 사용자가 읽어야 할 핵심 덩어리는 2~3개 이내 권장
- “증거”와 “행동”이 같은 시선 우선순위를 차지하지 않도록 설계

### 6. Language guidance

- 기본 사용자 가시 텍스트는 **한국어 우선**을 권장한다.
- 현재 v1 smoke와의 호환성이 필요할 때는 아래 방식 중 하나를 사용한다:
  - English `aria-label`
  - English test hook / hidden helper text
  - bilingual label (`주제 Topic`)의 제한적 사용
- 단, 사용자에게 직접 보이는 긴 안내/결과물/상태 텍스트가 영어 위주가 되지 않도록 한다.
