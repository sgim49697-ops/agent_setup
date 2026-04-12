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
   HARNESS=single_agent uv run python scripts/evaluate.py
   ```

4. 통과 기준 확인:
   - L1 Playwright smoke pass rate ≥ 80%
   - L2 빌드 성공
   - L3 overall_score ≥ 6.0
   - `reports/evaluation_report.json` 존재

5. 미달 시 코드 수정 후 다시 빌드 → 평가 반복

UI가 Playwright 테스트를 통과하려면 `benchmark/evaluation_guide.md`의 "테스트 통과를 위한 UI 구현 필수사항" 섹션을 참고한다.

## Done When

- `spec/`의 제품 스펙과 `harness/done_criteria.md`를 만족한다.
- 앱이 로컬에서 실행 가능하다.
- 필수 단계 UI와 export 액션이 존재한다.
- 결과 보고서 파일을 남긴다.
- **`reports/evaluation_report.json`이 존재하고, final_score ≥ 7.0 이다.**

## Forbidden

- 스펙 외 백엔드/API 서버 추가
- 인증, 저장, CMS 배포 기능 추가
- 요구사항에 없는 페이지 수 확장
- 하네스 구조를 multi-agent처럼 바꾸기


## UX Benchmark v2 Directive (additive)

이 하네스의 결과 UI 메타포는 **focused wizard** 다. 하나의 주 에이전트 흐름을 반영해 **집중형 wizard** 또는 step-by-step single-owner flow로 구현한다.

### v2 규칙

- 기본 사용자 화면은 현재 step과 다음 행동만 강조한다.
- 한 화면에 모든 산출물을 동시에 펼치지 않는다.
- evidence/scorecard/artifact는 debug drawer, collapsed section, 또는 별도 route로 분리한다.
- 사용자는 `Brief -> Research -> Outline -> Draft -> Review -> Final/Export`를 잃지 않고 따라갈 수 있어야 한다.

### v2 금지 패턴

- 기본 사용자 화면을 한 페이지 evidence board처럼 만들기
- scorecard/run artifact/review trace를 hero 근처에 모두 전면 노출하기
- 현재 단계와 다음 행동이 모호한 상태로 구현하기

