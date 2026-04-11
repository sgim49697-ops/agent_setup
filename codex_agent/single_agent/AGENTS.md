# AGENTS.md - single_agent workspace rules

## Mission

이 워크스페이스에서는 하나의 주 에이전트가 `기술 블로그 포스트 자동 생성기`를 끝까지 구현한다. 역할 분리는 문서 수준으로만 허용하고, 별도 하위 에이전트나 단계별 다른 persona를 운영하지 않는다.

## Product Summary

- 입력: `topic`, `audience`, `tone`, `length`
- 필수 단계: `Research results` → `Outline` → `Section drafts` → `Review notes` → `Final post`
- 필수 액션: `Generate post`, `Copy markdown`
- 백엔드 금지, 로컬 상태 또는 mock 데이터 사용

## Execution Model

- 하나의 일관된 계획과 구현 흐름으로 처리한다.
- 탐색, 구현, 검증은 가능하지만 모두 같은 주체가 이어서 수행한다.
- 문서 분할보다 화면 완성도와 흐름 일관성을 우선한다.

## Deliverables

- 구현 코드: `app/`
- 실행 메모: `runs/run_manifest.json`, `runs/artifact_index.json`
- 리뷰 보고서: `reports/review_report.md`
- 점수 파일: `reports/scorecard.json`

## Done When

- `spec/`의 제품 스펙과 `harness/done_criteria.md`를 만족한다.
- 앱이 로컬에서 실행 가능하다.
- 필수 단계 UI와 export 액션이 존재한다.
- 결과 보고서 파일을 남긴다.

## Forbidden

- 스펙 외 백엔드/API 서버 추가
- 인증, 저장, CMS 배포 기능 추가
- 요구사항에 없는 페이지 수 확장
- 하네스 구조를 multi-agent처럼 바꾸기
