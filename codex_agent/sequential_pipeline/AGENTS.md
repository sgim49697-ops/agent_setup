# AGENTS.md - sequential_pipeline workspace rules

## Mission

이 워크스페이스에서는 `researcher -> outliner -> writer -> reviewer` 순차 파이프라인을 따르는 방식으로 `기술 블로그 포스트 자동 생성기`를 구현한다. 각 단계는 앞 단계 산출물을 입력으로 받는다고 가정한다.

## Product Summary

- 입력: `topic`, `audience`, `tone`, `length`
- 필수 단계: `Research results` → `Outline` → `Section drafts` → `Review notes` → `Final post`
- 필수 액션: `Generate post`, `Copy markdown`
- 백엔드 금지, 로컬 상태 또는 mock 데이터 사용

## Execution Model

- 역할 순서를 바꾸지 않는다.
- 각 단계는 명확한 입력/출력을 남긴다.
- 단계 계약이 흔들리면 UI보다 먼저 흐름을 바로잡는다.

## Deliverables

- 구현 코드: `app/`
- 단계 계약 준수 흔적: `runs/run_manifest.json`, `runs/artifact_index.json`
- 리뷰 보고서: `reports/review_report.md`
- 점수 파일: `reports/scorecard.json`

## Done When

- 단계별 산출물이 UI 상에서 자연스럽게 이어진다.
- reviewer 단계 결과가 최종 포스트에 반영된다.
- 제품 스펙과 공통 done criteria를 만족한다.

## Forbidden

- researcher/outliner/writer/reviewer 순서를 무시하기
- 아웃라인 없이 본문부터 구현하기
- 스펙 외 백엔드/API 서버 추가
