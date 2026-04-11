# implementation_task.md - 공통 구현 과제

모든 하네스는 동일한 starter app에서 출발해 `기술 블로그 포스트 자동 생성기`를 구현한다.

## 요구사항 요약

- 입력: `topic`, `audience`, `tone`, `length`
- 필수 단계: research → outline → section drafts → review → final post
- 필수 출력: `research_summary`, `outline`, `section_drafts`, `review_notes`, `final_post`
- 필수 UX: 단계 표시, 로딩/빈/에러 상태, export 액션

## 구현 원칙

- 백엔드는 만들지 않는다.
- mock 데이터와 로컬 상태로 충분하다.
- UI 스타일은 자유지만 공통 UI 계약은 지킨다.
- 하네스 구조에 맞는 구현 프로세스를 문서와 산출물에 남긴다.
