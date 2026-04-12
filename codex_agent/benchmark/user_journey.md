# user_journey.md - UX Benchmark v2 사용자 여정 계약

이 문서는 benchmark v2에서 권장하는 **사용자 여정 중심 흐름**을 정의한다.

## 목적

사용자가 한 화면에 모든 evidence를 읽는 대신, **단계별로 생성/검토/승인/수정** 하는 흐름을 자연스럽게 따라가게 만드는 것이 목적이다.

## 권장 여정

### 1. Brief / Input

사용자가 아래를 입력한다.

- Topic
- Audience
- Tone
- Length

기대 행동:
- `Generate post`
- 또는 동등한 “start generation” 계열 CTA

### 2. Research

사용자는 research summary를 확인한다.

기대 행동:
- research 채택
- regenerate
- back/edit input

### 3. Outline

사용자는 outline 구조를 확인한다.

기대 행동:
- outline 승인
- 수정/재생성
- research로 되돌아가기

### 4. Draft

사용자는 section drafts 또는 draft preview를 본다.

기대 행동:
- review로 보내기
- 특정 섹션 재생성

### 5. Review

사용자는 review notes, critique, revision plan을 본다.

기대 행동:
- revisions 적용
- 다시 draft 보기

### 6. Final / Export

사용자는 최종 포스트를 본다.

기대 행동:
- `Copy markdown`
- start over
- optional evidence/debug 보기

## 핵심 규칙

1. 각 단계는 현재 단계임을 명확히 보여야 한다.
2. 각 단계에는 primary action이 있어야 한다.
3. 다음 단계로 넘어갈 이유와 결과가 보여야 한다.
4. export는 final step에서 가장 강하게 드러나야 한다.
5. evidence/debug 정보는 기본 여정을 방해하지 않아야 한다.
6. 사용자에게 직접 노출되는 설명/상태/출력 텍스트는 한국어 우선이어야 한다.
