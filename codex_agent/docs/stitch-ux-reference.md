# stitch-ux-reference.md - Stitch MCP 기반 UI/UX 기준

이 문서는 Stitch MCP를 어떻게 사용해야 하는지 정의한다.
Stitch는 단순 레퍼런스 조회 도구가 아니라 **디자인의 주된 창의적 원천**이다.

## Stitch 프로젝트
- Project: `projects/11015732894783859302`
- Title: `codex_agent orchestrator_worker UX loop`

## 사용 원칙

**코드를 작성하기 전에 반드시 Stitch를 탐색한다.**

구체적으로:
1. `get_design_system` 또는 `list_components`로 사용 가능한 컴포넌트/토큰 전체를 파악한다.
2. 작업 중인 harness의 성격에 맞는 패턴을 검색한다.
   - 블로그 생성기 계열: `wizard`, `multi-step`, `stepper`, `onboarding`, `article`, `editor`, `publish`
   - 파이프라인 계열: `pipeline`, `stage`, `progress`, `flow`, `timeline`
   - 라우터/분기 계열: `decision`, `routing`, `branch`, `selector`
3. 찾은 패턴에서 color token, typography scale, spacing, 인터랙션 모델을 추출한다.
4. 화면 전환 방식을 Stitch에서 결정한다. 단일 스크롤 페이지는 Stitch에서 명시적으로 권장하지 않는 한 선택하지 않는다.

## 기존 등록 화면 (검증 기준, 유일한 기준이 아님)

아래 screen들은 과거 사이클에서 만들어진 기준점이다.
**더 나은 Stitch 패턴이 발견되면 아래 기준을 그대로 따르지 않아도 된다.**

### orchestrator_worker
- Screen: `projects/11015732894783859302/screens/a9c46f1393b341f8bb24da291814c1d2`
- 요약: 입력 상단 배치, stage tracker 단일 활성 단계, ownership board 3 카드, evidence drawer 격리

### parallel_sections
- Screen: `projects/11015732894783859302/screens/d8a6e9d589d7433181abc1a96b8c6108`
- 요약: 3 lane board, merge rail 시각화, evidence drawer 격리

### router
- Screen: `projects/11015732894783859302/screens/c006565d81214e89b6d9f52928b4003f`
- 요약: compact brief + routing decision card, specialist board, evidence drawer 격리

### single_agent / sequential_pipeline / evaluator_optimizer / omx_evaluator_optimizer
- 전용 screen 없음. Stitch에서 harness 성격에 맞는 패턴을 직접 탐색해 결정한다.
- 공통 asset `assets/2271c2a16ec8460c91f7d85b87099fe9` (Slate Orchestrator)는 color/typography 기준으로만 참고한다.

## 화면 흐름 원칙

모든 harness는 다음을 기본으로 한다:

- **입력 화면**: 사용자가 파라미터를 설정하고 생성을 시작하는 단독 화면
- **진행 화면**: 각 파이프라인 단계가 순서대로 드러나는 화면 (모든 결과물을 동시에 펼치지 않는다)
- **결과 화면**: 최종 산출물 + export action이 중심인 화면

화면 간 전환은 버튼 클릭, 단계 완료 이벤트, 또는 route 변경으로 한다.
Stitch에서 더 적합한 패턴을 찾으면 이 기본 구조보다 그 패턴을 우선한다.

## 자동화 루프에서의 사용 규칙

1. 코드 수정 전 반드시 Stitch MCP를 호출해 관련 컴포넌트/패턴을 탐색한다.
2. 탐색 결과를 `{artifact_dir}/designer-notes.md`에 기록한다 (어떤 검색어를 썼고 무엇을 찾았는지).
3. Stitch에서 찾은 token/component를 코드에 직접 반영한다.
4. Stitch 수정 후에는 Playwright smoke/journey + browser review를 다시 수행한다.
5. 브라우저 검증 시 `python3 scripts/harness_preview.py ensure <harness>`로 안정 URL을 먼저 확보한다.
