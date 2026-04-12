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
   HARNESS=router uv run python scripts/evaluate.py
   ```

4. 통과 기준 확인:
   - L1 Playwright smoke pass rate ≥ 80%
   - L2 빌드 성공
   - L3 overall_score ≥ 6.0
   - `reports/evaluation_report.json` 존재

5. 미달 시 코드 수정 후 다시 빌드 → 평가 반복

UI가 Playwright 테스트를 통과하려면 `benchmark/evaluation_guide.md`의 "테스트 통과를 위한 UI 구현 필수사항" 섹션을 참고한다.

## Done When

- 라우팅 기준이 UI 또는 코드 구조에 드러난다.
- specialist 선택 근거가 설명 가능하다.
- fallback 경로가 존재한다.
- 제품 스펙과 공통 done criteria를 만족한다.
- **`reports/evaluation_report.json`이 존재하고, final_score ≥ 7.0 이다.**

## Forbidden

- router 없이 사실상 고정 파이프라인으로 처리하기
- specialist 간 차이를 설명하지 못하는 상태
- 스펙 외 백엔드/API 서버 추가


## UX Benchmark v2 Directive (additive)

이 하네스의 결과 UI 메타포는 **decision-tree routing shell** 다. 라우터 특성을 반영해 **decision tree / specialist routing shell** 중심 UX로 구현한다.

### v2 규칙

- 왜 특정 specialist path가 선택되었는지 사용자가 이해할 수 있어야 한다.
- fallback path도 설명 가능해야 한다.
- 기본 화면은 routing decision과 현재 specialist progress를 중심으로 구성한다.
- 내부 evidence는 별도 decision log나 debug route로 분리한다.

### v2 금지 패턴

- 기본 사용자 화면을 한 페이지 evidence board처럼 만들기
- scorecard/run artifact/review trace를 hero 근처에 모두 전면 노출하기
- 현재 단계와 다음 행동이 모호한 상태로 구현하기

