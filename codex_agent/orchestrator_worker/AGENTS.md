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
- 통합 평가: `reports/evaluation_report.json` (L1/L2/L3 합산, `scripts/evaluate.py`가 생성)

## Post-Implementation: 평가 실행 (필수)

구현이 끝나면 반드시 아래를 순서대로 실행한다. **평가 없이 완료 선언하지 않는다.**

1. 앱 빌드 확인:
   ```bash
   cd app && npm install --prefer-offline && npm run build
   ```

2. `reports/scorecard.json` 작성 (`benchmark/rubric.md` 기준)

3. 3-layer 평가 실행:
   ```bash
   cd /home/user/projects/agent_setup/codex_agent
   HARNESS=orchestrator_worker uv run python scripts/evaluate.py
   ```

4. 통과 기준 확인:
   - L1 Playwright smoke pass rate ≥ 80%
   - L2 빌드 성공
   - L3 overall_score ≥ 6.0
   - `reports/evaluation_report.json` 존재

5. 미달 시 코드 수정 후 다시 빌드 → 평가 반복

UI가 Playwright 테스트를 통과하려면 `benchmark/evaluation_guide.md`의 "테스트 통과를 위한 UI 구현 필수사항" 섹션을 참고한다.

## Done When

- 분해 기준과 ownership이 설명 가능하다.
- worker 결과가 통합 후 하나의 제품처럼 보인다.
- 제품 스펙과 공통 done criteria를 만족한다.
- **`reports/evaluation_report.json`이 존재하고, final_score ≥ 7.0 이다.**

## Forbidden

- 작업 분해 없이 사실상 single agent처럼 진행하기
- ownership 충돌을 무시하고 통합하기
- 스펙 외 백엔드/API 서버 추가


## UX Benchmark v2 Directive (additive)

이 하네스의 결과 UI 메타포는 **task orchestration workspace** 다. 분해/통합 구조를 반영해 **orchestration dashboard + worker outputs** 중심 UX로 구현한다.

### v2 규칙

- orchestrator가 어떤 작업을 분배했고 무엇을 통합하는지 사용자가 이해할 수 있어야 한다.
- worker outputs는 분리해서 보이되, 기본 화면이 evidence 과밀 상태가 되면 안 된다.
- integration checkpoint를 별도 단계로 보여주는 것이 좋다.
- 최종 제품 surface는 worker trace보다 우선순위가 높아야 한다.

### v2 금지 패턴

- 기본 사용자 화면을 한 페이지 evidence board처럼 만들기
- scorecard/run artifact/review trace를 hero 근처에 모두 전면 노출하기
- 현재 단계와 다음 행동이 모호한 상태로 구현하기

