# AGENTS.md - orchestrator_worker workspace rules

## Mission

이 워크스페이스에서는 orchestrator가 작업을 분해하고 worker가 하위 단위를 구현한 뒤, orchestrator가 다시 통합하는 방식으로 `기술 블로그 포스트 자동 생성기`를 구현한다.

## Product Summary

- 입력: `topic`, `audience`, `tone`, `length`
- 필수 단계: `Research results` → `Outline` → `Section drafts` → `Review notes` → `Final post`
- 필수 액션: `Generate post`, `Copy markdown`
- 백엔드 금지, 로컬 상태 또는 mock 데이터 사용

## Execution Model

- orchestrator가 작업 단위를 먼저 정의한다.
- worker는 ownership을 가진다.
- integration과 consistency review는 orchestrator 책임이다.

## Deliverables

- 구현 코드: `app/`
- 분해/통합 흔적: `runs/run_manifest.json`, `runs/artifact_index.json`
- 리뷰 보고서: `reports/review_report.md`
- 점수 파일: `reports/scorecard.json`

## Done When

- 분해 기준과 ownership이 설명 가능하다.
- worker 결과가 통합 후 하나의 제품처럼 보인다.
- 제품 스펙과 공통 done criteria를 만족한다.

## Forbidden

- 작업 분해 없이 사실상 single agent처럼 진행하기
- ownership 충돌을 무시하고 통합하기
- 스펙 외 백엔드/API 서버 추가
