# spec.md - 기술 블로그 포스트 자동 생성기 공통 제품 스펙

## 제품 목표

사용자가 기술 주제를 입력하면, 구조화된 리서치와 작성 단계를 거쳐 읽기 좋은 기술 블로그 초안을 만드는 브라우저 기반 도구를 구현한다.

이 사이트는 `Codex` 하네스 비교를 위한 공통 과제로 사용된다. 기능만 맞추는 것이 아니라, 흐름의 명확성, 상태 표현, UI 완성도까지 함께 평가 대상이다.

## 입력 계약

모든 구현은 아래 입력 필드를 지원해야 한다.

- `topic`: 작성할 기술 주제
- `audience`: 대상 독자 수준
- `tone`: 문체 톤
- `length`: 글 분량

권장 예시:

- audience: `beginner`, `practitioner`, `advanced`
- tone: `clear`, `pragmatic`, `opinionated`
- length: `short`, `medium`, `long`

## 필수 단계

1. 주제 입력
2. 리서치 결과 생성/표시
3. 아웃라인 생성
4. 섹션별 초안 작성
5. 리뷰/수정
6. 최종 포스트 출력 및 export

## 단계별 산출물

- `research_summary`
- `outline`
- `section_drafts`
- `review_notes`
- `final_post`

## 필수 제품 요구사항

- 단계 전환이 시각적으로 명확해야 한다.
- 현재 단계, 다음 단계, 완료 상태를 사용자가 바로 이해할 수 있어야 한다.
- 결과물은 최소 `Markdown`으로 볼 수 있어야 한다.
- 가능하면 `copy to clipboard`를 제공한다.
- 모바일과 데스크톱에서 모두 usable 해야 한다.
- loading, empty, error 상태를 반드시 가진다.
- 키보드 접근성과 기본 `aria` 레이블을 갖춘다.

## 비목표

- 별도 백엔드/API 서버 구축
- 사용자 인증
- 저장/공유/배포 기능
- 실제 퍼블리싱 CMS 연동

v1은 프론트엔드 중심 데모 사이트로 본다. 상태 관리는 로컬 상태 또는 mock 데이터로 충분하다.
