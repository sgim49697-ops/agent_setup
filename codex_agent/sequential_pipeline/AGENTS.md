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
   HARNESS=sequential_pipeline uv run python scripts/evaluate.py
   ```

4. 통과 기준 확인:
   - L1 Playwright smoke pass rate ≥ 80%
   - L2 빌드 성공
   - L3 overall_score ≥ 6.0
   - `reports/evaluation_report.json` 존재

5. 미달 시 코드 수정 후 다시 빌드 → 평가 반복

UI가 Playwright 테스트를 통과하려면 `benchmark/evaluation_guide.md`의 "테스트 통과를 위한 UI 구현 필수사항" 섹션을 참고한다.

## Done When

- 단계별 산출물이 UI 상에서 자연스럽게 이어진다.
- reviewer 단계 결과가 최종 포스트에 반영된다.
- 제품 스펙과 공통 done criteria를 만족한다.
- **`reports/evaluation_report.json`이 존재하고, final_score ≥ 7.0 이다.**

## Forbidden

- researcher/outliner/writer/reviewer 순서를 무시하기
- 아웃라인 없이 본문부터 구현하기
- 스펙 외 백엔드/API 서버 추가


## UX Benchmark v2 Directive (additive)

이 하네스의 결과 UI 메타포는 **route-based stepper** 다. 순차 파이프라인 성격을 반영해 **stepper / route progression** 중심 UX로 구현한다.

### v2 규칙

- researcher -> outliner -> writer -> reviewer handoff가 UI 단계에서도 느껴져야 한다.
- 현재 단계와 다음 단계가 명확해야 한다.
- 기본 화면에서 모든 단계 산출물을 동시에 펼치지 않는다.
- reviewer 수정 결과가 final/export에 연결되는 흐름이 자연스럽게 보여야 한다.

### v2 금지 패턴

- 기본 사용자 화면을 한 페이지 evidence board처럼 만들기
- scorecard/run artifact/review trace를 hero 근처에 모두 전면 노출하기
- 현재 단계와 다음 행동이 모호한 상태로 구현하기

