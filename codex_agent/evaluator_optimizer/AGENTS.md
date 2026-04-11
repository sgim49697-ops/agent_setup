# AGENTS.md - evaluator_optimizer workspace rules

## Mission

이 워크스페이스에서는 writer가 초안을 만들고, reviewer가 점검하며, optimizer가 피드백을 반영해 반복 개선하는 방식으로 `기술 블로그 포스트 자동 생성기`를 구현한다.

## Product Summary

- 입력: `topic`, `audience`, `tone`, `length`
- 필수 단계: `Research results` → `Outline` → `Section drafts` → `Review notes` → `Final post`
- 필수 액션: `Generate post`, `Copy markdown`
- 백엔드 금지, 로컬 상태 또는 mock 데이터 사용

## Execution Model

- writer → reviewer → revise 루프를 명시적으로 가진다.
- reviewer는 평가 기준에 따라 pass/fail을 내린다.
- revise는 리뷰 항목을 실제 변경으로 닫아야 한다.

## Deliverables

- 구현 코드: `app/`
- 루프 흔적: `runs/run_manifest.json`, `runs/artifact_index.json`
- 리뷰 보고서: `reports/review_report.md`
- 점수 파일: `reports/scorecard.json`

## Done When

- reviewer 피드백이 실제 수정으로 이어졌다고 설명할 수 있다.
- 최종 pass 기준이 충족된다.
- 제품 스펙과 공통 done criteria를 만족한다.

## Forbidden

- reviewer를 형식적 체크리스트로만 쓰기
- revise 없이 reviewer만 남기고 종료하기
- 스펙 외 백엔드/API 서버 추가
