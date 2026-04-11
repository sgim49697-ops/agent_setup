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
