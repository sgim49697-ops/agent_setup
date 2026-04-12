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
   HARNESS=parallel_sections uv run python scripts/evaluate.py
   ```

4. 통과 기준 확인:
   - L1 Playwright smoke pass rate ≥ 80%
   - L2 빌드 성공
   - L3 overall_score ≥ 6.0
   - `reports/evaluation_report.json` 존재

5. 미달 시 코드 수정 후 다시 빌드 → 평가 반복

UI가 Playwright 테스트를 통과하려면 `benchmark/evaluation_guide.md`의 "테스트 통과를 위한 UI 구현 필수사항" 섹션을 참고한다.

## Done When

- 섹션별 작성 상태가 병렬 구조를 반영한다.
- merge 후 톤과 정보 계층이 하나의 글처럼 읽힌다.
- 제품 스펙과 공통 done criteria를 만족한다.
- **`reports/evaluation_report.json`이 존재하고, final_score ≥ 7.0 이다.**

## Forbidden

- 병렬 구조 없이 사실상 single agent로 처리하기
- merge 품질 점검 없이 완료 선언하기
- 스펙 외 백엔드/API 서버 추가


## UX Benchmark v2 Directive (additive)

이 하네스의 결과 UI 메타포는 **board-based composition workspace** 다. 병렬 작성 구조를 반영해 **section board / composition workspace** 중심 UX로 구현한다.

### v2 규칙

- 공통 research/outline 이후 여러 섹션이 병렬로 작성된다는 점이 보드 구조에서 느껴져야 한다.
- merge 이전과 merge 이후 상태를 구분해야 한다.
- 모든 텍스트를 길게 펼치기보다 카드/board 구조로 분리한다.
- 최종 merged article은 별도 final/export 문맥에서 보여준다.

### v2 금지 패턴

- 기본 사용자 화면을 한 페이지 evidence board처럼 만들기
- scorecard/run artifact/review trace를 hero 근처에 모두 전면 노출하기
- 현재 단계와 다음 행동이 모호한 상태로 구현하기

