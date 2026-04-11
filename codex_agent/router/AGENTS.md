# AGENTS.md - router workspace rules

## Mission

이 워크스페이스에서는 주제 성격과 난이도에 따라 specialist 경로를 선택하는 router 패턴으로 `기술 블로그 포스트 자동 생성기`를 구현한다.

## Product Summary

- 입력: `topic`, `audience`, `tone`, `length`
- 필수 단계: `Research results` → `Outline` → `Section drafts` → `Review notes` → `Final post`
- 필수 액션: `Generate post`, `Copy markdown`
- 백엔드 금지, 로컬 상태 또는 mock 데이터 사용

## Execution Model

- router가 specialist 경로를 고른다.
- specialist는 선택 근거가 남아야 한다.
- fallback 경로가 반드시 있다.

## Deliverables

- 구현 코드: `app/`
- routing 흔적: `runs/run_manifest.json`, `runs/artifact_index.json`
- 리뷰 보고서: `reports/review_report.md`
- 점수 파일: `reports/scorecard.json`

## Done When

- 라우팅 기준이 UI 또는 코드 구조에 드러난다.
- specialist 선택 근거가 설명 가능하다.
- fallback 경로가 존재한다.
- 제품 스펙과 공통 done criteria를 만족한다.

## Forbidden

- router 없이 사실상 고정 파이프라인으로 처리하기
- specialist 간 차이를 설명하지 못하는 상태
- 스펙 외 백엔드/API 서버 추가
