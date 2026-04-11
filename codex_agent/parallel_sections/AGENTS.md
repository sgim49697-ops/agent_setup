# AGENTS.md - parallel_sections workspace rules

## Mission

이 워크스페이스에서는 공통 research와 outline 이후, 섹션별 작성 단위를 병렬로 분리하는 방식으로 `기술 블로그 포스트 자동 생성기`를 구현한다.

## Product Summary

- 입력: `topic`, `audience`, `tone`, `length`
- 필수 단계: `Research results` → `Outline` → `Section drafts` → `Review notes` → `Final post`
- 필수 액션: `Generate post`, `Copy markdown`
- 백엔드 금지, 로컬 상태 또는 mock 데이터 사용

## Execution Model

- 공통 단계: research, outline
- 병렬 단계: section writer units
- 통합 단계: merge + review

## Deliverables

- 구현 코드: `app/`
- 병렬 작성 계약 흔적: `runs/run_manifest.json`, `runs/artifact_index.json`
- 리뷰 보고서: `reports/review_report.md`
- 점수 파일: `reports/scorecard.json`

## Done When

- 섹션별 작성 상태가 병렬 구조를 반영한다.
- merge 후 톤과 정보 계층이 하나의 글처럼 읽힌다.
- 제품 스펙과 공통 done criteria를 만족한다.

## Forbidden

- 병렬 구조 없이 사실상 single agent로 처리하기
- merge 품질 점검 없이 완료 선언하기
- 스펙 외 백엔드/API 서버 추가
